"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/sdk/auth/auth-provider";

// 1. Move the logic into an inner "Guard" component
function AuthGuard({ children }: { children: React.ReactNode }) {
    const { isLoaded, isSignedIn } = useAuth();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            // Send them back to where they came from, or default to home.
            // This must be a hard navigation: a soft `router.push` leaves the
            // browser sitting on /login because the destination route segment
            // was never (re)validated against the just-refreshed session cookie
            // (it's typically the segment the user bounced *from* before the
            // refresh completed). A full navigation re-runs middleware against
            // the fresh cookies, which is exactly what manually reloading does.
            const redirectUrl = searchParams.get("redirect_url") || "/";
            window.location.href = redirectUrl;
        }
    }, [isLoaded, isSignedIn, searchParams]);

    // Prevent the login form from flashing on the screen while we check the session
    if (!isLoaded || isSignedIn) {
        return <div className="min-h-screen bg-gray-950" />;
    }

    // No valid session found. Let them see the login/register forms.
    return <>{children}</>;
}

// 2. Export the layout wrapped in a Suspense boundary
export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
            <AuthGuard>{children}</AuthGuard>
        </Suspense>
    );
}
