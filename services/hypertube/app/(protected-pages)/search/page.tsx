"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Movie, MovieCard } from "@/components/movie-card";
import LoadingSpinner from "@/components/ui/loading-spinner";

function SearchResultsContent() {
    const searchParams = useSearchParams();
    const query = searchParams.get("q");

    const [movies, setMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSearchResults = async () => {
            if (!query) return;

            setLoading(true);
            setError(null);
            setMovies([]); // Reset movies on new search

            try {
                const res = await fetch(
                    `/api/search?q=${encodeURIComponent(query)}`
                );

                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }

                if (!res.body) {
                    throw new Error(
                        "ReadableStream not supported in this browser."
                    );
                }

                // Attach a stream reader to parse NDJSON (Newline-Delimited JSON)
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    // Decode the chunk and add it to our text buffer
                    buffer += decoder.decode(value, { stream: true });

                    // Split by newlines (NDJSON format)
                    const lines = buffer.split("\n");

                    // Keep the last incomplete line in the buffer
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const movieData = JSON.parse(line);

                                // Catch server-streamed errors
                                if (movieData.error) {
                                    throw new Error(movieData.error);
                                }

                                // Update state dynamically as each movie arrives
                                setMovies((prev) => {
                                    // Prevent duplicates just in case
                                    if (prev.some((m) => m.id === movieData.id))
                                        return prev;
                                    return [...prev, movieData];
                                });
                            } catch (e) {
                                console.error(
                                    "Failed to parse JSON stream chunk",
                                    e
                                );
                            }
                        }
                    }
                }
            } catch (err: any) {
                setError(err.message ?? "Failed to search movies");
            } finally {
                setLoading(false);
            }
        };

        fetchSearchResults();
    }, [query]);

    return (
        <div className="min-h-screen bg-gray-950 font-sans text-white">
            <main className="mx-auto max-w-7xl px-6 py-10">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white">
                            Search Results
                        </h1>
                        <p className="mt-1 text-gray-500">
                            {query
                                ? `Showing results for "${query}"`
                                : "Enter a search term above."}
                        </p>
                    </div>
                    {/* Small subtle spinner in the top right while the stream is still processing missing assets */}
                    {loading && movies.length > 0 && (
                        <div className="flex items-center gap-3 text-sm text-blue-400">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
                            Fetching missing metadata...
                        </div>
                    )}
                </div>

                {/* Big spinner only shows if we are loading AND have zero movies so far */}
                {loading && movies.length === 0 && !error && (
                    <div className="rounded-xl border border-blue-900/50 bg-blue-950/30 p-12 text-center">
                        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-700 border-t-blue-500" />
                        <p className="font-medium text-blue-400">
                            Searching database...
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                            This may take a moment if the movies are new.
                        </p>
                    </div>
                )}

                {error && (
                    <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-8 text-center">
                        <p className="font-medium text-red-400">{error}</p>
                    </div>
                )}

                {!loading && !error && movies.length === 0 && query && (
                    <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-12 text-center">
                        <p className="font-medium text-gray-400">
                            No movies found for "{query}".
                        </p>
                    </div>
                )}

                {/* Grid renders independently of the loading state so it updates live */}
                {movies.length > 0 && (
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

export default function SearchResultsPage() {
    return (
        <Suspense fallback={<LoadingSpinner />}>
            <SearchResultsContent />
        </Suspense>
    );
}
