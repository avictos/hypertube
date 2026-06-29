"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { MovieCard } from "@/components/movie-card"; // Assuming you have this exported

// Match the player's mock ID until you implement real auth
const MOCK_USER_ID = "user_12345";

interface HistoryMovie {
    id: string;
    title: string;
    releaseYear: number;
    rating: number;
    ytsPosterUrl: string;
    watchedAt: string;
    lastWatchedSeconds: number;
    runtimeMinutes: number | null;
}

// --- Helper: Smart Date Formatter ---
function getSmartDateGroup(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) return "Today";
    if (isYesterday) return "Yesterday";

    const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];
    const dayName = days[date.getDay()];
    const dayNum = date.getDate().toString().padStart(2, "0");
    const monthNum = (date.getMonth() + 1).toString().padStart(2, "0");
    const yearNum = date.getFullYear();

    const isSameMonth =
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
    const isSameYear = date.getFullYear() === today.getFullYear();

    if (isSameMonth) {
        return `${dayName} ${dayNum}`; // Tuesday 16
    } else if (isSameYear) {
        return `${dayName} ${dayNum}/${monthNum}`; // Monday 10/05
    } else {
        return `${dayName} ${dayNum}/${monthNum}/${yearNum}`; // Friday 12/12/2025
    }
}

export default function WatchHistoryPage() {
    const [movies, setMovies] = useState<HistoryMovie[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    const observerTarget = useRef<HTMLDivElement>(null);

    // --- Debounce Search Input ---
    useEffect(() => {
        const handler = setTimeout(() => {
            // FIX: Only trigger the reset if the search query ACTUALLY changed.
            // This prevents the initial mount from wiping the first fetch.
            if (searchQuery !== debouncedSearch) {
                setDebouncedSearch(searchQuery);
                setPage(1); // Reset to page 1 on new search
                setMovies([]); // Clear existing movies
                setHasMore(true);
            }
        }, 400); // 400ms delay

        return () => clearTimeout(handler);
    }, [searchQuery, debouncedSearch]);

    // --- Fetch History ---
    const fetchHistory = useCallback(
        async (pageNum: number, search: string) => {
            if (loading || (!hasMore && pageNum !== 1)) return;

            setLoading(true);
            try {
                const res = await fetch(
                    `/api/history?userId=${MOCK_USER_ID}&page=${pageNum}&limit=20&search=${encodeURIComponent(search)}`
                );
                if (res.ok) {
                    const json = await res.json();
                    if (pageNum === 1) {
                        setMovies(json.data);
                    } else {
                        setMovies((prev) => [...prev, ...json.data]);
                    }
                    setHasMore(json.hasMore);
                }
            } catch (error) {
                console.error("Failed to fetch history", error);
            } finally {
                setLoading(false);
            }
        },
        [loading, hasMore]
    );

    // Trigger fetch when page or search changes
    useEffect(() => {
        fetchHistory(page, debouncedSearch);
    }, [page, debouncedSearch]);

    // --- Infinite Scroll Observer ---
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    setPage((prev) => prev + 1);
                }
            },
            { threshold: 1.0 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => observer.disconnect();
    }, [hasMore, loading]);

    // --- Group Movies by Date ---
    const groupedMovies = movies.reduce(
        (acc, movie) => {
            const group = getSmartDateGroup(movie.watchedAt);
            if (!acc[group]) acc[group] = [];
            acc[group].push(movie);
            return acc;
        },
        {} as Record<string, HistoryMovie[]>
    );

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-white">
            <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="text-gray-400 transition-colors hover:text-white"
                        >
                            <svg
                                className="h-5 w-5"
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
                        </Link>
                        <h1 className="text-xl font-bold tracking-tight">
                            Watch History
                        </h1>
                    </div>

                    {/* Search Bar */}
                    <div className="relative w-full max-w-xs">
                        <svg
                            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search your history..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-full border border-gray-700 bg-gray-900 py-2 pr-4 pl-10 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-6 py-8">
                {Object.keys(groupedMovies).length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                        <svg
                            className="mb-4 h-12 w-12 text-gray-700"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        <p className="text-lg font-medium">
                            No watch history found.
                        </p>
                        {debouncedSearch && (
                            <p className="text-sm">
                                Try adjusting your search.
                            </p>
                        )}
                    </div>
                )}

                <div className="space-y-10">
                    {Object.entries(groupedMovies).map(
                        ([dateGroup, groupMovies]) => (
                            <section key={dateGroup}>
                                <h2 className="mb-4 text-sm font-bold tracking-widest text-gray-400 uppercase">
                                    {dateGroup}
                                </h2>
                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                                    {groupMovies.map((movie) => (
                                        <div
                                            key={movie.id}
                                            className="relative"
                                        >
                                            <MovieCard movie={movie as any} />

                                            {/* Progress Bar Overlay */}
                                            <div className="absolute bottom-0 left-0 w-full overflow-hidden rounded-b-xl bg-gray-900/80">
                                                <div
                                                    className="h-1 bg-blue-500"
                                                    style={{
                                                        width: `${Math.min(100, (movie.lastWatchedSeconds / ((movie.runtimeMinutes || 120) * 60)) * 100)}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )
                    )}
                </div>

                {/* Invisible element to trigger infinite scroll */}
                <div
                    ref={observerTarget}
                    className="h-10 w-full py-8 text-center"
                >
                    {loading && (
                        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
                    )}
                </div>
            </main>
        </div>
    );
}
