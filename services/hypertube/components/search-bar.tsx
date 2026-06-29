"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SearchBar() {
    const [query, setQuery] = useState("");
    const router = useRouter();

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            router.push(`/search?q=${encodeURIComponent(query.trim())}`);
        }
    };

    return (
        <form onSubmit={handleSearch} className="relative w-full max-w-lg">
            <div className="relative flex items-center overflow-hidden rounded-xl border border-gray-700 bg-gray-900/50 shadow-inner backdrop-blur-sm transition-all focus-within:border-blue-500 focus-within:bg-gray-900 focus-within:ring-1 focus-within:ring-blue-500">
                <div className="pr-2 pl-4 text-gray-500">
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
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search for movies..."
                    className="w-full bg-transparent py-3 pr-4 pl-2 text-sm text-white placeholder-gray-500 outline-none"
                />
                <button
                    type="submit"
                    className="mr-2 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
                >
                    Search
                </button>
            </div>
        </form>
    );
}
