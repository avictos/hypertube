"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
    isSubtitlesEnabled,
    setSubtitlesEnabled,
    getCachedSubtitleChoice,
    setCachedSubtitleChoice,
    SUBTITLES_OFF,
} from "@/lib/subtitle-prefs";

const TORRENT_API_BASE_URL = "http://localhost:8000";
const NEXT_API_BASE_URL = "/api";

const MOCK_USER_ID = "user_12345";

export interface ProbeResult {
    needs_transcode: boolean;
    codec?: string;
    pix_fmt?: string;
    duration_seconds: number | null;
}

export interface DownloadStats {
    download_id: string | null;
    phase: string;
    lifecycle_state: string;
    activity: string;
    progress_percent: number;
    total_size_bytes?: number;
    downloaded_bytes?: number;
    download_rate_kb?: number;
    upload_rate_kb?: number;
    num_peers?: number;
    is_ready_for_streaming: boolean;
    current_piece?: number;
    prioritized_pieces?: number[];
}

function fmtBytes(b?: number) {
    if (!b || b <= 0) return "0 B";
    const u = ["B", "KB", "MB", "GB"];
    let v = b,
        i = 0;
    while (v >= 1024 && i < u.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(v < 10 ? 2 : 1)} ${u[i]}`;
}

function fmtRate(kb?: number) {
    if (!kb || kb < 0.5) return "0 kB/s";
    return kb < 1024
        ? `${kb.toFixed(0)} kB/s`
        : `${(kb / 1024).toFixed(2)} MB/s`;
}

const PHASE_DOT: Record<string, string> = {
    idle: "bg-gray-500",
    buffering: "bg-amber-400 animate-pulse",
    ready: "bg-green-400",
    streaming: "bg-blue-400 animate-pulse",
    seeding: "bg-green-500",
};

const PHASE_LABEL: Record<string, string> = {
    idle: "Idle",
    buffering: "Buffering",
    ready: "Ready",
    streaming: "Streaming",
    seeding: "Complete",
};

function StatPill({
    label,
    value,
    color = "text-white",
}: {
    label: string;
    value: string;
    color?: string;
}) {
    return (
        <div className="flex min-w-0 flex-col">
            <span className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">
                {label}
            </span>
            <span className={`text-xs font-bold whitespace-nowrap ${color}`}>
                {value}
            </span>
        </div>
    );
}

export interface SubtitleTrack {
    languageCode: string;
    languageName: string | null;
}

export function HypertubePlayer({
    downloadId,
    probe,
    stats,
    subtitles,
    preferredLanguage,
    onClose,
}: {
    downloadId: string;
    probe: ProbeResult | null;
    stats: DownloadStats | null;
    subtitles?: SubtitleTrack[];
    preferredLanguage?: string | null;
    onClose: () => void;
}) {
    const { id: movieId } = useParams<{ id: string }>(); // Grabbing movieId from URL params
    const videoRef = useRef<HTMLVideoElement>(null);
    const lastTimeRef = useRef(0);
    const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const [knownDuration, setKnownDuration] = useState<number | null>(
        probe?.duration_seconds ?? null
    );

    // null = no subtitles shown. Resolution order: per-movie cached choice →
    // user's preferred language (only once they've ever turned subtitles on
    // at least once, anywhere) → off, with a manual picker for the rest.
    const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);

    useEffect(() => {
        if (!subtitles || subtitles.length === 0 || !movieId) return;

        const cached = getCachedSubtitleChoice(movieId);
        if (cached === SUBTITLES_OFF) {
            setActiveLanguage(null);
            return;
        }
        if (cached && subtitles.some((s) => s.languageCode === cached)) {
            setActiveLanguage(cached);
            return;
        }

        if (
            isSubtitlesEnabled() &&
            preferredLanguage &&
            subtitles.some((s) => s.languageCode === preferredLanguage)
        ) {
            setActiveLanguage(preferredLanguage);
            setCachedSubtitleChoice(movieId, preferredLanguage);
            return;
        }

        setActiveLanguage(null);
    }, [subtitles, preferredLanguage, movieId]);

    // Drive the actual <track> elements' visibility from activeLanguage —
    // tracks are never marked `default` so nothing shows until we say so.
    const applyTrackModes = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        for (let i = 0; i < video.textTracks.length; i++) {
            const t = video.textTracks[i];
            t.mode = t.language === activeLanguage ? "showing" : "disabled";
        }
    }, [activeLanguage]);

    useEffect(() => {
        applyTrackModes();
    }, [applyTrackModes, subtitles]);

    // Newly rendered <track> elements don't get a corresponding TextTrack
    // entry in video.textTracks synchronously — the browser adds it on its
    // own schedule, which often lands after the effect above already ran
    // and found nothing to set. `addtrack` fires exactly when that entry
    // shows up, so re-apply there instead of racing it. video.load() (called
    // whenever the source is (re)initialized) also resets the whole track
    // list, hence the loadedmetadata listener too.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.addEventListener("loadedmetadata", applyTrackModes);
        video.textTracks.addEventListener("addtrack", applyTrackModes);
        return () => {
            video.removeEventListener("loadedmetadata", applyTrackModes);
            video.textTracks.removeEventListener("addtrack", applyTrackModes);
        };
    }, [applyTrackModes]);

    const handleSelectSubtitle = useCallback(
        (lang: string | null) => {
            setActiveLanguage(lang);
            setPickerOpen(false);
            setSubtitlesEnabled(true);
            if (movieId) {
                setCachedSubtitleChoice(movieId, lang ?? SUBTITLES_OFF);
            }
        },
        [movieId]
    );

    const activeSrc = `${TORRENT_API_BASE_URL}/stream/${downloadId}`;

    // ── 1. Update known duration from probe ──────────────────────────────────
    useEffect(() => {
        if (probe?.duration_seconds && probe.duration_seconds > 0) {
            setKnownDuration(probe.duration_seconds);
        }
    }, [probe]);

    // ── 2. Initialize Video & Fetch Resume Time ──────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !activeSrc || !movieId) return;

        const initPlayer = async () => {
            video.src = activeSrc;
            video.load();

            try {
                // Fetch where the user left off
                const res = await fetch(
                    `${NEXT_API_BASE_URL}/playback?movieId=${movieId}&userId=${MOCK_USER_ID}`
                );
                if (res.ok) {
                    const data = await res.json();
                    if (data.lastWatchedSeconds > 0) {
                        video.currentTime = data.lastWatchedSeconds;
                    }
                }
            } catch (err) {
                console.error("Failed to load playback position", err);
            }

            video.play().catch(() => {});
        };

        initPlayer();
    }, [activeSrc, movieId]);

    // ── 3. Heartbeat: Sync playback position to Next.js API every 10s ────────
    useEffect(() => {
        const syncPlayback = () => {
            const video = videoRef.current;
            if (!video || video.paused || video.currentTime === 0) return;

            fetch(`${NEXT_API_BASE_URL}/playback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    movieId,
                    downloadId,
                    userId: MOCK_USER_ID,
                    lastWatchedSeconds: video.currentTime,
                }),
            }).catch(() => {});
        };

        // Fire every 10 seconds
        syncIntervalRef.current = setInterval(syncPlayback, 10000);

        return () => {
            if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
            // Optional: Save one last time when component unmounts
            syncPlayback();
        };
    }, [movieId, downloadId]);

    // ── Seek Hinting ─────────────────────────────────────────────────────────
    const fireTorrentSeek = useCallback(
        (timeSec: number) => {
            const video = videoRef.current;
            const dur =
                knownDuration ||
                (video && video.duration > 0 ? video.duration : null);
            const totalBytes = stats?.total_size_bytes ?? 0;

            if (!totalBytes || !dur) return;

            fetch(`${TORRENT_API_BASE_URL}/seek/${downloadId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    byte_offset: Math.floor((timeSec / dur) * totalBytes),
                }),
            }).catch(() => {});
        },
        [downloadId, stats?.total_size_bytes, knownDuration]
    );

    const handleTimeUpdate = useCallback(() => {
        const video = videoRef.current;
        if (video && !video.seeking) {
            lastTimeRef.current = video.currentTime;
        }
    }, []);

    const handleSeeking = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        fireTorrentSeek(video.currentTime);
    }, [fireTorrentSeek]);

    const handleError = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        console.warn(
            "[hypertube] Native video error code=%d",
            video.error?.code ?? 0
        );
    }, []);

    // ── Keyboard / cleanup ────────────────────────────────────────────────────
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const phase = stats?.phase ?? "idle";
    const durationLabel = knownDuration
        ? `${Math.floor(knownDuration / 3600)}h ${Math.floor((knownDuration % 3600) / 60)}m`
        : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
            <div className="relative z-10 flex w-full max-w-5xl flex-col gap-3">
                {/* Stats bar */}
                {stats && (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/80 px-4 py-2.5 backdrop-blur-md">
                        <div className="flex items-center gap-1.5">
                            <span
                                className={`inline-block h-2 w-2 rounded-full ${PHASE_DOT[phase] ?? "bg-gray-500"}`}
                            />
                            <span className="text-[10px] font-bold tracking-widest text-gray-300 uppercase">
                                {PHASE_LABEL[phase] ?? phase}
                            </span>
                            <span className="ml-1 rounded bg-blue-900/60 px-1.5 py-0.5 text-[9px] font-bold text-blue-300">
                                native stream
                            </span>
                        </div>
                        <div className="h-4 w-px bg-white/10" />
                        <StatPill
                            label="Progress"
                            value={`${stats.progress_percent.toFixed(1)}%`}
                        />
                        <div className="h-4 w-px bg-white/10" />
                        <StatPill
                            label="On disk"
                            value={`${fmtBytes(stats.downloaded_bytes)} / ${fmtBytes(stats.total_size_bytes)}`}
                        />
                        <div className="h-4 w-px bg-white/10" />
                        <StatPill
                            label="↓ Down"
                            value={fmtRate(stats.download_rate_kb)}
                            color={
                                stats.activity === "downloading"
                                    ? "text-blue-400"
                                    : "text-gray-500"
                            }
                        />
                        <div className="h-4 w-px bg-white/10" />
                        <StatPill
                            label="↑ Up"
                            value={fmtRate(stats.upload_rate_kb)}
                            color={
                                stats.activity === "uploading"
                                    ? "text-green-400"
                                    : "text-gray-500"
                            }
                        />
                        <div className="h-4 w-px bg-white/10" />
                        <StatPill
                            label="Peers"
                            value={String(stats.num_peers ?? 0)}
                        />
                        {(stats.current_piece ?? -1) >= 0 && (
                            <>
                                <div className="h-4 w-px bg-white/10" />
                                <StatPill
                                    label="Piece"
                                    value={`${stats.current_piece}${
                                        stats.prioritized_pieces?.length
                                            ? `→${stats.prioritized_pieces[stats.prioritized_pieces.length - 1]}`
                                            : ""
                                    }`}
                                />
                            </>
                        )}
                        {durationLabel && (
                            <>
                                <div className="h-4 w-px bg-white/10" />
                                <StatPill
                                    label="Duration"
                                    value={durationLabel}
                                />
                            </>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                            {subtitles && subtitles.length > 0 && (
                                <div className="relative">
                                    <button
                                        onClick={() =>
                                            setPickerOpen((v) => !v)
                                        }
                                        className={`flex h-8 items-center gap-1 rounded-full px-3 text-[10px] font-bold tracking-wide uppercase transition-colors ${
                                            activeLanguage
                                                ? "bg-blue-600 text-white"
                                                : "bg-gray-800/80 text-gray-300 hover:bg-gray-700"
                                        }`}
                                    >
                                        CC
                                        {activeLanguage
                                            ? ` · ${activeLanguage.toUpperCase()}`
                                            : ""}
                                    </button>
                                    {pickerOpen && (
                                        <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-lg border border-white/10 bg-gray-900 shadow-xl">
                                            <button
                                                onClick={() =>
                                                    handleSelectSubtitle(null)
                                                }
                                                className={`block w-full px-3 py-2 text-left text-xs ${
                                                    activeLanguage === null
                                                        ? "bg-blue-600 text-white"
                                                        : "text-gray-300 hover:bg-gray-800"
                                                }`}
                                            >
                                                Off
                                            </button>
                                            {subtitles.map((s) => (
                                                <button
                                                    key={s.languageCode}
                                                    onClick={() =>
                                                        handleSelectSubtitle(
                                                            s.languageCode
                                                        )
                                                    }
                                                    className={`block w-full px-3 py-2 text-left text-xs ${
                                                        activeLanguage ===
                                                        s.languageCode
                                                            ? "bg-blue-600 text-white"
                                                            : "text-gray-300 hover:bg-gray-800"
                                                    }`}
                                                >
                                                    {s.languageName ??
                                                        s.languageCode}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <button
                                onClick={onClose}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800/80 text-white transition-colors hover:bg-red-600"
                            >
                                <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                )}

                {/* Video */}
                <div className="w-full overflow-hidden rounded-xl shadow-2xl">
                    <video
                        ref={videoRef}
                        controls
                        autoPlay
                        playsInline
                        preload="auto"
                        onTimeUpdate={handleTimeUpdate}
                        onSeeking={handleSeeking}
                        onError={handleError}
                        className="hypertube-video aspect-video w-full bg-black"
                    >
                        {subtitles?.map((s) => (
                            <track
                                key={s.languageCode}
                                kind="subtitles"
                                srcLang={s.languageCode}
                                label={s.languageName ?? s.languageCode}
                                src={`/api/movies/${movieId}/subtitles/${s.languageCode}`}
                            />
                        ))}
                        Your browser does not support the video tag.
                    </video>
                </div>

                {/*
                    The native captions button (and Chrome's "..." overflow
                    menu captions entry) operates on the same TextTrack list
                    we manage from the custom CC picker above — letting both
                    control it leads to them fighting over `mode`. Hiding the
                    native control keeps our picker as the single source of
                    truth.
                */}
                <style>{`
                    .hypertube-video::-webkit-media-controls-toggle-closed-captions-button {
                        display: none !important;
                    }
                `}</style>

                <p className="text-center text-xs text-gray-600">
                    Press{" "}
                    <kbd className="rounded bg-gray-800 px-1 py-0.5 text-gray-400">
                        Esc
                    </kbd>{" "}
                    to close
                </p>
            </div>
        </div>
    );
}
