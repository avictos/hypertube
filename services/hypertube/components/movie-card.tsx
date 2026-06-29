"use client";

import { useState } from "react";
import Link from "next/link";

export interface Movie {
    id: string;
    title: string;
    releaseYear: number;
    rating: number | null;
    runtimeMinutes: number | null;
    genres: string[] | null;
    ytsPosterUrl: string;
    description: string | null;
    language: string | null;
    mpaRating: string | null;
}

export function StarRating({ rating }: { rating: number }) {
    const filled = Math.round(rating / 2);
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
                <svg
                    key={i}
                    className={`h-3.5 w-3.5 ${i <= filled ? "text-amber-400" : "text-gray-600"}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            ))}
            <span className="ml-1 text-xs text-gray-400">
                {rating.toFixed(1)}
            </span>
        </div>
    );
}

export function MovieCard({ movie }: { movie: Movie }) {
    const [imageError, setImageError] = useState(false);
    const primaryGenre = movie.genres?.[0] ?? "Film";

    return (
        <Link href={`/movies/${movie.id}`} className="group block">
            <div className="relative overflow-hidden rounded-xl border border-gray-700/50 bg-gray-800/60 transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-500/40 hover:bg-gray-800 hover:shadow-lg hover:shadow-blue-950/30">
                {/* Poster */}
                <div className="relative aspect-[2/3] overflow-hidden bg-gray-900">
                    {!imageError && movie.ytsPosterUrl ? (
                        <img
                            src={movie.ytsPosterUrl}
                            alt={movie.title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center">
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
                    {/* Genre badge */}
                    <div className="absolute top-2.5 left-2.5">
                        <span className="rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium text-gray-300 backdrop-blur-sm">
                            {primaryGenre}
                        </span>
                    </div>
                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600/90 shadow-lg">
                            <svg
                                className="h-6 w-6 translate-x-0.5 text-white"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Info */}
                <div className="p-3.5">
                    <h3 className="mb-1 truncate text-sm font-semibold text-white transition-colors group-hover:text-blue-300">
                        {movie.title}
                    </h3>
                    <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                        <span>{movie.releaseYear}</span>
                        {movie.runtimeMinutes && movie.runtimeMinutes > 0 ? (
                            <>
                                <span>·</span>
                                <span>
                                    {Math.floor(movie.runtimeMinutes / 60)}h{" "}
                                    {movie.runtimeMinutes % 60}m
                                </span>
                            </>
                        ) : null}
                    </div>
                    <StarRating rating={movie.rating || 0} />
                </div>
            </div>
        </Link>
    );
}
