"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const NEXT_API_BASE_URL = "/api";
const TORRENT_API_BASE_URL = "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Movie {
    id: string;
    title: string;
    releaseYear: number;
    rating: number;
    runtimeMinutes: number | null;
    genres: string[];
    ytsPosterUrl: string;
    language: string | null;
    imdbCode: string | null;
}

interface TorrentStatus {
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
    downloaded_pieces?: number;
    total_pieces?: number;
}

interface MovieRow {
    movie: Movie;
    status: TorrentStatus | null;
}

interface PageMeta {
    total: number;
    page: number;
    pageSize: number;
    pages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
function fmtRuntime(min?: number | null) {
    if (!min) return null;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
}

// ─── Status colours / labels ──────────────────────────────────────────────────
const LC_BG: Record<string, string> = {
    IDLE: "bg-gray-800 text-gray-400",
    FETCHING_METADATA: "bg-amber-950 text-amber-300",
    DOWNLOADING: "bg-blue-950  text-blue-300",
    COMPLETED: "bg-green-950 text-green-300",
    ERROR: "bg-red-950   text-red-300",
};
const LC_DOT: Record<string, string> = {
    IDLE: "bg-gray-500",
    FETCHING_METADATA: "bg-amber-400 animate-pulse",
    DOWNLOADING: "bg-blue-400  animate-pulse",
    COMPLETED: "bg-green-400",
    ERROR: "bg-red-500",
};
const LC_LABEL: Record<string, string> = {
    IDLE: "Idle",
    FETCHING_METADATA: "Fetching metadata",
    DOWNLOADING: "Downloading",
    COMPLETED: "Completed",
    ERROR: "Error",
};
const ACTIVITY_COLOR: Record<string, string> = {
    downloading: "text-blue-400",
    uploading: "text-green-400",
    idle: "text-gray-500",
};

// ─── Small metric chip ────────────────────────────────────────────────────────
function Chip({
    label,
    value,
    color = "text-gray-300",
}: {
    label: string;
    value: string;
    color?: string;
}) {
    return (
        <div className="flex min-w-[72px] flex-col items-center rounded-lg bg-gray-800/60 px-3 py-1.5">
            <span className="text-[9px] font-bold tracking-widest text-gray-500 uppercase">
                {label}
            </span>
            <span className={`text-sm font-bold tabular-nums ${color}`}>
                {value}
            </span>
        </div>
    );
}

// ─── Global metrics bar ───────────────────────────────────────────────────────
function GlobalMetrics({ rows }: { rows: MovieRow[] }) {
    const active = rows.filter(
        (r) => r.status?.lifecycle_state === "DOWNLOADING"
    );
    const completed = rows.filter(
        (r) => r.status?.lifecycle_state === "COMPLETED"
    );
    const errored = rows.filter((r) => r.status?.lifecycle_state === "ERROR");
    const totalDlKb = active.reduce(
        (s, r) => s + (r.status?.download_rate_kb ?? 0),
        0
    );
    const totalUlKb = active.reduce(
        (s, r) => s + (r.status?.upload_rate_kb ?? 0),
        0
    );
    const totalPeers = active.reduce(
        (s, r) => s + (r.status?.num_peers ?? 0),
        0
    );

    return (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Chip
                label="Downloading"
                value={String(active.length)}
                color="text-blue-400"
            />
            <Chip
                label="Completed"
                value={String(completed.length)}
                color="text-green-400"
            />
            <Chip
                label="Errors"
                value={String(errored.length)}
                color={errored.length > 0 ? "text-red-400" : "text-gray-500"}
            />
            <Chip
                label="↓ Combined"
                value={fmtRate(totalDlKb)}
                color="text-blue-400"
            />
            <Chip
                label="↑ Combined"
                value={fmtRate(totalUlKb)}
                color="text-green-400"
            />
            <Chip
                label="Peers"
                value={String(totalPeers)}
                color="text-gray-300"
            />
        </div>
    );
}

// ─── Movie status card (horizontal) ──────────────────────────────────────────
function MovieCard({ row }: { row: MovieRow }) {
    const { movie, status } = row;
    const [imgErr, setImgErr] = useState(false);
    const lc = status?.lifecycle_state ?? "IDLE";
    const active = status?.activity ?? "idle";

    const pieces = status?.prioritized_pieces;
    const pieceRange =
        pieces && pieces.length > 0
            ? `${pieces[0]}–${pieces[pieces.length - 1]}`
            : null;

    return (
        <Link
            href={`/movies/${movie.id}`}
            className="group flex items-stretch gap-0 overflow-hidden rounded-xl border border-gray-800 bg-gray-900 transition-all duration-200 hover:border-gray-600 hover:bg-gray-800/80"
        >
            {/* Poster */}
            <div className="relative w-16 shrink-0 overflow-hidden sm:w-20">
                {!imgErr && movie.ytsPosterUrl ? (
                    <img
                        src={movie.ytsPosterUrl}
                        alt={movie.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={() => setImgErr(true)}
                    />
                ) : (
                    <div className="flex h-full min-h-[72px] w-full items-center justify-center bg-gray-800">
                        <svg
                            className="h-6 w-6 text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4"
                            />
                        </svg>
                    </div>
                )}
                {/* Status dot */}
                <span
                    className={`absolute top-1.5 left-1.5 h-2.5 w-2.5 rounded-full border-2 border-gray-900 shadow ${LC_DOT[lc] ?? "bg-gray-500"}`}
                />
            </div>

            {/* Content */}
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 p-3">
                {/* Top row: title + badge */}
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate text-sm leading-tight font-semibold text-white">
                            {movie.title}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-gray-500">
                            {movie.releaseYear}
                            {fmtRuntime(movie.runtimeMinutes) &&
                                ` · ${fmtRuntime(movie.runtimeMinutes)}`}
                            {movie.language &&
                                movie.language !== "Unknown" &&
                                ` · ${movie.language.toUpperCase()}`}
                            {movie.genres
                                ?.slice(0, 2)
                                .map((g) => ` · ${g}`)
                                .join("")}
                        </p>
                    </div>
                    <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide whitespace-nowrap uppercase ${LC_BG[lc] ?? "bg-gray-800 text-gray-400"}`}
                    >
                        {LC_LABEL[lc] ?? lc}
                    </span>
                </div>

                {/* Progress bar */}
                {status && lc !== "IDLE" && (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                            <span className="text-gray-500 tabular-nums">
                                {fmtBytes(status.downloaded_bytes)} /{" "}
                                {fmtBytes(status.total_size_bytes)}
                            </span>
                            <span className="font-semibold text-gray-400 tabular-nums">
                                {(status.progress_percent ?? 0).toFixed(1)}%
                            </span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-gray-700/60">
                            <div
                                className={`h-1 rounded-full transition-all duration-500 ${
                                    lc === "COMPLETED"
                                        ? "bg-green-500"
                                        : lc === "ERROR"
                                          ? "bg-red-500"
                                          : "bg-blue-500"
                                }`}
                                style={{
                                    width: `${Math.min(100, status.progress_percent ?? 0)}%`,
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Live stats row */}
                {status && lc === "DOWNLOADING" && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
                        <span
                            className={`font-semibold ${ACTIVITY_COLOR[active]}`}
                        >
                            {active === "downloading" &&
                                `↓ ${fmtRate(status.download_rate_kb)}`}
                            {active === "uploading" &&
                                `↑ ${fmtRate(status.upload_rate_kb)}`}
                            {active === "idle" && "idle"}
                        </span>
                        {(status.num_peers ?? 0) > 0 && (
                            <span className="text-gray-500">
                                {status.num_peers} peers
                            </span>
                        )}
                        {pieceRange && (
                            <span className="font-mono text-gray-600">
                                pieces {pieceRange}
                            </span>
                        )}
                        {(status.current_piece ?? -1) >= 0 && (
                            <span className="font-mono text-gray-600">
                                ▸ {status.current_piece}
                            </span>
                        )}
                    </div>
                )}

                {/* Completed summary */}
                {status && lc === "COMPLETED" && (
                    <div className="flex items-center gap-3 text-[10px]">
                        <span className="font-semibold text-green-400">
                            ✓ Complete
                        </span>
                        <span className="text-gray-500">
                            {fmtBytes(status.total_size_bytes)}
                        </span>
                        {(status.upload_rate_kb ?? 0) > 0.5 && (
                            <span className="text-green-400">
                                ↑ {fmtRate(status.upload_rate_kb)}
                            </span>
                        )}
                    </div>
                )}

                {/* Error */}
                {status && lc === "ERROR" && (
                    <p className="text-[10px] text-red-400">
                        Download error — check logs
                    </p>
                )}
            </div>
        </Link>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function DashboardPage() {
    const [rows, setRows] = useState<MovieRow[]>([]);
    const [meta, setMeta] = useState<PageMeta>({
        total: 0,
        page: 1,
        pageSize: 20,
        pages: 0,
    });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const rowsRef = useRef<MovieRow[]>([]);
    rowsRef.current = rows;

    // ── Fetch page of movies + their statuses ─────────────────────────────────
    const fetchPage = useCallback(async (p: number, ps: number, q: string) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: String(p),
                pageSize: String(ps),
                ...(q ? { search: q } : {}),
            });
            const res = await fetch(`/movies?${params}`);
            if (!res.ok) throw new Error(`Movies API returned ${res.status}`);
            const data = await res.json();

            const movies: Movie[] = Array.isArray(data)
                ? data
                : (data.movies ?? []);
            const total = data.total ?? movies.length;
            const pages = Math.ceil(total / ps) || 1;
            setMeta({ total, page: p, pageSize: ps, pages });

            const withStatus: MovieRow[] = await Promise.all(
                movies.map(async (movie) => {
                    try {
                        const sr = await fetch(
                            `${TORRENT_API_BASE_URL}/status/movie/${movie.id}`
                        );
                        const st: TorrentStatus | null = sr.ok
                            ? await sr.json()
                            : null;
                        return { movie, status: st };
                    } catch {
                        return { movie, status: null };
                    }
                })
            );
            setRows(withStatus);
        } catch (e: any) {
            setError(e.message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Re-fetch when page / pageSize / committed query changes
    useEffect(() => {
        fetchPage(page, pageSize, query);
    }, [page, pageSize, query, fetchPage]);

    // ── Live status polling every 2s ──────────────────────────────────────────
    useEffect(() => {
        pollRef.current = setInterval(() => {
            const current = rowsRef.current;
            if (current.length === 0) return;
            Promise.all(
                current.map(async (row) => {
                    try {
                        const sr = await fetch(
                            `${TORRENT_API_BASE_URL}/status/movie/${row.movie.id}`
                        );
                        const st: TorrentStatus | null = sr.ok
                            ? await sr.json()
                            : row.status;
                        return { ...row, status: st };
                    } catch {
                        return row;
                    }
                })
            ).then((updated) => setRows(updated));
        }, 2000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []); // stable — uses rowsRef

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        setQuery(search.trim());
    };
    const clearSearch = () => {
        setSearch("");
        setQuery("");
        setPage(1);
    };

    // Page window around current page (up to 5 buttons)
    const pageButtons = (() => {
        const total = meta.pages;
        const window = 2; // pages either side of current
        const start = Math.max(1, Math.min(page - window, total - window * 2));
        const end = Math.min(total, start + window * 2);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    })();

    const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
    const to = Math.min(meta.page * meta.pageSize, meta.total);

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* Header */}
            <header className="sticky top-0 z-30 border-b border-gray-800/50 bg-gray-950/90 backdrop-blur-md">
                <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
                    <Link href="/" className="flex shrink-0 items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600">
                            <svg
                                className="h-3 w-3 text-white"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                        <span className="text-sm font-bold">Hypertube</span>
                    </Link>
                    <div className="h-4 w-px bg-gray-700" />
                    <span className="text-sm font-semibold text-gray-200">
                        Downloads Dashboard
                    </span>
                    {meta.total > 0 && (
                        <span className="ml-auto text-xs text-gray-500 tabular-nums">
                            {meta.total.toLocaleString()} movies total
                        </span>
                    )}
                </div>
            </header>

            <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
                {/* Search */}
                <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="relative flex-1">
                        <svg
                            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"
                            />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by title…"
                            className="w-full rounded-xl border border-gray-700 bg-gray-900 py-2.5 pr-10 pl-10 text-sm text-white placeholder-gray-500 transition outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={clearSearch}
                                className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-300"
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
                        )}
                    </div>
                    <button
                        type="submit"
                        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:scale-95"
                    >
                        Search
                    </button>
                </form>

                {/* Active search chip */}
                {query && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">
                            Showing results for
                        </span>
                        <span className="rounded-full border border-blue-800/50 bg-blue-900/40 px-3 py-0.5 font-medium text-blue-300">
                            "{query}"
                        </span>
                        <button
                            onClick={clearSearch}
                            className="text-xs text-gray-500 underline underline-offset-2 transition-colors hover:text-gray-300"
                        >
                            clear
                        </button>
                    </div>
                )}

                {/* Global metrics */}
                {!loading && rows.length > 0 && (
                    <section>
                        <p className="mb-2.5 text-[10px] font-bold tracking-widest text-gray-600 uppercase">
                            Live activity — this page
                        </p>
                        <GlobalMetrics rows={rows} />
                    </section>
                )}

                {/* Movie list */}
                <section>
                    {loading ? (
                        <div className="space-y-2">
                            {Array.from({ length: Math.min(pageSize, 8) }).map(
                                (_, i) => (
                                    <div
                                        key={i}
                                        className="h-[72px] animate-pulse rounded-xl bg-gray-800/40"
                                        style={{
                                            animationDelay: `${i * 60}ms`,
                                        }}
                                    />
                                )
                            )}
                        </div>
                    ) : error ? (
                        <div className="space-y-2 rounded-xl border border-red-900/40 bg-red-950/20 px-6 py-10 text-center">
                            <p className="font-semibold text-red-400">
                                {error}
                            </p>
                            <p className="text-xs text-gray-500">
                                The Next.js API at{" "}
                                <code className="text-gray-400">/movies</code>{" "}
                                should accept{" "}
                                <code className="text-gray-400">?page</code>,{" "}
                                <code className="text-gray-400">?pageSize</code>
                                , and{" "}
                                <code className="text-gray-400">?search</code>{" "}
                                query params and return{" "}
                                <code className="text-gray-400">
                                    {"{ movies, total, page, pageSize }"}
                                </code>
                                .
                            </p>
                            <button
                                onClick={() => fetchPage(page, pageSize, query)}
                                className="mt-2 rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700"
                            >
                                Retry
                            </button>
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="rounded-xl border border-gray-800 bg-gray-900 px-6 py-16 text-center">
                            <p className="text-gray-400">
                                {query
                                    ? `No movies found for "${query}"`
                                    : "No movies in the database yet."}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {rows.map((row) => (
                                <MovieCard key={row.movie.id} row={row} />
                            ))}
                        </div>
                    )}
                </section>

                {/* Pagination */}
                {!loading && !error && meta.total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800/60 pt-5">
                        {/* Page size */}
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <label
                                htmlFor="page-size"
                                className="text-xs text-gray-500"
                            >
                                Show
                            </label>
                            <select
                                id="page-size"
                                value={pageSize}
                                onChange={(e) => {
                                    setPage(1);
                                    setPageSize(Number(e.target.value));
                                }}
                                className="cursor-pointer rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-sm text-white transition-colors outline-none focus:border-blue-500"
                            >
                                {PAGE_SIZE_OPTIONS.map((n) => (
                                    <option key={n} value={n}>
                                        {n} per page
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Range + buttons */}
                        <div className="flex items-center gap-1.5">
                            <span className="mr-1 text-xs text-gray-500 tabular-nums">
                                {from}–{to} of {meta.total.toLocaleString()}
                            </span>

                            {/* First */}
                            <button
                                onClick={() => setPage(1)}
                                disabled={page === 1}
                                title="First page"
                                className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                «
                            </button>
                            {/* Prev */}
                            <button
                                onClick={() =>
                                    setPage((p) => Math.max(1, p - 1))
                                }
                                disabled={page === 1}
                                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                ‹ Prev
                            </button>

                            {/* Page numbers */}
                            {pageButtons.map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    className={`min-w-[36px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                        p === page
                                            ? "border-blue-500 bg-blue-600 text-white"
                                            : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:text-white"
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}

                            {/* Next */}
                            <button
                                onClick={() =>
                                    setPage((p) => Math.min(meta.pages, p + 1))
                                }
                                disabled={page >= meta.pages}
                                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Next ›
                            </button>
                            {/* Last */}
                            <button
                                onClick={() => setPage(meta.pages)}
                                disabled={page >= meta.pages}
                                title="Last page"
                                className="rounded-lg border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                »
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
