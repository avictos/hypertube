"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { useAuth } from "@/lib/sdk/auth/auth-provider";

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const { isLoaded, isSignedIn } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    // 1. Auth Redirect Logic
    useEffect(() => {
        // Only act after the AuthProvider finishes its initial network checks
        if (isLoaded && !isSignedIn) {
            router.push(`/login?redirect_url=${encodeURIComponent(pathname)}`);
        }
    }, [isLoaded, isSignedIn, router, pathname]);

    // 2. Fallback Hard Refresh Timer
    useEffect(() => {
        // If the auth state has already loaded, we don't need the timer
        if (isLoaded) return;

        const fallbackTimer = setTimeout(() => {
            console.warn(
                "Auth state resolution timed out. Forcing hard refresh..."
            );
            window.location.reload();
        }, 1000); // 1000ms = 1 second

        // Cleanup: Clear the timeout if isLoaded resolves before the timer finishes
        return () => clearTimeout(fallbackTimer);
    }, [isLoaded]);

    // 3. Freeze the UI while checking the session in the background
    if (!isLoaded || !isSignedIn) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-950">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-700 border-t-blue-500" />
            </div>
        );
    }

    return (
        <>
            <Header />
            {children}
            <Footer />
        </>
    );
}
