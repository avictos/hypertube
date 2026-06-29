"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MovieCard } from "@/components/movie-card";

const MOCK_USER_ID = "user_12345";

export default function FavoritesPage() {
    const [movies, setMovies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFavorites = async () => {
            try {
                const res = await fetch(
                    `/api/favorites?userId=${MOCK_USER_ID}`
                );
                if (res.ok) {
                    const json = await res.json();
                    setMovies(json.data || []);
                }
            } catch (error) {
                console.error("Failed to fetch favorites", error);
            } finally {
                setLoading(false);
            }
        };

        fetchFavorites();
    }, []);

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-white">
            <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
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
                            My Favorites
                        </h1>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-6 py-8">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-700 border-t-pink-500" />
                    </div>
                ) : movies.length === 0 ? (
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
                                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                            />
                        </svg>
                        <p className="text-lg font-medium">
                            You haven't saved any movies yet.
                        </p>
                        <Link
                            href="/"
                            className="mt-4 text-sm text-pink-500 hover:underline"
                        >
                            Browse movies
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {movies.map((movie) => (
                            <MovieCard key={movie.id} movie={movie} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
