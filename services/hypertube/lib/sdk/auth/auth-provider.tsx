"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { heartbeat, useSessionHeartbeat } from "./use-session-heartbeat";

type User = {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
};

type AuthCtx = {
    isLoaded: boolean;
    isSignedIn: boolean;
    user: User | null;
    signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
    isLoaded: false,
    isSignedIn: false,
    user: null,
    signOut: async () => {},
});

const fetchMe = async (): Promise<User | null> => {
    try {
        const res = await fetch("http://localhost:3000/api/auth/me");
        if (!res.ok) return null;
        const data = await res.json();
        return data.user ?? null;
    } catch {
        return null;
    }
};

const tryRefresh = async (): Promise<boolean> => {
    try {
        const res = await fetch("http://localhost:3333/api/v1/auth/refresh", {
            method: "POST",
            credentials: "include",
        });
        return res.ok;
    } catch {
        return false;
    }
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const session = useSessionHeartbeat();

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                // 1. Try /me with the current access cookie.
                let u = await fetchMe();

                // 2. If that 401'd, the access cookie is missing or expired.
                //    Use the longer-lived refresh cookie to mint a new one, then retry.
                if (!u) {
                    const refreshed = await tryRefresh();
                    if (refreshed && !cancelled) {
                        u = await fetchMe();
                    }
                }

                if (cancelled) return;

                if (u) {
                    setUser(u);
                    heartbeat.start(); // ← now actually fires
                }
            } finally {
                if (!cancelled) setIsLoaded(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const effectiveUser = session.status === "failed" ? null : user;

    const signOut = async () => {
        try {
            const res = await fetch("http://localhost:3000/api/auth/logout", {
                method: "POST",
            });

            if (!res.ok) {
                throw new Error("Failed to log out");
            }

            // Only clear state and redirect IF the server confirms logout
            heartbeat.stop();
            setUser(null);
            router.push("/login");
        } catch (error) {
            // Log the error or handle it, but DO NOT clear the user state
            console.error("Logout failed:", error);
            throw error; // Rethrow if you want the UI button to show an error message
        }
    };

    // --- GLOBAL 401 INTERCEPTOR (SMART RECOVERY) ---
    useEffect(() => {
        if (typeof window === "undefined" || !user) return;

        const originalFetch = window.fetch;

        window.fetch = async (...args) => {
            // 1. Clone the request securely BEFORE it is consumed.
            // If this is a POST request, the body is destroyed after the first attempt.
            let requestClone: Request | undefined;
            if (args[0] instanceof Request) {
                requestClone = args[0].clone();
            }

            // 2. Attempt the standard fetch
            let response = await originalFetch(...args);

            // 3. Extract the URL safely to check endpoints
            const url =
                typeof args[0] === "string"
                    ? args[0]
                    : args[0] instanceof Request
                      ? args[0].url
                      : args[0]?.toString() || "";

            const isAuthSystemEndpoint = url.includes("/api/v1/auth/");

            // 4. If it fails with 401 (and it isn't the login/refresh endpoint itself)
            if (response.status === 401 && !isAuthSystemEndpoint) {
                console.warn(
                    "⚠️ [Interceptor] 401 caught. Pausing fetch to recover session..."
                );

                // 5. Instantly force the heartbeat to refresh
                const recovered = await heartbeat.triggerRefresh();

                if (recovered) {
                    console.log(
                        "✅ [Interceptor] Session recovered! Replaying request seamlessly..."
                    );

                    // 6. Replay the exact same request.
                    // The browser will automatically attach the newly minted cookies.
                    response = requestClone
                        ? await originalFetch(requestClone)
                        : await originalFetch(...args);
                }
                // If !recovered, the heartbeat's catch block has already triggered
                // onSessionLost() and redirected the user.
            }

            return response;
        };

        // Cleanup: Restore original fetch if the component unmounts
        return () => {
            window.fetch = originalFetch;
        };
    }, [user]); // Re-bind if the user state changes

    return (
        <Ctx.Provider
            value={{
                isLoaded,
                isSignedIn: !!effectiveUser,
                user: effectiveUser,
                signOut,
            }}
        >
            {children}
        </Ctx.Provider>
    );
}

export const useAuth = () => useContext(Ctx);
