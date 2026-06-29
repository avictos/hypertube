# This is the old working version of the code.

import os
import time
import uuid
import threading
import logging
import subprocess
import shutil
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import libtorrent as lt
import mimetypes
from minio import Minio
from minio.error import S3Error

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
from schema import Movie, Torrent, Download, DownloadState, StorageProvider, SourceType, UserPlayback, Subtitle
from subtitles import find_bundled_subtitles, store_bundled_subtitle

load_dotenv()

# ─── LOGGING ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s.%(msecs)03d [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("hypertube")

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/hypertube")
engine       = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

MINIO_CLIENT = Minio(
    os.getenv("MINIO_ENDPOINT", "localhost:9000"),
    access_key=os.getenv("MINIO_ROOT_USER",    "minioadmin"),
    secret_key=os.getenv("MINIO_ROOT_PASSWORD", "f79d5014f52f1c2194d55ebbdb78c924c40054a0ba345ba965c6c9eac32aa519"),
    secure=os.getenv("MINIO_SECURE", "false").lower() == "true",
)

BASE_DOWNLOAD_DIR = Path("./downloaded_movies")
BASE_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
Path("./torrents").mkdir(parents=True, exist_ok=True)

downloads: dict[str, dict] = {}
# Guards `downloads` + any ses.remove_torrent/add_torrent pair against the
# background engine loop running concurrently — without this, removing a
# stale duplicate-hash handle from a request thread can yank it out from
# under the engine loop mid-tick (RuntimeError: invalid torrent handle used),
# which previously crashed the whole loop permanently.
engine_lock = threading.RLock()

# ─── TUNING ───────────────────────────────────────────────────────────────────
# INITIAL_BUFFER_PIECES = 5    # pieces needed before player is allowed to open
STREAM_WINDOW_PIECES  = 60   # lookahead window while streaming (~90 MB at 1494 kB/piece)
IDLE_PAUSE_SECONDS    = 30.0 # only zero priorities after 30s of zero activity AND no active wait
# No artificial chunk cap — serve the full requested range so the browser
# can compute video duration from Content-Length + Content-Range headers.

# ─── LIBTORRENT SESSION ───────────────────────────────────────────────────────
ses = lt.session()
ses.apply_settings({
    'listen_interfaces':          '0.0.0.0:6881,0.0.0.0:6891',
    'enable_dht':                 True,
    'close_redundant_connections': True,
})

# ─── MODELS ───────────────────────────────────────────────────────────────────
class StartRequest(BaseModel):
    movie_id: str
    preferred_language: str | None = None

class StatusResponse(BaseModel):
    download_id:            str
    phase:                  str
    lifecycle_state:        str
    activity:               str
    progress_percent:       float
    downloaded_pieces:      int
    total_pieces:           int
    piece_length:           int
    total_size_bytes:       int
    downloaded_bytes:       int
    uploaded_bytes:         int
    torrent_name:           str
    download_rate_kb:       float
    upload_rate_kb:         float
    share_ratio:            float
    num_peers:              int
    is_ready_for_streaming: bool
    # debug fields
    current_piece:          int
    prioritized_pieces:     list[int]

# ─── HELPERS ──────────────────────────────────────────────────────────────────
def _activity(dl_kb: float, ul_kb: float) -> str:
    if dl_kb > 0.5:  return "downloading"
    if ul_kb > 0.5:  return "uploading"
    return "idle"


def _set_only_pieces(handle: lt.torrent_handle, total: int,
                     wanted: list[int], urgency: int = 7) -> None:
    """Set priorities so ONLY `wanted` pieces are non-zero. Thread-safe caller must hold lock."""
    p = [0] * total
    for i in wanted:
        if 0 <= i < total:
            p[i] = urgency
    handle.prioritize_pieces(p)
    # log.debug("  prioritize_pieces: %s (urgency=%d)", wanted[:10], urgency)


def _piece_range_for_file(offset: int, size: int, piece_length: int, total_pieces: int) -> tuple[int, int]:
    first = offset // piece_length
    last = min((offset + size - 1) // piece_length, total_pieces - 1)
    return first, last


def _preallocate_file(path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size == size:
        # log.debug("  prealloc skip – already %d bytes: %s", size, path)
        return
    log.info("📁 Pre-allocating %.2f GB → %s", size / 1024**3, path)
    with open(path, "wb") as f:
        chunk  = 64 * 1024 * 1024
        remain = size
        while remain > 0:
            n = min(chunk, remain)
            f.write(b"\x00" * n)
            remain -= n
    log.info("📁 Pre-allocation done: %s", path)


def load_torrent_into_engine(download_id: uuid.UUID,
                              torrent_file_path: str,
                              skip_prealloc: bool = False,
                              existing_subtitle_codes: set[str] | None = None) -> bool:
    try:
        info = lt.torrent_info(torrent_file_path)
    except Exception as e:
        log.error("❌ [%s] Cannot parse torrent: %s", download_id, e)
        return False

    fs          = info.files()
    n_files     = fs.num_files()
    largest_idx = max(range(n_files), key=lambda i: fs.file_size(i))

    video_rel   = fs.file_path(largest_idx)
    video_size  = fs.file_size(largest_idx)
    video_off   = fs.file_offset(largest_idx)
    total_p     = info.num_pieces()
    p_len       = info.piece_length()
    total_size  = info.total_size()

    save_path      = BASE_DOWNLOAD_DIR / str(download_id)
    video_abs_path = save_path / video_rel

    log.info("🔧 [%s] torrent: %d pieces × %d kB = %.2f GB, video offset=%d",
             download_id, total_p, p_len // 1024, total_size / 1024**3, video_off)

    if not skip_prealloc:
        _preallocate_file(video_abs_path, video_size)

    # If a torrent with this exact info-hash is already attached to the
    # session (e.g. a stale handle left over from a Download row that was
    # deleted some other way than the cleanup loop — like a movie-metadata
    # refresh cascading the FK — without ever calling ses.remove_torrent),
    # adding it again would collide: libtorrent treats it as the same
    # torrent, so have_piece() would reflect the OLD handle's state while we
    # read/write against this NEW download's save_path, corrupting both the
    # video stream and subtitle extraction. Drop the stale handle first.
    with engine_lock:
        for old_handle in ses.get_torrents():
            try:
                if old_handle.is_valid() and old_handle.info_hash() == info.info_hash():
                    log.warning("⚠️  [%s] removing stale duplicate torrent handle (same info-hash)", download_id)
                    for stale_id, stale_d in list(downloads.items()):
                        if stale_d.get('handle') is old_handle:
                            del downloads[stale_id]
                    ses.remove_torrent(old_handle)
            except Exception as e:
                log.warning("Failed to check/remove stale torrent handle: %s", e)

    params = {
        'save_path':    str(save_path),
        'storage_mode': lt.storage_mode_t.storage_mode_allocate,
        'ti':           info,
    }
    handle = ses.add_torrent(params)

    # ─── CALCULATE DYNAMIC INITIAL BUFFER ─────────────────────────────────────
    # Strictly target 30 MB for the initial buffer
    target_bytes = 30 * 1024 * 1024
    
    # Ensure we download at least 1 piece if the torrent's piece size > 30MB
    target_bytes = max(target_bytes, p_len)
    initial_pieces_count = int((target_bytes + p_len - 1) // p_len)
    
    # Calculate the exact piece where the video file begins to skip junk files
    first_video_piece = video_off // p_len
    last_video_piece = min(first_video_piece + initial_pieces_count, total_p)
    actual_pieces_wanted = last_video_piece - first_video_piece

    wanted_pieces = set(range(first_video_piece, last_video_piece))

    # Subtitles bundled in the torrent (under a "Subs/" folder) are tiny —
    # piggyback their pieces onto the same initial-buffer priority pass so
    # they land within seconds, instead of needing a separate fetch step.
    # Grab every bundled language found (minus any we already stored for
    # this download), not just English/preferred — extraction is free since
    # the torrent is already being downloaded for the video itself.
    pending_subtitles: dict[str, dict] = {}
    bundled = find_bundled_subtitles(info)
    wanted_subtitle_languages = set(bundled.keys()) - (existing_subtitle_codes or set())
    if wanted_subtitle_languages:
        for lang_code in wanted_subtitle_languages:
            match = bundled.get(lang_code)
            if not match:
                continue
            sub_idx = match["file_index"]
            first_p, last_p = _piece_range_for_file(
                fs.file_offset(sub_idx), fs.file_size(sub_idx), p_len, total_p
            )
            wanted_pieces.update(range(first_p, last_p + 1))
            pending_subtitles[lang_code] = {
                "rel_path": match["rel_path"],
                "language_name": match["language_name"],
                "first_piece": first_p,
                "last_piece": last_p,
            }

    wanted = sorted(wanted_pieces)
    _set_only_pieces(handle, total_p, wanted)

    log.info("🚀 [%s] Loaded – buffering %d pieces (%.2f MB) starting at piece %d",
             download_id, actual_pieces_wanted, target_bytes / 1024**2, first_video_piece)
    if pending_subtitles:
        log.info("📝 [%s] also fetching bundled subtitles: %s",
                 download_id, ", ".join(pending_subtitles.keys()))

    dl_id_str = str(download_id)
    downloads[dl_id_str] = {
        'download_id':   dl_id_str,
        'torrent_name':  info.name(),
        'handle':        handle,
        'video_path':    str(video_abs_path),
        'video_offset':  video_off,
        'video_size':    video_size,
        'save_path':     save_path,
        'pending_subtitles': pending_subtitles,
        'metadata': {
            'total_pieces': total_p,
            'piece_length': p_len,
            'total_size':   total_size,
            'first_video_piece': first_video_piece,
            'initial_buffer_pieces': actual_pieces_wanted,
        },

        'phase':         0,
        'lock':          threading.RLock(),
        'active_token':  0,
        'last_activity': time.time(),
        'waiting_for_piece': False,
        'current_piece': -1,
        'prioritized_pieces': [],
        'phase_label':            'buffering',
        'lifecycle_state':        'DOWNLOADING',
        'activity':               'idle',
        'progress':               0.0,
        'downloaded_pieces':      0,
        'downloaded_bytes':       0,
        'uploaded_bytes':         0,
        'download_rate_kb':       0.0,
        'upload_rate_kb':         0.0,
        'share_ratio':            0.0,
        'num_peers':              0,
        'is_ready_for_streaming': False,
    }
    return True


# ─── STARTUP SCAN ─────────────────────────────────────────────────────────────
def scan_and_seed_completed_downloads(db) -> None:
    log.info("🔍 Scanning for completed downloads to resume seeding…")
    for ddir in BASE_DOWNLOAD_DIR.iterdir():
        if not ddir.is_dir():
            continue
        dl_id_str = ddir.name
        try:
            download_id = uuid.UUID(dl_id_str)
        except ValueError:
            continue
        if dl_id_str in downloads:
            continue

        torrent_path: str | None = f"./torrents/{dl_id_str}.torrent"
        if not os.path.exists(torrent_path):
            torrent_files = list(ddir.glob("*.torrent"))
            if torrent_files:
                torrent_path = str(torrent_files[0])
            else:
                db_dl = db.query(Download).filter_by(id=download_id).first()
                if db_dl and db_dl.torrent_id:
                    cand = f"./torrents/{db_dl.torrent_id}.torrent"
                    torrent_path = cand if os.path.exists(cand) else None

        if not torrent_path or not os.path.exists(torrent_path):
            continue

        existing_codes = {
            s.language_code
            for s in db.query(Subtitle).filter_by(download_id=download_id).all()
        }
        if load_torrent_into_engine(download_id, torrent_path, skip_prealloc=True,
                                     existing_subtitle_codes=existing_codes):
            d = downloads[dl_id_str]
            d['phase']                = 2
            d['phase_label']          = 'seeding'
            d['lifecycle_state']      = 'COMPLETED'
            d['activity']             = 'idle'
            d['progress']             = 100.0
            d['is_ready_for_streaming'] = True
            handle = d['handle']
            total  = d['metadata']['total_pieces']
            handle.prioritize_pieces([1] * total)
            log.info("✅ Seeding resumed: %s", dl_id_str)


# ─── BACKGROUND ENGINE LOOP ───────────────────────────────────────────────────
def global_engine_loop() -> None:
    log.info("🔁 Engine loop started")
    while True:
        with SessionLocal() as db, engine_lock:
            for dl_id_str, d in list(downloads.items()):
                handle = d['handle']
                try:
                    s = handle.status()
                except RuntimeError:
                    # Defensive fallback — shouldn't happen now that
                    # load_torrent_into_engine's stale-handle removal holds
                    # the same lock, but don't crash the whole loop if it does.
                    log.warning("⚠️  [%s] handle invalidated mid-loop — dropping", dl_id_str[:8])
                    downloads.pop(dl_id_str, None)
                    continue
                meta         = d['metadata']
                total_pieces = meta['total_pieces']
                total_size   = meta['total_size']

                ul_bytes = s.all_time_upload
                dl_done  = s.total_done
                dl_kb    = s.download_rate / 1000
                ul_kb    = s.upload_rate  / 1000

                d['progress']          = min(100.0, (dl_done / total_size * 100) if total_size else 0.0)
                d['downloaded_pieces'] = s.num_pieces
                d['downloaded_bytes']  = dl_done
                d['uploaded_bytes']    = ul_bytes
                d['download_rate_kb']  = dl_kb
                d['upload_rate_kb']    = ul_kb
                d['share_ratio']       = (ul_bytes / s.all_time_download) if s.all_time_download > 0 else 0.0
                d['num_peers']         = s.num_peers
                d['activity']          = _activity(dl_kb, ul_kb)

                db_dl = db.query(Download).filter_by(id=uuid.UUID(dl_id_str)).first()
                if db_dl:
                    db_dl.progress         = d['progress']
                    db_dl.downloaded_bytes = dl_done
                    db_dl.total_bytes      = total_size

                # ── bundled subtitles: store each one as soon as its (tiny)
                # piece range finishes downloading, independent of phase ────
                pending_subs = d.get('pending_subtitles')
                if pending_subs:
                    for lang_code in list(pending_subs.keys()):
                        sub = pending_subs[lang_code]
                        if all(
                            handle.have_piece(p)
                            for p in range(sub['first_piece'], sub['last_piece'] + 1)
                        ):
                            try:
                                store_bundled_subtitle(
                                    MINIO_CLIENT, db, d['save_path'],
                                    uuid.UUID(dl_id_str), lang_code,
                                    sub['language_name'], sub['rel_path'],
                                )
                                # Only stop tracking once it actually lands —
                                # a transient read failure (e.g. the piece was
                                # just marked "have" but the write hasn't
                                # flushed to disk yet) should retry next tick,
                                # not be abandoned permanently.
                                del pending_subs[lang_code]
                            except Exception as e:
                                log.warning("Failed to store %s subtitle for [%s], will retry: %s",
                                            lang_code, dl_id_str[:8], e)

                # ── phase 0: buffering ───────────────────────────────────────
                if d['phase'] == 0:
                    d['phase_label']     = 'buffering'
                    d['lifecycle_state'] = 'DOWNLOADING'
                    
                    # Fetch the dynamic target we calculated during load
                    target_pieces = meta.get('initial_buffer_pieces', 1)
                    
                    initial_ok = all(
                        handle.have_piece(i) for i in range(target_pieces)
                    )
                    
                    if initial_ok:
                        with d['lock']:
                            _set_only_pieces(handle, total_pieces, [])
                            d['prioritized_pieces'] = []
                            
                        d['phase']                = 1
                        d['phase_label']          = 'ready'
                        d['is_ready_for_streaming'] = True
                        if db_dl:
                            db_dl.state = DownloadState.DOWNLOADING
                        log.info("✅ [%s] Initial buffer done (%d pieces) – ready for streaming", dl_id_str, target_pieces)

                # ── phase 1: on-demand streaming ────────────────────────────
                elif d['phase'] == 1:
                    if s.num_pieces >= total_pieces:
                        d['phase']           = 2
                        d['phase_label']     = 'seeding'
                        d['lifecycle_state'] = 'COMPLETED'
                        d['progress']        = 100.0
                        handle.prioritize_pieces([1] * total_pieces)
                        if db_dl:
                            db_dl.state            = DownloadState.COMPLETED
                            db_dl.storage_provider = StorageProvider.LOCAL_DISK
                        log.info("🌱 [%s] Fully seeded", dl_id_str)
                    else:
                        d['phase_label']     = 'streaming'
                        d['lifecycle_state'] = 'DOWNLOADING'
                        if db_dl:
                            db_dl.state = DownloadState.DOWNLOADING

                        # Log piece/rate info every loop tick for visibility
                        # cp = d.get('current_piece', -1)
                        # pw = d.get('prioritized_pieces', [])
                        # log.debug(
                        #     "[%s] phase=1 piece=%d peers=%d dl=%.1f kB/s ul=%.1f kB/s "
                        #     "priority_window=%s paused=%s",
                        #     dl_id_str[:8], cp, s.num_peers, dl_kb, ul_kb,
                        #     (f"{pw[0]}–{pw[-1]}" if pw else "[]"),
                        #     s.paused,
                        # )

                        # Idle watchdog — only zero priorities when the generator
                        # has genuinely stopped (not mid-wait) AND no new request
                        # has arrived for IDLE_PAUSE_SECONDS.
                        # NEVER zero priorities while waiting_for_piece=True — that
                        # was the root cause of the 16s piece-5 stall.
                        is_waiting = d.get('waiting_for_piece', False)
                        idle_secs  = time.time() - d.get('last_activity', time.time())

                        if is_waiting:
                            # log.debug("  [%s] watchdog: skip – waiting for piece %d",
                            #           dl_id_str[:8], d.get('current_piece', -1))
                            pass
                        elif idle_secs > IDLE_PAUSE_SECONDS and not d.get('prioritized_pieces'):
                            # Already zeroed — nothing to do, just log occasionally
                            pass
                        elif idle_secs > IDLE_PAUSE_SECONDS and d.get('prioritized_pieces'):
                            with d['lock']:
                                _set_only_pieces(handle, total_pieces, [])
                                d['prioritized_pieces'] = []
                            d['activity']         = 'idle'
                            d['download_rate_kb'] = 0.0
                            log.info("⏸  [%s] Truly idle %.1fs – zeroed priorities",
                                     dl_id_str[:8], idle_secs)

                # ── phase 2: seeding ─────────────────────────────────────────
                elif d['phase'] == 2:
                    d['phase_label']     = 'seeding'
                    d['lifecycle_state'] = 'COMPLETED'
                    if db_dl:
                        db_dl.state            = DownloadState.COMPLETED
                        db_dl.storage_provider = StorageProvider.LOCAL_DISK

            db.commit()
        time.sleep(2)


def daily_cleanup_loop() -> None:
    log.info("🧹 TEST Cleanup loop started (checks every 10s, 2-min cutoff)")

    CUTOFF_SECONDS = 12 * 3600  # change to 30*24*60*60 in prod

    while True:
        try:
            with SessionLocal() as db:
                cutoff_unix = time.time() - CUTOFF_SECONDS
                cutoff_dt   = datetime.now(timezone.utc) - timedelta(seconds=CUTOFF_SECONDS)

                for dl in db.query(Download).all():
                    dl_id_str = str(dl.id)

                    # IDLE rows only exist as subtitle-prefetch anchors (see
                    # /subtitles/prefetch) — they never touch disk or the
                    # libtorrent engine, so there's nothing to clean up, and
                    # deleting them would cascade-delete their Subtitle rows
                    # for no reason.
                    if dl.state == DownloadState.IDLE:
                        continue

                    # Live download: trust the in-memory last_activity. It only
                    # advances when /stream or /seek hands out bytes, NOT when
                    # the engine loop ticks. This is the actual "user touched it"
                    # signal we want for cleanup.
                    if dl_id_str in downloads:
                        last_user_activity_unix = downloads[dl_id_str].get('last_activity', time.time())
                        is_stale = last_user_activity_unix < cutoff_unix
                    else:
                        # Not loaded: fall back to DB row mtime.
                        last_db = dl.updated_at
                        if last_db.tzinfo is None:
                            last_db = last_db.replace(tzinfo=timezone.utc)
                        is_stale = last_db < cutoff_dt

                    # Either way, recent playback keeps it alive.
                    latest_playback = (
                        db.query(UserPlayback)
                        .filter(UserPlayback.download_id == dl.id)
                        .order_by(UserPlayback.updated_at.desc())
                        .first()
                    )
                    if latest_playback and latest_playback.updated_at:
                        pb = latest_playback.updated_at
                        if pb.tzinfo is None:
                            pb = pb.replace(tzinfo=timezone.utc)
                        if pb >= cutoff_dt:
                            is_stale = False

                    if not is_stale:
                        continue

                    log.info("🗑️  Deleting inactive download [%s]", dl_id_str[:8])

                    if dl_id_str in downloads:
                        try:
                            ses.remove_torrent(downloads[dl_id_str]['handle'])
                        except Exception as e:
                            log.warning("remove_torrent failed: %s", e)
                        del downloads[dl_id_str]

                    movie_dir = BASE_DOWNLOAD_DIR / dl_id_str
                    if movie_dir.exists():
                        shutil.rmtree(movie_dir, ignore_errors=True)

                    torrent_file = Path(f"./torrents/{dl.torrent_id}.torrent")
                    if torrent_file.exists():
                        torrent_file.unlink()

                    db.delete(dl)

                db.commit()
        except Exception as e:
            log.error("❌ Error in cleanup loop: %s", e, exc_info=True)

        time.sleep(10)

# ─── LIFESPAN ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("🔄 Booting Hypertube Engine…")
    with SessionLocal() as db:
        active = db.query(Download).filter(
            Download.state.in_([DownloadState.DOWNLOADING, DownloadState.FETCHING_METADATA])
        ).all()
        for dl in active:
            tp = f"./torrents/{dl.torrent_id}.torrent"
            if not os.path.exists(tp):
                t = db.query(Torrent).filter_by(id=dl.torrent_id).first()
                if t and t.minio_torrent_path:
                    try:
                        MINIO_CLIENT.fget_object("torrents", t.minio_torrent_path, tp)
                    except S3Error:
                        continue
            existing_codes = {
                s.language_code
                for s in db.query(Subtitle).filter_by(download_id=dl.id).all()
            }
            load_torrent_into_engine(dl.id, tp, existing_subtitle_codes=existing_codes)
        scan_and_seed_completed_downloads(db)

    # Start the libtorrent watchdog
    threading.Thread(target=global_engine_loop, daemon=True).start()
    
    # Start the 30-day automatic file cleanup watchdog
    threading.Thread(target=daily_cleanup_loop, daemon=True).start()
    
    yield
    log.info("🛑 Shutting down…")


app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ─── /start ───────────────────────────────────────────────────────────────────
@app.post("/start")
def start_download(req: StartRequest):
    movie_id = req.movie_id
    with SessionLocal() as db:
        movie = db.query(Movie).filter_by(id=movie_id).first()
        if not movie:
            raise HTTPException(404, "Movie not found")

        existing = db.query(Download).filter_by(movie_id=movie_id).first()
        if existing:
            dl_str = str(existing.id)
            existing_codes = {
                s.language_code
                for s in db.query(Subtitle).filter_by(download_id=existing.id).all()
            }

            if dl_str in downloads:
                log.info("/start [%s] already active", dl_str[:8])
                return {"download_id": dl_str, "message": "Already active"}
            if existing.state == DownloadState.COMPLETED:
                if dl_str not in downloads:
                    tp = f"./torrents/{existing.torrent_id}.torrent"
                    if os.path.exists(tp):
                        load_torrent_into_engine(
                            existing.id, tp, skip_prealloc=True,
                            existing_subtitle_codes=existing_codes,
                        )
                        d = downloads.get(dl_str)
                        if d:
                            d['phase']                = 2
                            d['phase_label']          = 'seeding'
                            d['lifecycle_state']      = 'COMPLETED'
                            d['is_ready_for_streaming'] = True
                            d['handle'].prioritize_pieces([1] * d['metadata']['total_pieces'])
                return {"download_id": dl_str, "message": "Already completed"}

        torrent = db.query(Torrent).filter_by(movie_id=movie_id).first()
        if not torrent:
            raise HTTPException(404, "No torrent for this movie")

        new_dl = Download(
            torrent_id=torrent.id,
            movie_id=movie.id,
            session_id=uuid.uuid4(),
            source_type=SourceType.TORRENT_FILE,
            source_uri=torrent.torrent_file_url,
            state=DownloadState.FETCHING_METADATA,
        )
        db.add(new_dl)
        db.commit()
        db.refresh(new_dl)
        download_id = new_dl.id
        torrent_id  = torrent.id
        minio_path  = torrent.minio_torrent_path

    tp = f"./torrents/{torrent_id}.torrent"
    if not os.path.exists(tp):
        if not minio_path:
            raise HTTPException(500, "Torrent has no MinIO path")
        try:
            MINIO_CLIENT.fget_object("torrents", minio_path, tp)
        except S3Error as e:
            raise HTTPException(500, f"Failed to fetch .torrent from MinIO: {e}")

    if not load_torrent_into_engine(download_id, tp):
        raise HTTPException(500, "Failed to load torrent into engine")

    # ─── BLOCK UNTIL ENGINE LOOP CONFIRMS BUFFERING IS DONE ───────────────────
    dl_str = str(download_id)
    max_wait_seconds = 55  
    start_time = time.time()
    
    while True:
        if dl_str not in downloads:
            raise HTTPException(500, "Download removed from engine unexpectedly.")

        d = downloads[dl_str]

        # Once the engine loop sets phase to 1, we know the 30MB/3% rule is met
        if d['phase'] >= 1:
            return {
                "download_id": dl_str,
                "message": "Ready for streaming",
                "is_ready_for_streaming": True
            }

        # Timeout reached: Return gracefully
        if time.time() - start_time > max_wait_seconds:
            return {
                "download_id": dl_str,
                "message": "Buffering is taking longer than expected. Please poll /status.",
                "is_ready_for_streaming": False
            }

        time.sleep(0.5)  # Check twice a second


# ─── /status helpers ──────────────────────────────────────────────────────────
def _status_response(dl_id_str: str, d: dict) -> StatusResponse:
    return StatusResponse(
        download_id=dl_id_str,
        phase=d['phase_label'],
        lifecycle_state=d['lifecycle_state'],
        activity=d['activity'],
        progress_percent=d['progress'],
        downloaded_pieces=d['downloaded_pieces'],
        total_pieces=d['metadata']['total_pieces'],
        piece_length=d['metadata']['piece_length'],
        total_size_bytes=d['metadata']['total_size'],
        downloaded_bytes=d.get('downloaded_bytes', 0),
        uploaded_bytes=d.get('uploaded_bytes', 0),
        torrent_name=d.get('torrent_name', ''),
        download_rate_kb=d.get('download_rate_kb', 0.0),
        upload_rate_kb=d.get('upload_rate_kb', 0.0),
        share_ratio=d.get('share_ratio', 0.0),
        num_peers=d.get('num_peers', 0),
        is_ready_for_streaming=d['is_ready_for_streaming'],
        current_piece=d.get('current_piece', -1),
        prioritized_pieces=d.get('prioritized_pieces', []),
    )


@app.get("/status")
def status(download_id: str):
    if download_id not in downloads:
        raise HTTPException(404, "Download not active in engine")
    return _status_response(download_id, downloads[download_id])


@app.get("/status/movie/{movie_id}")
def status_by_movie(movie_id: str):
    with SessionLocal() as db:
        db_dl = db.query(Download).filter_by(movie_id=movie_id).first()
        if not db_dl:
            return {
                "download_id": None, "phase": "idle",
                "lifecycle_state": "IDLE", "activity": "idle",
                "progress_percent": 0.0, "downloaded_bytes": 0,
                "total_size_bytes": 0, "is_ready_for_streaming": False,
                "current_piece": -1, "prioritized_pieces": [],
            }
        dl_str = str(db_dl.id)

    if dl_str in downloads:
        return _status_response(dl_str, downloads[dl_str])

    return {
        "download_id": dl_str,
        "phase": "seeding" if db_dl.state == DownloadState.COMPLETED else "idle",
        "lifecycle_state": db_dl.state.value, "activity": "idle",
        "progress_percent": db_dl.progress or 0.0,
        "downloaded_bytes": db_dl.downloaded_bytes or 0,
        "total_size_bytes": db_dl.total_bytes or 0,
        "is_ready_for_streaming": db_dl.state == DownloadState.COMPLETED,
        "current_piece": -1, "prioritized_pieces": [],
    }


# ─── /seek/{download_id} ──────────────────────────────────────────────────────
@app.post("/seek/{download_id}")
def seek_hint(download_id: str, body: dict):
    """
    Called by the frontend onSeeking BEFORE the browser's Range request arrives.
    Pre-prioritises the piece window at byte_offset so libtorrent starts fetching
    immediately. Does NOT bump active_token — that belongs to /stream only.
    """
    if download_id not in downloads:
        return {"ok": False, "reason": "not found"}
    d = downloads[download_id]
    if d['phase'] not in (1, 2):
        return {"ok": False, "reason": "not streaming"}

    byte_offset  = int(body.get("byte_offset", 0))
    handle       = d['handle']
    meta         = d['metadata']
    piece_length = meta['piece_length']
    total_pieces = meta['total_pieces']
    video_offset = d['video_offset']

    first_piece = (video_offset + byte_offset) // piece_length
    first_piece = max(0, min(first_piece, total_pieces - 1))
    window_end  = min(first_piece + STREAM_WINDOW_PIECES, total_pieces)
    wanted      = list(range(first_piece, window_end))

    with d['lock']:
        if d['phase'] == 1:
            _set_only_pieces(handle, total_pieces, wanted)
            d['prioritized_pieces'] = wanted
            for off, pi in enumerate(range(first_piece, min(first_piece + 5, total_pieces))):
                handle.set_piece_deadline(pi, max(10, off * 100))

    d['last_activity'] = time.time()
    # Ensure lbt is active (priorities are non-zero now so it will fetch)
    # We intentionally do NOT pause/resume here — just set priorities.

    log.info("🎯 [%s] /seek byte=%d → piece %d, window %d–%d",
             download_id[:8], byte_offset, first_piece, first_piece, window_end - 1)
    return {"ok": True, "first_piece": first_piece, "window": wanted}


# ─── /stream/{download_id} ────────────────────────────────────────────────────
@app.get("/stream/{download_id}")
def stream_video(download_id: str, request: Request):
    if download_id not in downloads:
        raise HTTPException(404, "Download not active")
    d = downloads[download_id]

    if d['phase'] not in (1, 2):
        raise HTTPException(425, "Not ready for streaming yet")

    file_path = d['video_path']
    handle    = d['handle']
    file_size = d['video_size']

    if not os.path.exists(file_path):
        raise HTTPException(404, "Video file not on disk yet")

    # ── Parse Range header ────────────────────────────────────────────────────
    range_hdr = request.headers.get("Range", "")
    if range_hdr:
        rng          = range_hdr.strip().lower().replace("bytes=", "")
        s_str, e_str = rng.split("-")
        req_start    = int(s_str)
        # Serve the full requested range — no artificial cap.
        # The browser uses Content-Length + Content-Range to know the total
        # file size, which is what enables the full-length seekbar.
        req_end = int(e_str) if e_str else file_size - 1
    else:
        req_start = 0
        req_end   = file_size - 1

    req_start = max(0, req_start)
    req_end   = min(req_end, file_size - 1)
    length    = req_end - req_start + 1

    meta         = d['metadata']
    piece_length = meta['piece_length']
    total_pieces = meta['total_pieces']
    video_offset = d['video_offset']

    first_piece = (video_offset + req_start) // piece_length
    last_piece  = (video_offset + req_end)   // piece_length

    log.info(
        "📡 [%s] /stream Range: bytes=%d-%d (%.2f MB) → pieces %d–%d",
        download_id[:8], req_start, req_end, length / 1024**2,
        first_piece, last_piece,
    )

    # ── Claim this request as the active one ─────────────────────────────────
    # RLock is reentrant so file_iterator can also acquire it without deadlock.
    with d['lock']:
        d['active_token'] += 1
        my_token = d['active_token']
        # log.debug("  token → %d", my_token)

        # Set piece priorities immediately (under the lock, before yielding)
        # so libtorrent starts fetching before the first byte is read.
        if d['phase'] == 1:
            window_end = min(first_piece + STREAM_WINDOW_PIECES, total_pieces)
            wanted     = list(range(first_piece, window_end))
            _set_only_pieces(handle, total_pieces, wanted)
            d['prioritized_pieces'] = wanted
            for off, pi in enumerate(range(first_piece, min(first_piece + 5, total_pieces))):
                handle.set_piece_deadline(pi, max(10, off * 100))
            log.info("  pre-prioritized pieces %d–%d", first_piece, window_end - 1)

    d['last_activity'] = time.time()
    # No pause/resume — priorities drive lbt. If it was truly idle (zero
    # priorities) it will start fetching automatically now that pieces are wanted.

    def file_iterator():
        last_piece_focused = -1

        with open(file_path, "rb") as f:
            f.seek(req_start)
            remaining    = length
            current_byte = req_start

            while remaining > 0:
                # ── Yield control to a newer request (seek) ───────────────
                if d['active_token'] != my_token:
                    # log.debug("  [tok%d] superseded by tok%d – exiting", my_token, d['active_token'])
                    return

                d['last_activity'] = time.time()

                # ── Current piece calculation ──────────────────────────────
                global_byte   = video_offset + current_byte
                current_piece = global_byte // piece_length
                d['current_piece'] = current_piece

                # ── Advance priority window when crossing a piece boundary ─
                if d['phase'] == 1 and current_piece != last_piece_focused:
                    with d['lock']:
                        if d['active_token'] == my_token:
                            window_end = min(current_piece + STREAM_WINDOW_PIECES, total_pieces)
                            wanted     = list(range(current_piece, window_end))
                            _set_only_pieces(handle, total_pieces, wanted)
                            d['prioritized_pieces'] = wanted
                            for off, pi in enumerate(range(current_piece, min(current_piece + 5, total_pieces))):
                                handle.set_piece_deadline(pi, max(10, off * 100))
                            # log.debug("  [tok%d] crossed piece %d → window %d–%d",
                            #           my_token, current_piece, current_piece, window_end - 1)
                    last_piece_focused = current_piece

                # ── Wait for this piece ────────────────────────────────────
                if not handle.have_piece(current_piece):
                    log.info("⏳ [%s tok%d] waiting for piece %d (peers=%d dl=%.1f kB/s)",
                             download_id[:8], my_token, current_piece, d['num_peers'], d['download_rate_kb'])
                    waited      = 0.0
                    reassert_at = 5.0
                    # Tell the watchdog we are actively waiting — it must not
                    # zero priorities while we are blocked here.
                    d['waiting_for_piece'] = True
                    try:
                        while not handle.have_piece(current_piece):
                            if d['active_token'] != my_token:
                                # log.debug("  [tok%d] superseded while waiting piece %d", my_token, current_piece)
                                return
                            # Keep last_activity fresh so the watchdog idle
                            # timer never expires while we are mid-wait.
                            d['last_activity'] = time.time()
                            time.sleep(0.1)
                            waited += 0.1

                            if waited >= reassert_at:
                                with d['lock']:
                                    if d['active_token'] == my_token and d['phase'] == 1:
                                        window_end = min(current_piece + STREAM_WINDOW_PIECES, total_pieces)
                                        wanted     = list(range(current_piece, window_end))
                                        _set_only_pieces(handle, total_pieces, wanted)
                                        d['prioritized_pieces'] = wanted
                                        handle.set_piece_deadline(current_piece, 50)
                                        log.info("  [tok%d] re-asserted piece %d after %.1fs (peers=%d dl=%.1f kB/s)",
                                                 my_token, current_piece, waited, d['num_peers'], d['download_rate_kb'])
                                reassert_at += 5.0

                            if waited > 120:
                                log.warning("⚠️  [%s] piece %d timeout after 120s", download_id[:8], current_piece)
                                return
                    finally:
                        # Always clear the flag — even if we return/raise above.
                        d['waiting_for_piece'] = False

                    log.info("✅ [%s tok%d] got piece %d after %.2fs", download_id[:8], my_token, current_piece, waited)

                # ── Compute how many bytes to yield from this piece ────────
                # End of this piece in local (video-file-relative) coordinates.
                # The last piece of the torrent may be shorter than piece_length,
                # so cap at the actual video end to avoid negative bytes_in_piece.
                piece_end_global  = (current_piece + 1) * piece_length
                piece_end_local   = min(piece_end_global - video_offset, d['video_size'])
                bytes_in_piece    = piece_end_local - current_byte

                if bytes_in_piece <= 0:
                    # current_byte is already past the end of this piece
                    # (can happen on the very last piece). Advance one piece
                    # and let the next iteration recalculate.
                    # log.debug("  bytes_in_piece=%d at current_byte=%d piece=%d — advancing",
                    #           bytes_in_piece, current_byte, current_piece)
                    current_byte = piece_end_local
                    continue

                chunk_size = min(1024 * 1024, remaining, bytes_in_piece)

                data = f.read(chunk_size)
                if not data:
                    log.warning("  f.read returned empty at byte=%d remaining=%d", current_byte, remaining)
                    break

                remaining    -= len(data)
                current_byte += len(data)
                yield data

    mime_type = mimetypes.guess_type(file_path)[0] or "video/mp4"
    log.info("  returning StreamingResponse Content-Range: bytes %d-%d/%d (%.1f MB)",
             req_start, req_end, file_size, length / 1024**2)

    return StreamingResponse(
        file_iterator(),
        status_code=206,
        headers={
            "Content-Range":  f"bytes {req_start}-{req_end}/{file_size}",
            "Accept-Ranges":  "bytes",
            "Content-Length": str(length),
            "Content-Type":   mime_type,
            # Content-Length lets the browser compute the total file size from
            # the Content-Range header, enabling the full-length seekbar.
            # Early generator exit on seek is safe: the client disconnects first
            # (it sent a new Range request), so uvicorn sees a broken pipe and
            # closes cleanly rather than raising "response shorter than CL".
        },
    )




# ─── /duration/{download_id} ──────────────────────────────────────────────────
# Returns the real video duration in seconds from ffprobe.
# The frontend uses this to override the <video> element's duration so the
# seekbar shows the full movie length even while the file is still downloading.
@app.get("/duration/{download_id}")
def get_duration(download_id: str):
    if download_id not in downloads:
        raise HTTPException(404, "Not found")
    d = downloads[download_id]

    # Return cached value immediately if we have it
    cached = d.get("duration_seconds")
    if cached:
        return {"duration_seconds": cached, "source": "cache"}

    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise HTTPException(500, "ffprobe not installed")

    file_path = d["video_path"]
    if not os.path.exists(file_path):
        raise HTTPException(404, "File not on disk yet")

    try:
        import json as _json
        result = subprocess.run([
            ffprobe, "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams", "-select_streams", "v:0",
            file_path,
        ], capture_output=True, text=True, timeout=15)
        info = _json.loads(result.stdout)
        # Prefer stream duration, fall back to format duration
        duration = None
        streams = info.get("streams", [])
        if streams:
            raw = streams[0].get("duration")
            if raw:
                duration = float(raw)
        if not duration:
            raw = info.get("format", {}).get("duration")
            if raw:
                duration = float(raw)
        if not duration:
            raise HTTPException(500, "Could not determine duration")

        d["duration_seconds"] = duration
        log.info("⏱ [%s] duration=%.1fs", download_id[:8], duration)
        return {"duration_seconds": duration, "source": "ffprobe"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"ffprobe failed: {e}")

# ─── /probe/{download_id} ─────────────────────────────────────────────────────
@app.get("/probe/{download_id}")
def probe_video(download_id: str):
    """
    Returns codec info for the video so the frontend can decide whether
    to use /stream (pass-through) or /transcode (real-time FFmpeg conversion).
    Requires ffprobe to be installed.
    """
    if download_id not in downloads:
        raise HTTPException(404, "Download not active")
    d = downloads[download_id]
    if d['phase'] not in (1, 2):
        raise HTTPException(425, "Not ready yet")

    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {"needs_transcode": False, "reason": "ffprobe not found — assuming compatible"}

    file_path = d['video_path']
    try:
        result = subprocess.run([
            ffprobe, "-v", "quiet", "-print_format", "json",
            "-show_streams", "-select_streams", "v:0",
            "-show_format",   # needed for duration
            file_path,
        ], capture_output=True, text=True, timeout=10)
        import json as _json
        info    = _json.loads(result.stdout)
        streams = info.get("streams", [])
        fmt     = info.get("format", {})
        if not streams:
            return {"needs_transcode": False, "codec": "unknown", "duration_seconds": None}

        codec    = streams[0].get("codec_name", "").lower()
        profile  = streams[0].get("profile", "").lower()
        pix_fmt  = streams[0].get("pix_fmt", "").lower()

        # Duration: prefer stream-level, fall back to format-level
        raw_dur  = streams[0].get("duration") or fmt.get("duration")
        duration = float(raw_dur) if raw_dur else None

        # Browsers support: h264 (baseline/main/high, 8-bit yuv420p)
        # They do NOT support: hevc/h265, av1, vp9 in mp4, 10-bit anything
        needs_transcode = (
            codec in ("hevc", "h265", "av1", "vp9", "mpeg4", "divx", "xvid")
            or "10" in pix_fmt           # 10-bit: yuv420p10le etc.
            or "12" in pix_fmt           # 12-bit
            or ("h264" in codec and "high 10" in profile)
        )

        log.info("🔍 [%s] codec=%s profile=%s pix_fmt=%s dur=%.1fs → needs_transcode=%s",
                 download_id[:8], codec, profile, pix_fmt, duration or 0, needs_transcode)

        # Cache duration in the download state so /transcode can use it
        # without running ffprobe again
        downloads[download_id]['duration_seconds'] = duration

        return {
            "needs_transcode":  needs_transcode,
            "codec":            codec,
            "profile":          profile,
            "pix_fmt":          pix_fmt,
            "duration_seconds": duration,
        }
    except Exception as e:
        log.warning("probe failed: %s", e)
        return {"needs_transcode": False, "reason": str(e)}

# ─── /torrents debug ──────────────────────────────────────────────────────────
@app.get("/torrents")
def get_all_torrents():
    skip = {'handle', 'video_path', 'lock'}
    return [{k: v for k, v in d.items() if k not in skip} for d in downloads.values()]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")