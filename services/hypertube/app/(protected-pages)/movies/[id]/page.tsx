"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { HypertubePlayer } from "@/components/hypertube-player";
import type { ProbeResult, DownloadStats } from "@/components/hypertube-player";
import { CommentsSection } from "@/components/comments-section";

const NEXT_API_BASE_URL = "/api";
const TORRENT_API_BASE_URL = "http://localhost:8000";

interface Movie {
    id: string;
    title: string;
    titleLong: string | null;
    releaseYear: number;
    rating: number;
    runtimeMinutes: number | null;
    genres: string[];
    ytsPosterUrl: string;
    ytsBackgroundImageUrl: string | null;
    description: string | null;
    language: string | null;
    mpaRating: string | null;
    imdbCode: string | null;

    // Newly added fields
    directors: string[];
    cast: string[];
    isNewRelease: boolean;
    isPopular: boolean;
    subtitles: { languageCode: string; languageName: string | null }[];
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

const LC_COLOR: Record<string, string> = {
    IDLE: "text-gray-400",
    FETCHING_METADATA: "text-amber-400",
    DOWNLOADING: "text-blue-400",
    COMPLETED: "text-green-400",
    ERROR: "text-red-400",
};

const LC_LABEL: Record<string, string> = {
    IDLE: "Idle",
    FETCHING_METADATA: "Fetching…",
    DOWNLOADING: "Downloading",
    COMPLETED: "Completed",
    ERROR: "Error",
};

function StatusCard({ stats }: { stats: DownloadStats }) {
    const phase = stats.phase ?? "idle";
    const lc = stats.lifecycle_state ?? "IDLE";
    return (
        <div className="space-y-2 rounded-xl border border-gray-700 bg-gray-800/60 p-3">
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                    <span
                        className={`inline-block h-2 w-2 rounded-full ${PHASE_DOT[phase] ?? "bg-gray-500"}`}
                    />
                    <span
                        className={`font-semibold ${LC_COLOR[lc] ?? "text-gray-300"}`}
                    >
                        {LC_LABEL[lc] ?? lc}
                    </span>
                </div>
                <span className="text-gray-400 tabular-nums">
                    {(stats.progress_percent ?? 0).toFixed(1)}%
                </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
                <div
                    className={`h-1.5 rounded-full transition-all duration-700 ${
                        phase === "seeding"
                            ? "bg-green-500"
                            : phase === "buffering"
                              ? "bg-amber-500"
                              : "bg-blue-500"
                    }`}
                    style={{
                        width: `${Math.min(100, stats.progress_percent ?? 0)}%`,
                    }}
                />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500">
                <span>
                    {fmtBytes(stats.downloaded_bytes)}
                    {stats.total_size_bytes
                        ? ` / ${fmtBytes(stats.total_size_bytes)}`
                        : ""}
                </span>
                <span>{stats.num_peers ?? 0} peers</span>
            </div>
            {stats.activity && stats.activity !== "idle" && (
                <div
                    className={`text-[10px] font-semibold ${stats.activity === "downloading" ? "text-blue-400" : "text-green-400"}`}
                >
                    {stats.activity === "downloading"
                        ? `↓ ${fmtRate(stats.download_rate_kb)}`
                        : `↑ ${fmtRate(stats.upload_rate_kb)}`}
                </div>
            )}
            {(stats.current_piece ?? -1) >= 0 && (
                <div className="font-mono text-[9px] text-gray-600">
                    piece {stats.current_piece}
                    {stats.prioritized_pieces?.length
                        ? ` · window ${stats.prioritized_pieces[0]}–${stats.prioritized_pieces[stats.prioritized_pieces.length - 1]}`
                        : ""}
                </div>
            )}
        </div>
    );
}

const MOCK_USER_ID = "user_12345"; // Keep auth mock consistent

export default function MovieDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [movie, setMovie] = useState<Movie | null>(null);
    const [stats, setStats] = useState<DownloadStats | null>(null);
    const [downloadId, setDownloadId] = useState<string | null>(null);
    const [probe, setProbe] = useState<ProbeResult | null>(null);
    const [isWatching, setIsWatching] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imgErr, setImgErr] = useState(false);
    const [bgErr, setBgErr] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [isFavorite, setIsFavorite] = useState(false);
    const [isFavLoading, setIsFavLoading] = useState(true);
    const [preferredLanguage, setPreferredLanguage] = useState<string | null>(
        null
    );

    useEffect(() => {
        if (!id) return;
        let cancelled = false;

        fetch("/api/auth/me", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const userId = data?.user?.id;
                if (!userId) return null;
                return fetch(`/users/${userId}`, { cache: "no-store" })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((d) => d?.user?.preferredLanguage ?? null);
            })
            .catch(() => null)
            .then((lang: string | null) => {
                if (cancelled) return;
                if (lang) setPreferredLanguage(lang);
            });

        return () => {
            cancelled = true;
        };
    }, [id]);

    useEffect(() => {
        if (!id) return;
        fetch(`/movies/${id}`)
            .then((r) => {
                if (!r.ok) throw new Error("Movie not found");
                return r.json();
            })
            .then(setMovie)
            .catch((e) => setError(e.message));
    }, [id]);

    // Subtitles are bundled inside the torrent itself (under a "Subs/"
    // folder) and only get pulled out once /start has actually loaded the
    // torrent — so polling only makes sense once downloadId is set. They're
    // tiny relative to the video, so they typically land within a few
    // seconds of the initial buffer.
    useEffect(() => {
        if (!downloadId) return;
        let attempts = 0;
        const maxAttempts = 10;
        const interval = setInterval(() => {
            attempts += 1;
            fetch(`/movies/${id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                    if (data?.subtitles) {
                        setMovie((prev) =>
                            prev ? { ...prev, subtitles: data.subtitles } : prev
                        );
                    }
                })
                .catch(() => {});
            if (attempts >= maxAttempts) clearInterval(interval);
        }, 2000);
        return () => clearInterval(interval);
    }, [id, downloadId]);

    useEffect(() => {
        if (!id) return;
        fetch(`${TORRENT_API_BASE_URL}/status/movie/${id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: DownloadStats | null) => {
                if (!data) return;
                setStats(data);
                if (data.download_id) setDownloadId(data.download_id);
            })
            .catch(() => {});
    }, [id]);

    useEffect(() => {
        if (!downloadId) return;
        const poll = async () => {
            try {
                const r = await fetch(
                    `${TORRENT_API_BASE_URL}/status?download_id=${downloadId}`
                );
                if (r.ok) setStats(await r.json());
            } catch {}
        };
        poll();
        pollRef.current = setInterval(poll, 1500);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [downloadId]);

    // Fetch initial favorite status
    useEffect(() => {
        if (!id) return;
        fetch(
            `${NEXT_API_BASE_URL}/favorites?userId=${MOCK_USER_ID}&movieId=${id}`
        )
            .then((r) => r.json())
            .then((data) => {
                setIsFavorite(data.isFavorite);
                setIsFavLoading(false);
            })
            .catch(() => setIsFavLoading(false));
    }, [id]);

    const handleOpenPlayer = useCallback(async () => {
        setIsWatching(true);

        // 1. Log the opening of the movie to the Watch History table
        try {
            await fetch(`${NEXT_API_BASE_URL}/history`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: "user_12345", // TODO: Replace with real auth user ID
                    movieId: id,
                }),
            });
        } catch (err) {
            console.error("Failed to log watch history:", err);
        }

        // 2. Continue with the existing probe logic
        if (!downloadId || probe) return;
        try {
            const r = await fetch(
                `${TORRENT_API_BASE_URL}/probe/${downloadId}`
            );
            if (r.ok) setProbe(await r.json());
        } catch {
            setProbe({ needs_transcode: false, duration_seconds: null });
        }
    }, [downloadId, probe, id]);

    const handleWatch = async () => {
        setIsStarting(true);
        setError(null);
        try {
            const res = await fetch(`${TORRENT_API_BASE_URL}/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    movie_id: id,
                    preferred_language: preferredLanguage,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail ?? "Failed to start");
            setDownloadId(data.download_id);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsStarting(false);
        }
    };

    // Handle toggle click
    const handleToggleFavorite = async () => {
        const previousState = isFavorite;
        setIsFavorite(!isFavorite); // Optimistic UI update for instant feedback

        try {
            const res = await fetch(`${NEXT_API_BASE_URL}/favorites`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: MOCK_USER_ID, movieId: id }),
            });
            const data = await res.json();
            setIsFavorite(data.isFavorite); // Sync with source of truth
        } catch {
            setIsFavorite(previousState); // Revert if it fails
        }
    };

    const runtimeFormatted = movie?.runtimeMinutes
        ? `${Math.floor(movie.runtimeMinutes / 60)}h ${movie.runtimeMinutes % 60}m`
        : "";

    const phase = stats?.phase ?? "idle";
    const lc = stats?.lifecycle_state ?? "IDLE";
    const isReady = stats?.is_ready_for_streaming ?? false;
    const isDownloading = downloadId !== null;
    const isCompleted = lc === "COMPLETED" || phase === "seeding";

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-white">
            <header className="sticky top-0 z-30 border-b border-gray-800/50 bg-gray-950/90 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
                    <button
                        onClick={() => {
                            router.back();
                            // Give Next.js a tiny fraction of a second to step back in history,
                            // then force it to fetch the actual movie data instead of serving dead skeletons.
                            setTimeout(() => {
                                router.refresh();
                            }, 50);
                        }}
                        className="flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
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
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                        Back
                    </button>
                    <div className="h-4 w-px bg-gray-700" />
                    <Link href="/" className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600">
                            <svg
                                className="h-3 w-3 text-white"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                        <span className="text-sm font-bold tracking-tight">
                            Hypertube
                        </span>
                    </Link>
                </div>
            </header>

            {error && !movie && (
                <div className="flex items-center justify-center p-20 text-center">
                    <div>
                        <p className="text-red-400">{error}</p>
                        <Link
                            href="/"
                            className="mt-4 inline-block text-sm text-blue-400 hover:underline"
                        >
                            ← Back
                        </Link>
                    </div>
                </div>
            )}

            {!movie && !error && (
                <div className="mx-auto max-w-7xl animate-pulse px-6 py-12">
                    <div className="flex gap-10">
                        <div className="aspect-[2/3] w-64 shrink-0 rounded-2xl bg-gray-800" />
                        <div className="flex-1 space-y-4 pt-2">
                            <div className="h-8 w-2/3 rounded bg-gray-800" />
                            <div className="h-4 w-1/3 rounded bg-gray-800" />
                            <div className="h-24 rounded bg-gray-800" />
                        </div>
                    </div>
                </div>
            )}

            {movie && (
                <>
                    <div className="relative h-72 overflow-hidden md:h-96">
                        {movie.ytsBackgroundImageUrl && !bgErr ? (
                            <>
                                <img
                                    src={movie.ytsBackgroundImageUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    onError={() => setBgErr(true)}
                                />
                                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-gray-950" />
                            </>
                        ) : (
                            <div className="h-full w-full bg-gradient-to-b from-gray-800 to-gray-950" />
                        )}
                    </div>

                    <div className="mx-auto max-w-7xl px-6">
                        <div className="relative z-10 -mt-32 flex flex-col gap-8 md:-mt-48 md:flex-row">
                            {/* Left Column (Poster & CTAs) */}
                            <div className="shrink-0 md:w-56 lg:w-64">
                                <div className="overflow-hidden rounded-2xl border border-gray-700/50 shadow-2xl shadow-black/60">
                                    {!imgErr && movie.ytsPosterUrl ? (
                                        <img
                                            src={movie.ytsPosterUrl}
                                            alt={movie.title}
                                            className="w-full object-cover"
                                            onError={() => setImgErr(true)}
                                        />
                                    ) : (
                                        <div className="flex aspect-[2/3] items-center justify-center bg-gray-800">
                                            <svg
                                                className="h-16 w-16 text-gray-600"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={1}
                                                    d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                                                />
                                            </svg>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 space-y-2.5">
                                    {!isDownloading && (
                                        <button
                                            onClick={handleWatch}
                                            disabled={isStarting}
                                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                                        >
                                            {isStarting ? (
                                                <>
                                                    <svg
                                                        className="h-4 w-4 animate-spin"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <circle
                                                            className="opacity-25"
                                                            cx="12"
                                                            cy="12"
                                                            r="10"
                                                            stroke="currentColor"
                                                            strokeWidth="4"
                                                        />
                                                        <path
                                                            className="opacity-75"
                                                            fill="currentColor"
                                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                                        />
                                                    </svg>
                                                    Starting…
                                                </>
                                            ) : (
                                                <>
                                                    <svg
                                                        className="h-4 w-4"
                                                        fill="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path d="M8 5v14l11-7z" />
                                                    </svg>
                                                    Watch Movie
                                                </>
                                            )}
                                        </button>
                                    )}

                                    {isDownloading && stats && (
                                        <>
                                            <StatusCard stats={stats} />
                                            <button
                                                onClick={handleOpenPlayer}
                                                disabled={!isReady}
                                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
                                            >
                                                {isReady ? (
                                                    <>
                                                        <svg
                                                            className="h-4 w-4"
                                                            fill="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path d="M8 5v14l11-7z" />
                                                        </svg>
                                                        {isCompleted
                                                            ? "Play Movie"
                                                            : "Play Now"}
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg
                                                            className="h-4 w-4 animate-spin"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <circle
                                                                className="opacity-25"
                                                                cx="12"
                                                                cy="12"
                                                                r="10"
                                                                stroke="currentColor"
                                                                strokeWidth="4"
                                                            />
                                                            <path
                                                                className="opacity-75"
                                                                fill="currentColor"
                                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                                            />
                                                        </svg>
                                                        {phase === "buffering"
                                                            ? "Buffering…"
                                                            : "Loading…"}
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    )}

                                    {/* Favorite Button */}
                                    <button
                                        onClick={handleToggleFavorite}
                                        disabled={isFavLoading}
                                        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all ${
                                            isFavorite
                                                ? "border-pink-500/50 bg-pink-500/10 text-pink-500 hover:bg-pink-500/20"
                                                : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500 hover:text-white"
                                        }`}
                                    >
                                        <svg
                                            className={`h-4 w-4 ${isFavorite ? "fill-current" : "fill-none stroke-current stroke-2"}`}
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                                            />
                                        </svg>
                                        {isFavorite
                                            ? "Saved to Favorites"
                                            : "Add to Favorites"}
                                    </button>

                                    {movie.imdbCode && (
                                        <a
                                            href={`https://www.imdb.com/title/${movie.imdbCode}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
                                        >
                                            <svg
                                                className="h-4 w-4 text-amber-400"
                                                fill="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                            </svg>
                                            IMDb
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Right Column (Metadata) */}
                            <div className="flex-1 pt-2 pb-12 md:pt-8">
                                {/* Badges */}
                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                    {movie.mpaRating && (
                                        <span className="rounded border border-gray-600 px-1.5 py-0.5 text-[11px] font-bold text-gray-400">
                                            {movie.mpaRating}
                                        </span>
                                    )}
                                    {movie.isNewRelease && (
                                        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-emerald-400">
                                            NEW RELEASE
                                        </span>
                                    )}
                                    {movie.isPopular && (
                                        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-amber-400">
                                            POPULAR
                                        </span>
                                    )}
                                </div>

                                <h1 className="text-2xl leading-tight font-bold tracking-tight text-white md:text-3xl lg:text-4xl">
                                    {movie.title}
                                </h1>
                                <p className="mt-0.5 text-base text-gray-400">
                                    {movie.releaseYear}
                                </p>

                                <div className="mt-4 flex flex-wrap items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex">
                                            {[1, 2, 3, 4, 5].map((i) => (
                                                <svg
                                                    key={i}
                                                    className={`h-4 w-4 ${i <= Math.round((movie.rating || 0) / 2) ? "text-amber-400" : "text-gray-600"}`}
                                                    fill="currentColor"
                                                    viewBox="0 0 20 20"
                                                >
                                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                </svg>
                                            ))}
                                        </div>
                                        <span className="text-sm font-bold text-white">
                                            {movie.rating?.toFixed(1) ?? "0.0"}
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            / 10
                                        </span>
                                    </div>
                                    {runtimeFormatted && (
                                        <>
                                            <div className="h-4 w-px bg-gray-700" />
                                            <span className="text-sm text-gray-400">
                                                {runtimeFormatted}
                                            </span>
                                        </>
                                    )}
                                    {movie.language &&
                                        movie.language !== "Unknown" && (
                                            <>
                                                <div className="h-4 w-px bg-gray-700" />
                                                <span className="text-sm text-gray-400 capitalize">
                                                    {movie.language}
                                                </span>
                                            </>
                                        )}
                                </div>

                                {movie.genres?.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {movie.genres.map((g) => (
                                            <span
                                                key={g}
                                                className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300"
                                            >
                                                {g}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {movie.description && (
                                    <div className="mt-8">
                                        <h2 className="mb-2 text-xs font-bold tracking-wider text-gray-500 uppercase">
                                            Synopsis
                                        </h2>
                                        <p className="text-sm leading-relaxed text-gray-300 md:text-base">
                                            {movie.description}
                                        </p>
                                    </div>
                                )}

                                {/* Cast & Crew Section */}
                                {(movie.directors?.length > 0 ||
                                    movie.cast?.length > 0) && (
                                    <div className="mt-8 flex flex-col gap-6 border-t border-gray-800 pt-6 sm:flex-row sm:gap-12">
                                        {movie.directors?.length > 0 && (
                                            <div className="flex-1">
                                                <h2 className="mb-2 text-xs font-bold tracking-wider text-gray-500 uppercase">
                                                    Director
                                                </h2>
                                                <p className="text-sm font-medium text-gray-300">
                                                    {movie.directors.join(", ")}
                                                </p>
                                            </div>
                                        )}
                                        {movie.cast?.length > 0 && (
                                            <div className="flex-2">
                                                <h2 className="mb-2 text-xs font-bold tracking-wider text-gray-500 uppercase">
                                                    Cast
                                                </h2>
                                                <p className="text-sm leading-relaxed font-medium text-gray-300">
                                                    {movie.cast.join(", ")}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="mt-8 border-t border-gray-800 pt-6">
                                    <h2 className="mb-2 text-xs font-bold tracking-wider text-gray-500 uppercase">
                                        Available Subtitles
                                    </h2>
                                    {movie.subtitles?.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {movie.subtitles.map((s) => (
                                                <span
                                                    key={s.languageCode}
                                                    className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300"
                                                >
                                                    {s.languageName ??
                                                        s.languageCode}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500">
                                            No subtitles available yet.
                                        </p>
                                    )}
                                </div>

                                <CommentsSection movieId={movie.id} />

                                {error && (
                                    <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
                                        {error}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {isWatching && downloadId && (
                <HypertubePlayer
                    downloadId={downloadId}
                    probe={probe}
                    stats={stats}
                    subtitles={movie?.subtitles}
                    preferredLanguage={preferredLanguage}
                    onClose={() => setIsWatching(false)}
                />
            )}
        </div>
    );
}
