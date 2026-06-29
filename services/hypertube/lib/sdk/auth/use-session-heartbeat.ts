"use client";

import { useSyncExternalStore } from "react";
import { getSessionHeartbeat, type SessionSnapshot } from "./session-heartbeat";

// Module-level: constructed once per tab, lazy.
const heartbeat = getSessionHeartbeat({
    refresh: async () => {
        const res = await fetch("http://localhost:3333/api/v1/auth/refresh", {
            method: "POST",
            credentials: "include",
        });
        if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    },
    onSessionLost: () => {
        if (typeof window === "undefined") return;
        const next = encodeURIComponent(window.location.pathname);
        window.location.href = `/login?redirect_url=${next}`;
    },
});

export function useSessionHeartbeat(): SessionSnapshot {
    return useSyncExternalStore(
        heartbeat.subscribe,
        heartbeat.getSnapshot,
        heartbeat.getServerSnapshot
    );
}

export { heartbeat };
