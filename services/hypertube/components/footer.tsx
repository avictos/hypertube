import Link from "next/link";

export function Footer() {
    return (
        <footer className="border-t border-gray-800 bg-gray-950">
            <div className="mx-auto max-w-[1600px] px-6 py-10">
                <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-600">
                            <svg
                                className="h-2.5 w-2.5 text-white"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                        <span className="text-sm font-bold text-white">
                            Hypertube
                        </span>
                    </Link>

                    <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
                        <Link
                            href="/"
                            className="transition-colors hover:text-gray-300"
                        >
                            Home
                        </Link>
                        <Link
                            href="/favorites"
                            className="transition-colors hover:text-gray-300"
                        >
                            Favorites
                        </Link>
                        <Link
                            href="/history"
                            className="transition-colors hover:text-gray-300"
                        >
                            Watch History
                        </Link>
                        <Link
                            href="/settings"
                            className="transition-colors hover:text-gray-300"
                        >
                            Settings
                        </Link>
                    </nav>

                    <p className="text-xs text-gray-600">
                        © {new Date().getFullYear()} Hypertube. All rights
                        reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
}
