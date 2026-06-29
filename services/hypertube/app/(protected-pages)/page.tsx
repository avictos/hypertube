/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { Movie, MovieCard } from "@/components/movie-card";

// ─── Constants & Types ────────────────────────────────────────────────────────
const API = "/api";

interface ApiResponse {
    movies: Movie[];
    total: number;
    page: number;
    pageSize: number;
    pages: number;
}

const GENRES = [
    "Action",
    "Adventure",
    "Animation",
    "Biography",
    "Comedy",
    "Crime",
    "Documentary",
    "Drama",
    "Family",
    "Fantasy",
    "Film-Noir",
    "History",
    "Horror",
    "Music",
    "Musical",
    "Mystery",
    "Romance",
    "Sci-Fi",
    "Sport",
    "Thriller",
    "War",
    "Western",
];

const LANGUAGES = [
    "English",
    "French",
    "Spanish",
    "German",
    "Italian",
    "Japanese",
    "Korean",
    "Portuguese",
    "Chinese",
    "Arabic",
    "Hindi",
    "Turkish",
];

const SORT_OPTIONS = [
    { value: "", label: "Random" },
    { value: "year", label: "Newest first" },
    { value: "rating", label: "Top rated" },
    { value: "title", label: "A → Z" },
];

// ─── Carousel row ─────────────────────────────────────────────────────────────
function CarouselRow({
    title,
    mode,
    seeAllHref,
}: {
    title: string;
    mode: string;
    seeAllHref: string;
}) {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchMovies = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/movies?mode=${mode}&pageSize=20`);
            const d: ApiResponse | null = r.ok ? await r.json() : null;
            setMovies(d?.movies ?? []);
        } catch {
            setMovies([]);
        } finally {
            setLoading(false);
        }
    }, [mode]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchMovies();
    }, [fetchMovies]);

    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) fetchMovies();
        };
        window.addEventListener("pageshow", onPageShow);
        return () => window.removeEventListener("pageshow", onPageShow);
    }, [fetchMovies]);

    const scroll = (dir: "left" | "right") => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollBy({ left: dir === "right" ? 640 : -640, behavior: "smooth" });
    };

    if (!loading && movies.length === 0) return null;

    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{title}</h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => scroll("left")}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-700 bg-gray-800/80 text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
                    >
                        <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                    </button>
                    <button
                        onClick={() => scroll("right")}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-700 bg-gray-800/80 text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
                    >
                        <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M9 5l7 7-7 7"
                            />
                        </svg>
                    </button>
                    <Link
                        href={seeAllHref}
                        className="text-sm font-medium text-blue-400 transition-colors hover:text-blue-300"
                    >
                        See all →
                    </Link>
                </div>
            </div>

            <div className="relative">
                <div className="pointer-events-none absolute top-0 left-0 z-10 h-full w-8 bg-gradient-to-r from-gray-950 to-transparent" />
                <div className="pointer-events-none absolute top-0 right-0 z-10 h-full w-8 bg-gradient-to-l from-gray-950 to-transparent" />

                <div
                    ref={scrollRef}
                    className="flex gap-3 overflow-x-auto scroll-smooth pb-2"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                    {loading
                        ? Array.from({ length: 8 }).map((_, i) => (
                              <div
                                  key={i}
                                  className="w-48 shrink-0 animate-pulse sm:w-52 lg:w-56 xl:w-60"
                              >
                                  <div className="aspect-2/3 rounded-xl bg-gray-800" />
                                  <div className="mt-2 h-3 w-4/5 rounded bg-gray-800" />
                                  <div className="mt-1.5 h-2.5 w-2/5 rounded bg-gray-800" />
                              </div>
                          ))
                        : movies.map((movie) => (
                              <div
                                  key={movie.id}
                                  className="w-48 shrink-0 sm:w-52 lg:w-56 xl:w-60"
                              >
                                  <MovieCard movie={movie} />
                              </div>
                          ))}
                </div>
            </div>
        </section>
    );
}

// ─── Continue Watching row ─────────────────────────────────────────────────────
function ContinueWatchingRow() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchContinueWatching = useCallback(async () => {
        setLoading(true);
        const userId =
            typeof window !== "undefined"
                ? (localStorage.getItem("hypertube_user_id") ?? "user_12345")
                : "user_12345";

        try {
            const r = await fetch(
                `${API}/movies/continue-watching?userId=${encodeURIComponent(userId)}`
            );
            const d = r.ok ? await r.json() : { movies: [] };
            setMovies(d.movies ?? []);
        } catch {
            setMovies([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchContinueWatching();
    }, [fetchContinueWatching]);

    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) fetchContinueWatching();
        };
        window.addEventListener("pageshow", onPageShow);
        return () => window.removeEventListener("pageshow", onPageShow);
    }, [fetchContinueWatching]);

    if (!loading && movies.length === 0) return null;

    const scroll = (dir: "left" | "right") => {
        scrollRef.current?.scrollBy({
            left: dir === "right" ? 640 : -640,
            behavior: "smooth",
        });
    };

    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">
                    Continue Watching
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => scroll("left")}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-700 bg-gray-800/80 text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
                    >
                        <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                    </button>
                    <button
                        onClick={() => scroll("right")}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-700 bg-gray-800/80 text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
                    >
                        <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M9 5l7 7-7 7"
                            />
                        </svg>
                    </button>
                    {/* Added the See all link right here */}
                    <Link
                        href="/movies/see-all/continue-watching"
                        className="text-sm font-medium text-blue-400 transition-colors hover:text-blue-300"
                    >
                        See all →
                    </Link>
                </div>
            </div>

            <div className="relative">
                <div className="pointer-events-none absolute top-0 left-0 z-10 h-full w-8 bg-gradient-to-r from-gray-950 to-transparent" />
                <div className="pointer-events-none absolute top-0 right-0 z-10 h-full w-8 bg-gradient-to-l from-gray-950 to-transparent" />
                <div
                    ref={scrollRef}
                    className="flex gap-3 overflow-x-auto scroll-smooth pb-2"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                    {loading
                        ? Array.from({ length: 6 }).map((_, i) => (
                              <div
                                  key={i}
                                  className="w-48 shrink-0 animate-pulse sm:w-52 lg:w-56 xl:w-60"
                              >
                                  <div className="aspect-[2/3] rounded-xl bg-gray-800" />
                                  <div className="mt-2 h-3 w-4/5 rounded bg-gray-800" />
                              </div>
                          ))
                        : movies.map((movie) => (
                              <div
                                  key={movie.id}
                                  className="w-48 shrink-0 sm:w-52 lg:w-56 xl:w-60"
                              >
                                  <MovieCard movie={movie} />
                              </div>
                          ))}
                </div>
            </div>
        </section>
    );
}

// ─── Range slider component ───────────────────────────────────────────────────
function RangeSlider({
    label,
    min,
    max,
    step = 1,
    value,
    onChange,
    fmt = (v: number) => String(v),
}: {
    label: string;
    min: number;
    max: number;
    step?: number;
    value: [number, number];
    onChange: (v: [number, number]) => void;
    fmt?: (v: number) => string;
}) {
    const [lo, hi] = value;
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-400">{label}</span>
                <span className="text-gray-300 tabular-nums">
                    {fmt(lo)} – {fmt(hi)}
                </span>
            </div>
            <div className="relative flex items-center gap-2">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={lo}
                    onChange={(e) => {
                        const v = Number(e.target.value);
                        onChange([Math.min(v, hi - step), hi]);
                    }}
                    className="h-1 w-full cursor-pointer accent-blue-500"
                />
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={hi}
                    onChange={(e) => {
                        const v = Number(e.target.value);
                        onChange([lo, Math.max(v, lo + step)]);
                    }}
                    className="h-1 w-full cursor-pointer accent-blue-500"
                />
            </div>
        </div>
    );
}

// ─── Browse section (Row 4) ───────────────────────────────────────────────────
interface BrowseFilters {
    yearRange: [number, number];
    ratingRange: [number, number];
    durRange: [number, number];
    genres: string[];
    language: string;
    isNewRelease: boolean;
    isPopular: boolean;
    sort: string;
}

const DEFAULT_FILTERS: BrowseFilters = {
    yearRange: [1900, new Date().getFullYear()],
    ratingRange: [0, 10],
    durRange: [0, 300],
    genres: [],
    language: "",
    isNewRelease: false,
    isPopular: false,
    sort: "",
};

function BrowseSection() {
    const [movies, setMovies] = useState<Movie[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState<BrowseFilters>(DEFAULT_FILTERS);
    const [pending, setPending] = useState<BrowseFilters>(DEFAULT_FILTERS);
    const [showFilters, setShowFilters] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const PAGE_SIZE = 10;

    const toParams = (f: BrowseFilters, p: number) => {
        const ps = new URLSearchParams({
            mode: "browse",
            page: String(p),
            pageSize: String(PAGE_SIZE),
        });
        if (f.sort) ps.set("sort", f.sort);
        if (f.yearRange[0] > 1900) ps.set("yearFrom", String(f.yearRange[0]));
        if (f.yearRange[1] < new Date().getFullYear())
            ps.set("yearTo", String(f.yearRange[1]));
        if (f.ratingRange[0] > 0) ps.set("ratingMin", String(f.ratingRange[0]));
        if (f.ratingRange[1] < 10)
            ps.set("ratingMax", String(f.ratingRange[1]));
        if (f.durRange[0] > 0) ps.set("durMin", String(f.durRange[0]));
        if (f.durRange[1] < 300) ps.set("durMax", String(f.durRange[1]));
        if (f.genres.length) ps.set("genres", f.genres.join(","));
        if (f.language) ps.set("language", f.language);
        if (f.isNewRelease) ps.set("isNewRelease", "true");
        if (f.isPopular) ps.set("isPopular", "true");
        return ps.toString();
    };

    const fetchPage = useCallback(
        async (f: BrowseFilters, p: number, reset: boolean) => {
            setLoading(true);
            try {
                const res = await fetch(`/movies?${toParams(f, p)}`);
                const data: ApiResponse = await res.json();
                const rows = data.movies ?? [];
                setMovies((prev) => {
                    if (reset) return rows;
                    const seen = new Set(prev.map((m) => m.id));
                    const fresh = rows.filter((m) => !seen.has(m.id));
                    return [...prev, ...fresh];
                });
                setHasMore(p < (data.pages ?? 1) && rows.length > 0);
            } catch {
                setHasMore(false);
            } finally {
                setLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        fetchPage(filters, 1, true);
    }, [filters, fetchPage]);

    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                setPage(1);
                fetchPage(filters, 1, true);
            }
        };
        window.addEventListener("pageshow", onPageShow);
        return () => window.removeEventListener("pageshow", onPageShow);
    }, [filters, fetchPage]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    setPage((p) => {
                        const next = p + 1;
                        fetchPage(filters, next, false);
                        return next;
                    });
                }
            },
            { rootMargin: "200px" }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [hasMore, loading, filters, fetchPage]);

    const applyFilters = () => {
        setFilters(pending);
        setPage(1);
        setShowFilters(false);
    };

    const resetFilters = () => {
        setPending(DEFAULT_FILTERS);
        setFilters(DEFAULT_FILTERS);
        setPage(1);
    };

    const toggleGenre = (g: string) => {
        setPending((f) => ({
            ...f,
            genres: f.genres.includes(g)
                ? f.genres.filter((x) => x !== g)
                : [...f.genres, g],
        }));
    };

    const activeFilterCount = useMemo(() => {
        let n = 0;
        if (filters.genres.length) n++;
        if (filters.language) n++;
        if (filters.isNewRelease) n++;
        if (filters.isPopular) n++;
        if (filters.sort) n++;
        if (filters.yearRange[0] > 1900) n++;
        if (filters.yearRange[1] < new Date().getFullYear()) n++;
        if (filters.ratingRange[0] > 0) n++;
        if (filters.ratingRange[1] < 10) n++;
        if (filters.durRange[0] > 0) n++;
        if (filters.durRange[1] < 300) n++;
        return n;
    }, [filters]);

    const curYear = new Date().getFullYear();

    return (
        <section className="space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Discover</h2>
                <button
                    onClick={() => {
                        setPending(filters);
                        setShowFilters((f) => !f);
                    }}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                        activeFilterCount > 0
                            ? "border-blue-500 bg-blue-600/20 text-blue-300"
                            : "border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-500 hover:text-white"
                    }`}
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
                            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
                        />
                    </svg>
                    Filters
                    {activeFilterCount > 0 && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>

            {activeFilterCount > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {filters.genres.map((g) => (
                        <span
                            key={g}
                            className="flex items-center gap-1 rounded-full border border-blue-800/50 bg-blue-900/40 px-2.5 py-0.5 text-xs font-medium text-blue-300"
                        >
                            {g}
                            <button
                                onClick={() =>
                                    setFilters((f) => ({
                                        ...f,
                                        genres: f.genres.filter((x) => x !== g),
                                    }))
                                }
                                className="ml-0.5 opacity-70 hover:opacity-100"
                            >
                                ✕
                            </button>
                        </span>
                    ))}
                    {filters.language && (
                        <span className="flex items-center gap-1 rounded-full border border-purple-800/50 bg-purple-900/40 px-2.5 py-0.5 text-xs font-medium text-purple-300">
                            {filters.language}
                            <button
                                onClick={() =>
                                    setFilters((f) => ({ ...f, language: "" }))
                                }
                                className="ml-0.5 opacity-70 hover:opacity-100"
                            >
                                ✕
                            </button>
                        </span>
                    )}
                    {filters.isNewRelease && (
                        <span className="flex items-center gap-1 rounded-full border border-amber-800/50 bg-amber-900/40 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                            New Release
                            <button
                                onClick={() =>
                                    setFilters((f) => ({
                                        ...f,
                                        isNewRelease: false,
                                    }))
                                }
                                className="ml-0.5 opacity-70 hover:opacity-100"
                            >
                                ✕
                            </button>
                        </span>
                    )}
                    {filters.isPopular && (
                        <span className="flex items-center gap-1 rounded-full border border-rose-800/50 bg-rose-900/40 px-2.5 py-0.5 text-xs font-medium text-rose-300">
                            Popular
                            <button
                                onClick={() =>
                                    setFilters((f) => ({
                                        ...f,
                                        isPopular: false,
                                    }))
                                }
                                className="ml-0.5 opacity-70 hover:opacity-100"
                            >
                                ✕
                            </button>
                        </span>
                    )}
                    <button
                        onClick={resetFilters}
                        className="text-xs text-gray-500 underline underline-offset-2 transition-colors hover:text-gray-300"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {showFilters && (
                <div className="space-y-5 rounded-2xl border border-gray-700/60 bg-gray-900 p-5">
                    <div className="space-y-2">
                        <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                            Sort by
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {SORT_OPTIONS.map((o) => (
                                <button
                                    key={o.value}
                                    onClick={() =>
                                        setPending((f) => ({
                                            ...f,
                                            sort: o.value,
                                        }))
                                    }
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                        pending.sort === o.value
                                            ? "border-blue-500 bg-blue-600/30 text-blue-300"
                                            : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
                                    }`}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                            Genre
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {GENRES.map((g) => (
                                <button
                                    key={g}
                                    onClick={() => toggleGenre(g)}
                                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                        pending.genres.includes(g)
                                            ? "border-blue-500 bg-blue-600/30 text-blue-300"
                                            : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
                                    }`}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                            Category
                        </p>
                        <div className="flex gap-2">
                            {[
                                { key: "isNewRelease", label: "New Release" },
                                { key: "isPopular", label: "Popular" },
                            ].map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() =>
                                        setPending((f) => ({
                                            ...f,
                                            [key]: !f[
                                                key as keyof BrowseFilters
                                            ],
                                        }))
                                    }
                                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                        pending[key as keyof BrowseFilters]
                                            ? "border-blue-500 bg-blue-600/30 text-blue-300"
                                            : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                            Language
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {LANGUAGES.map((l) => (
                                <button
                                    key={l}
                                    onClick={() =>
                                        setPending((f) => ({
                                            ...f,
                                            language: f.language === l ? "" : l,
                                        }))
                                    }
                                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                        pending.language === l
                                            ? "border-purple-500 bg-purple-600/30 text-purple-300"
                                            : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
                                    }`}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-3">
                        <RangeSlider
                            label="Release year"
                            min={1900}
                            max={curYear}
                            step={1}
                            value={pending.yearRange}
                            onChange={(v) =>
                                setPending((f) => ({ ...f, yearRange: v }))
                            }
                        />
                        <RangeSlider
                            label="Rating"
                            min={0}
                            max={10}
                            step={0.5}
                            value={pending.ratingRange}
                            onChange={(v) =>
                                setPending((f) => ({ ...f, ratingRange: v }))
                            }
                            fmt={(v) => v.toFixed(1)}
                        />
                        <RangeSlider
                            label="Duration (min)"
                            min={0}
                            max={300}
                            step={5}
                            value={pending.durRange}
                            onChange={(v) =>
                                setPending((f) => ({ ...f, durRange: v }))
                            }
                            fmt={(v) =>
                                v === 0 ? "any" : v >= 300 ? "300+" : `${v}m`
                            }
                        />
                    </div>

                    <div className="flex items-center gap-3 border-t border-gray-800 pt-4">
                        <button
                            onClick={applyFilters}
                            className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                        >
                            Apply filters
                        </button>
                        <button
                            onClick={() => setPending(DEFAULT_FILTERS)}
                            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
                        >
                            Reset
                        </button>
                        <button
                            onClick={() => setShowFilters(false)}
                            className="ml-auto text-xs text-gray-600 transition-colors hover:text-gray-400"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {movies.length === 0 && !loading ? (
                <div className="rounded-xl border border-gray-800 bg-gray-900/50 py-16 text-center">
                    <p className="text-gray-500">
                        No movies match these filters.
                    </p>
                    <button
                        onClick={resetFilters}
                        className="mt-3 text-sm text-blue-400 hover:text-blue-300"
                    >
                        Clear filters
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {movies.map((movie) => (
                        <MovieCard key={movie.id} movie={movie} />
                    ))}
                </div>
            )}

            <div ref={sentinelRef} className="flex justify-center py-4">
                {loading && (
                    <svg
                        className="h-6 w-6 animate-spin text-gray-600"
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
                )}
                {!loading && !hasMore && movies.length > 0 && (
                    <p className="text-xs text-gray-600">All caught up</p>
                )}
            </div>
        </section>
    );
}

// ─── Home page ────────────────────────────────────────────────────────────────
export default function MoviesPage() {
    return (
        <main className="mx-auto max-w-[1600px] space-y-10 px-6 py-10">
            <CarouselRow
                title="New Releases"
                mode="new-releases"
                seeAllHref="/movies/see-all/new-releases"
            />
            <CarouselRow
                title="Popular Right Now"
                mode="popular"
                seeAllHref="/movies/see-all/popular"
            />
            <ContinueWatchingRow />
            <div className="border-t border-gray-800/60" />
            <BrowseSection />
        </main>
    );
}
