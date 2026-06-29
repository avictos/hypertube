"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { SearchBar } from "@/components/search-bar";
import { useAuth } from "@/lib/sdk/auth/auth-provider";

const AUTH_API = "http://localhost:3000";

function UserAvatar({
    firstName,
    lastName,
}: {
    firstName: string;
    lastName: string;
}) {
    const initials =
        `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    return (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {initials}
        </div>
    );
}

function UserButton() {
    const { user, signOut } = useAuth();
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        }
        function onEscape(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("mousedown", onClickOutside);
        document.addEventListener("keydown", onEscape);
        return () => {
            document.removeEventListener("mousedown", onClickOutside);
            document.removeEventListener("keydown", onEscape);
        };
    }, []);

    if (!user) return null;

    const handleLogout = async () => {
        setOpen(false);
        try {
            await signOut();
        } catch {
            window.alert("Failed to log out");
        }
    };

    const handleLogoutAll = async () => {
        if (!confirm("Log out of all devices, including this one?")) return;
        setOpen(false);
        try {
            const res = await fetch(`${AUTH_API}/api/auth/logout/all`, {
                method: "POST",
            });
            if (!res.ok) {
                window.alert("Failed to log out of all devices");
            }
            window.location.href = "/login";
        } catch {
            window.alert("Failed to log out of all devices");
        }
    };

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-950 focus:outline-none"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <UserAvatar
                    firstName={user.firstName}
                    lastName={user.lastName}
                />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-2xl"
                >
                    <div className="border-b border-gray-800 px-4 py-3">
                        <p className="truncate text-sm font-semibold text-white">
                            {user.firstName} {user.lastName}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                            {user.email}
                        </p>
                    </div>

                    <div className="py-1">
                        <Link
                            href="/settings"
                            onClick={() => setOpen(false)}
                            className="block px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                            role="menuitem"
                        >
                            Settings
                        </Link>
                        <Link
                            href="/developer"
                            onClick={() => setOpen(false)}
                            className="block px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                            role="menuitem"
                        >
                            Developer
                        </Link>
                    </div>

                    <div className="border-t border-gray-800 py-1">
                        <button
                            onClick={handleLogout}
                            className="block w-full px-4 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                            role="menuitem"
                        >
                            Log out
                        </button>
                        <button
                            onClick={handleLogoutAll}
                            className="block w-full px-4 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                            role="menuitem"
                        >
                            Log out of all devices
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function Header() {
    const { isLoaded, isSignedIn } = useAuth();

    return (
        <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
            {/* Responsive Container: 
                Uses flex-wrap so the search bar can drop to a new line on very small screens.
            */}
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-y-4 px-4 py-3 sm:px-6 sm:py-4">
                {/* Logo */}
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
                    <span className="text-sm font-bold tracking-wide text-white">
                        Hypertube
                    </span>
                </Link>

                {/* Search Bar 
                    order-last on mobile forces it to its own row.
                    sm:order-none brings it back to the middle on larger screens.
                */}
                <div className="order-last w-full sm:order-none sm:flex sm:flex-1 sm:justify-center sm:px-4">
                    <SearchBar />
                </div>

                {/* Right Side Actions */}
                <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                    {/* Navigation Icons: Icons on mobile, Text + Icons on desktop */}
                    <div className="flex items-center gap-1 sm:gap-2">
                        <Link
                            href="/favorites"
                            className="flex items-center gap-2 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                            title="Favorites"
                        >
                            <svg
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                                />
                            </svg>
                            <span className="hidden text-sm font-medium sm:block">
                                Favorites
                            </span>
                        </Link>

                        <Link
                            href="/history"
                            className="flex items-center gap-2 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                            title="Watch History"
                        >
                            <svg
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <span className="hidden text-sm font-medium sm:block">
                                History
                            </span>
                        </Link>
                    </div>

                    {/* Divider */}
                    <div className="hidden h-6 w-px bg-gray-800 sm:block"></div>

                    {/* Auth Status */}
                    {!isLoaded ? (
                        <div className="h-9 w-9 animate-pulse rounded-full bg-gray-800" />
                    ) : isSignedIn ? (
                        <UserButton />
                    ) : (
                        <Link
                            href="/login"
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
                        >
                            Log in
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
