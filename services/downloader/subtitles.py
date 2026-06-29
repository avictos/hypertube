import logging
import re
from io import BytesIO
from pathlib import Path

from schema import Subtitle

log = logging.getLogger("hypertube")

# YTS/YIFY subtitle packs bundle files under a "Subs/" folder using ISO 639-2/B
# ("bibliographic") 3-letter codes in the filename, e.g. "British.eng.srt" or
# "Latin American.spa.srt". Map the ones we expose as a user-selectable
# preferred language to ISO 639-1, since that's what the rest of the app uses.
LANG_CODE_MAP: dict[str, tuple[str, str]] = {
    "eng": ("en", "English"),
    "spa": ("es", "Spanish"),
    "fre": ("fr", "French"),
    "ger": ("de", "German"),
    "ita": ("it", "Italian"),
    "por": ("pt", "Portuguese"),
    "ara": ("ar", "Arabic"),
    "hin": ("hi", "Hindi"),
    "jpn": ("ja", "Japanese"),
    "kor": ("ko", "Korean"),
    "chi": ("zh", "Chinese"),
    "rus": ("ru", "Russian"),
    "tur": ("tr", "Turkish"),
}

_TIMESTAMP_RE = re.compile(r"(\d{2}:\d{2}:\d{2}),(\d{3})")


def srt_to_vtt(srt_text: str) -> str:
    body = _TIMESTAMP_RE.sub(r"\1.\2", srt_text.replace("\r\n", "\n").strip())
    return f"WEBVTT\n\n{body}\n"


def find_bundled_subtitles(info) -> dict[str, dict]:
    """
    Scans a parsed .torrent (`lt.torrent_info`) for subtitle files bundled in
    a "Subs/" folder alongside the video. Returns
    {iso2_code: {"file_index": int, "rel_path": str, "language_name": str}},
    picking the first match per language found.
    """
    fs = info.files()
    found: dict[str, dict] = {}
    for i in range(fs.num_files()):
        rel_path = fs.file_path(i).replace("\\", "/")
        if "/Subs/" not in f"/{rel_path}":
            continue
        if not rel_path.lower().endswith(".srt"):
            continue

        stem = Path(rel_path).stem
        for segment in stem.split("."):
            mapped = LANG_CODE_MAP.get(segment.lower())
            if mapped:
                iso2, name = mapped
                if iso2 not in found:
                    found[iso2] = {
                        "file_index": i,
                        "rel_path": rel_path,
                        "language_name": name,
                    }
                break
    return found


def store_bundled_subtitle(
    minio_client,
    db,
    save_path: Path,
    download_id,
    lang_code: str,
    lang_name: str,
    rel_path: str,
) -> None:
    """Reads a now-fully-downloaded subtitle file off disk, converts it to
    WebVTT, uploads it to MinIO, and records it in the `subtitles` table.
    Caller is responsible for committing `db`."""
    already = (
        db.query(Subtitle)
        .filter_by(download_id=download_id, language_code=lang_code)
        .first()
    )
    if already:
        log.info("⏭️  [%s] %s subtitle already stored, skipping", download_id, lang_code)
        return

    local_path = save_path / rel_path
    srt_text = local_path.read_text(encoding="utf-8", errors="replace")
    vtt_text = srt_to_vtt(srt_text)
    vtt_bytes = vtt_text.encode("utf-8")

    minio_path = f"{download_id}/{lang_code}.vtt"
    minio_client.put_object(
        "subtitles",
        minio_path,
        BytesIO(vtt_bytes),
        length=len(vtt_bytes),
        content_type="text/vtt",
    )

    db.add(
        Subtitle(
            download_id=download_id,
            language_code=lang_code,
            language_name=lang_name,
            original_filename=Path(rel_path).name,
            minio_path=minio_path,
        )
    )
    log.info("✅ [%s] stored bundled %s subtitle at %s", download_id, lang_code, minio_path)
