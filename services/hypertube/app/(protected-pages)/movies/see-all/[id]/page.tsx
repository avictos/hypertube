"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Movie, MovieCard } from "@/components/movie-card";

const API = "/api";

const TITLES: Record<string, string> = {
    "new-releases": "New Releases",
    popular: "Popular Right Now",
    "continue-watching": "Continue Watching",
};

const MODES: Record<string, string> = {
    "new-releases": "new-releases",
    popular: "popular",
    "continue-watching": "continue-watching",
};

interface ApiResponse {
    movies: Movie[];
    total?: number;
    pages?: number;
}

export default function SeeAllPage() {
    const { id: category } = useParams<{ id: string }>();

    const mode = MODES[category] ?? "new-releases";
    const title = TITLES[category] ?? "Movies";

    const [movies, setMovies] = useState<Movie[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // UI state for rendering skeletons
    const [loading, setLoading] = useState(false);

    // Background tracking to break the React infinite loop
    const isFetchingRef = useRef(false);

    const sentinelRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef(1);

    const fetchPage = useCallback(
        async (p: number, reset: boolean) => {
            // Check the ref instead of the state to avoid dependency cycles
            if (isFetchingRef.current && !reset) return;

            isFetchingRef.current = true;
            setLoading(true);

            try {
                let url = `/movies?mode=${mode}&page=${p}&pageSize=20`;

                if (mode === "continue-watching") {
                    const userId =
                        typeof window !== "undefined"
                            ? (localStorage.getItem("hypertube_user_id") ??
                              "user_12345")
                            : "user_12345";

                    url = `${API}/movies/continue-watching?userId=${encodeURIComponent(userId)}&page=${p}&pageSize=20`;
                }

                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: ApiResponse = await res.json();
                const rows = data.movies ?? [];

                setMovies((prev) => (reset ? rows : [...prev, ...rows]));
                setHasMore(rows.length > 0 && p < (data.pages ?? 1));
            } catch {
                setHasMore(false);
            } finally {
                isFetchingRef.current = false;
                setLoading(false);
            }
        },
        [mode] // Removed `loading` from dependencies!
    );

    useEffect(() => {
        pageRef.current = 1;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPage(1);
        setMovies([]);
        setHasMore(true);
        fetchPage(1, true);
    }, [fetchPage]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            (entries) => {
                // Check the ref here so we don't need to put `loading` in the dependency array
                if (
                    entries[0].isIntersecting &&
                    hasMore &&
                    !isFetchingRef.current
                ) {
                    const next = pageRef.current + 1;
                    pageRef.current = next;
                    setPage(next);
                    fetchPage(next, false);
                }
            },
            { rootMargin: "300px" }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [hasMore, fetchPage]); // Removed `loading` from dependencies!

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
                <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-6 py-4">
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
                        <span className="text-sm font-bold">Hypertube</span>
                    </Link>
                    <div className="h-4 w-px bg-gray-700" />
                    <Link
                        href="/"
                        className="text-sm text-gray-500 transition-colors hover:text-gray-300"
                    >
                        Home
                    </Link>
                    <svg
                        className="h-3 w-3 text-gray-700"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                        />
                    </svg>
                    <span className="text-sm font-semibold text-white">
                        {title}
                    </span>
                </div>
            </header>

            <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-10">
                <div className="flex items-baseline justify-between">
                    <h1 className="text-2xl font-bold">{title}</h1>
                    {movies.length > 0 && !loading && (
                        <span className="text-sm text-gray-500">
                            {movies.length} movie
                            {movies.length !== 1 ? "s" : ""} loaded
                            {hasMore && " · scroll for more"}
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {movies.map((m) => (
                        <MovieCard key={m.id} movie={m} />
                    ))}
                    {loading &&
                        Array.from({ length: 20 }).map((_, i) => (
                            <div
                                key={`skel-${i}`}
                                className="animate-pulse"
                                style={{ animationDelay: `${i * 30}ms` }}
                            >
                                <div className="aspect-2/3 rounded-xl bg-gray-800" />
                                <div className="mt-2 h-3 w-4/5 rounded bg-gray-800" />
                                <div className="mt-1.5 h-2.5 w-2/5 rounded bg-gray-800" />
                            </div>
                        ))}
                </div>

                <div ref={sentinelRef} className="flex justify-center py-6">
                    {!loading && !hasMore && movies.length > 0 && (
                        <p className="text-xs text-gray-600">
                            All {movies.length} movies loaded
                        </p>
                    )}
                    {!loading && !hasMore && movies.length === 0 && (
                        <p className="text-sm text-gray-500">
                            No movies found.
                        </p>
                    )}
                </div>
            </main>
        </div>
    );
}
