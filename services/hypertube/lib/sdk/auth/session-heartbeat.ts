// src/lib/auth/session-heartbeat.ts

/**
 * SessionHeartbeatManager
 * --------------------------------------------------------------------
 * Framework-agnostic, singleton-friendly background refresher for
 * short-lived auth tokens.
 *
 * Pillars:
 *  1. Lives outside React. State drives React via useSyncExternalStore;
 *     React never drives the heartbeat.
 *  2. One refresh per interval *across all tabs* of the same origin:
 *     navigator.locks for exclusion + BroadcastChannel for propagation.
 *  3. Battery- and network-aware: pauses on hidden tabs and idle users.
 *  4. Resilient: exponential backoff with full jitter, hard-fail surfaces
 *     a single onSessionLost() callback.
 */

export type SessionStatus =
    | "idle" // start() not yet called
    | "running" // healthy, timer scheduled
    | "refreshing" // a refresh is in flight
    | "paused" // hidden tab or inactive user
    | "failed"; // retries exhausted, session lost

export interface SessionSnapshot {
    status: SessionStatus;
    lastRefreshAt: number | null;
    nextRefreshAt: number | null;
    consecutiveFailures: number;
    isDocumentVisible: boolean;
    isUserActive: boolean;
}

export interface SessionHeartbeatConfig {
    /** Hits your refresh endpoint. Throw on hard failure. */
    refresh: () => Promise<void>;
    /** Called once retries are exhausted. Boot to /login here. */
    onSessionLost: () => void;
    /** Server-side token TTL. Default 60_000. */
    tokenTTLMs?: number;
    /** Refresh this far ahead of expiry. Default 10_000. */
    refreshBeforeExpiryMs?: number;
    /** Pause heartbeat after this long with no input. Default 5 min. */
    inactivityThresholdMs?: number;
    /** Retries before giving up. Default 4. */
    maxRetries?: number;
    /** Backoff base — doubles per attempt. Default 1_000. */
    baseBackoffMs?: number;
    /** Backoff ceiling. Default 30_000. */
    maxBackoffMs?: number;
    /** BroadcastChannel name. */
    channelName?: string;
    /** Web Lock name. */
    lockName?: string;
}

type BroadcastMessage =
    | { type: "refresh-succeeded"; at: number }
    | { type: "refresh-failed"; at: number }
    | { type: "session-lost"; at: number };

const DEFAULTS = {
    tokenTTLMs: 60_000,
    refreshBeforeExpiryMs: 10_000,
    inactivityThresholdMs: 5 * 60_000,
    maxRetries: 4,
    baseBackoffMs: 1_000,
    maxBackoffMs: 30_000,
    channelName: "session-heartbeat",
    lockName: "session-refresh-lock",
} as const;
const SERVER_SNAPSHOT: SessionSnapshot = Object.freeze({
    status: "idle",
    lastRefreshAt: null,
    nextRefreshAt: null,
    consecutiveFailures: 0,
    isDocumentVisible: true,
    isUserActive: true,
});

export class SessionHeartbeatManager {
    private readonly cfg: Required<SessionHeartbeatConfig>;
    private snapshot: SessionSnapshot;
    private listeners = new Set<() => void>();

    private channel: BroadcastChannel | null = null;
    private timerId: number | null = null;
    private inactivityTimerId: number | null = null;
    private activityThrottleAt = 0;
    private disposed = false;

    private static readonly ACTIVITY_THROTTLE_MS = 1_000;

    private readonly activityEvents: Array<keyof WindowEventMap> = [
        "mousemove",
        "keydown",
        "click",
        "touchstart",
        "scroll",
    ];

    constructor(config: SessionHeartbeatConfig) {
        this.cfg = { ...DEFAULTS, ...config };
        this.snapshot = {
            status: "idle",
            lastRefreshAt: null,
            nextRefreshAt: null,
            consecutiveFailures: 0,
            isDocumentVisible:
                typeof document !== "undefined" ? !document.hidden : true,
            isUserActive: true,
        };
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /** Start the heartbeat. Idempotent. No-op on server. */
    start(): void {
        if (typeof window === "undefined" || this.disposed) return;
        if (
            this.snapshot.status !== "idle" &&
            this.snapshot.status !== "failed"
        )
            return;

        this.openChannel();
        this.attachLifecycleListeners();
        this.attachActivityListeners();
        this.setState({ status: "running", consecutiveFailures: 0 });
        this.scheduleNextRefresh();
    }

    /** Stop refreshes, detach listeners. Instance remains reusable. */
    stop(): void {
        this.clearTimer();
        this.clearInactivityTimer();
        this.detachLifecycleListeners();
        this.detachActivityListeners();
        this.closeChannel();
        if (!this.disposed) this.setState({ status: "idle" });
    }

    /** Permanently destroy. Call on logout / app teardown. */
    dispose(): void {
        this.stop();
        this.disposed = true;
        this.listeners.clear();
    }

    /** * Force a synchronous refresh (e.g., from an interceptor).
     * Bypasses the background backoff loop for immediate resolution.
     * Returns true if successful, false if the session is permanently dead.
     */
    async triggerRefresh(): Promise<boolean> {
        if (this.disposed) return false;

        try {
            // Lock ensures we don't collide with background tabs
            await this.withLock(async () => {
                await this.cfg.refresh();

                const at = Date.now();
                this.setState({
                    status: "running",
                    lastRefreshAt: at,
                    consecutiveFailures: 0,
                });
                this.broadcast({ type: "refresh-succeeded", at });
            });

            // Re-sync the background timer now that we have a fresh token
            this.scheduleNextRefresh();
            return true;
        } catch {
            // If a manual, active-user refresh fails, the client token is dead.
            // Instantly fail the session and trigger the boot to /login.
            this.setState({ status: "failed" });
            this.broadcast({ type: "session-lost", at: Date.now() });
            this.cfg.onSessionLost();
            return false;
        }
    }

    // ------------------------------------------------------------------
    // External store contract — bound as arrow properties so React can
    // pass them by reference to useSyncExternalStore without rebinding.
    // ------------------------------------------------------------------

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener) as unknown as void;
    };

    /**
     * Referentially stable until setState produces a new object.
     * Critical: returning a fresh object every call would cause React
     * to render in a loop.
     */
    getSnapshot = (): SessionSnapshot => this.snapshot;

    getServerSnapshot = (): SessionSnapshot => SERVER_SNAPSHOT;

    // ------------------------------------------------------------------
    // Core loop
    // ------------------------------------------------------------------

    private get heartbeatIntervalMs(): number {
        return Math.max(
            1_000,
            this.cfg.tokenTTLMs - this.cfg.refreshBeforeExpiryMs
        );
    }

    /**
     * Schedules via absolute timestamps so pause/resume doesn't drift.
     * Returns early if paused — onVisibilityChange/onActivity will
     * re-schedule when conditions change.
     */
    private scheduleNextRefresh(delayMs?: number): void {
        this.clearTimer();
        if (this.disposed) return;
        if (this.snapshot.status === "failed") return;
        if (!this.snapshot.isDocumentVisible || !this.snapshot.isUserActive) {
            this.setState({ status: "paused", nextRefreshAt: null });
            return;
        }

        const wait = delayMs ?? this.heartbeatIntervalMs;
        const nextRefreshAt = Date.now() + wait;
        this.setState({ nextRefreshAt });

        this.timerId = window.setTimeout(() => {
            void this.attemptRefresh("interval");
        }, wait);
    }

    /**
     * Acquire same-origin Web Lock → only one tab actually hits the
     * network. Other tabs await the lock, then notice (via the
     * BroadcastChannel handler having already updated `lastRefreshAt`)
     * that the work is done and exit without re-fetching.
     */
    private async attemptRefresh(
        reason: "interval" | "visibility" | "manual"
    ): Promise<void> {
        if (this.disposed || this.snapshot.status === "refreshing") return;
        this.setState({ status: "refreshing" });

        try {
            await this.withLock(async () => {
                // While we waited for the lock, a sibling tab may have refreshed.
                // If we're well within the interval, no need to hit the network.
                const sinceLast = this.snapshot.lastRefreshAt
                    ? Date.now() - this.snapshot.lastRefreshAt
                    : Infinity;
                if (
                    reason === "interval" &&
                    sinceLast < this.heartbeatIntervalMs / 2
                ) {
                    return;
                }

                await this.cfg.refresh();
                if (this.disposed) return;

                const at = Date.now();
                this.setState({
                    status: "running",
                    lastRefreshAt: at,
                    consecutiveFailures: 0,
                });
                this.broadcast({ type: "refresh-succeeded", at });
            });

            if (!this.disposed) this.scheduleNextRefresh();
        } catch {
            if (this.disposed) return;

            const failures = this.snapshot.consecutiveFailures + 1;

            if (failures >= this.cfg.maxRetries) {
                this.setState({
                    status: "failed",
                    consecutiveFailures: failures,
                });
                this.broadcast({ type: "session-lost", at: Date.now() });
                this.cfg.onSessionLost();
                return;
            }

            // Full jitter backoff (AWS-style): delay = rand(0, min(cap, base * 2^n)).
            // Full jitter outperforms "decorrelated" jitter for thundering-herd
            // scenarios when many tabs retry simultaneously.
            const cap = Math.min(
                this.cfg.maxBackoffMs,
                this.cfg.baseBackoffMs * 2 ** (failures - 1)
            );
            const delay = Math.floor(Math.random() * cap);

            this.setState({ status: "running", consecutiveFailures: failures });
            this.broadcast({ type: "refresh-failed", at: Date.now() });
            this.scheduleNextRefresh(delay);
        }
    }

    /** Web Lock if available, otherwise plain execution. */
    private async withLock(fn: () => Promise<void>): Promise<void> {
        const hasLocks =
            typeof navigator !== "undefined" &&
            "locks" in navigator &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typeof (navigator as any).locks?.request === "function";

        if (!hasLocks) return fn();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (navigator as any).locks.request(
            this.cfg.lockName,
            { mode: "exclusive" },
            fn
        );
    }

    // ------------------------------------------------------------------
    // Cross-tab sync
    // ------------------------------------------------------------------

    private openChannel(): void {
        if (typeof BroadcastChannel === "undefined") return;
        this.channel = new BroadcastChannel(this.cfg.channelName);
        this.channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
            const msg = event.data;
            switch (msg.type) {
                case "refresh-succeeded":
                    // Don't pull ourselves out of a "refreshing" state mid-flight.
                    // attemptRefresh will reschedule when it exits.
                    if (this.snapshot.status === "refreshing") {
                        this.setState({
                            lastRefreshAt: msg.at,
                            consecutiveFailures: 0,
                        });
                    } else {
                        this.setState({
                            status: "running",
                            lastRefreshAt: msg.at,
                            consecutiveFailures: 0,
                        });
                        this.scheduleNextRefresh();
                    }
                    break;
                case "session-lost":
                    this.setState({ status: "failed" });
                    this.cfg.onSessionLost();
                    break;
                case "refresh-failed":
                    // Informational — siblings run their own backoff independently.
                    break;
            }
        };
    }

    private broadcast(msg: BroadcastMessage): void {
        try {
            this.channel?.postMessage(msg);
        } catch {
            // Channel may be closed during shutdown — ignore.
        }
    }

    private closeChannel(): void {
        try {
            this.channel?.close();
        } catch {}
        this.channel = null;
    }

    // ------------------------------------------------------------------
    // Visibility
    // ------------------------------------------------------------------

    private onVisibilityChange = (): void => {
        const visible = !document.hidden;
        this.setState({ isDocumentVisible: visible });

        if (!visible) {
            this.clearTimer();
            this.setState({ status: "paused", nextRefreshAt: null });
            return;
        }

        // Tab just became visible — was the timer overdue?
        const elapsed = Date.now() - (this.snapshot.lastRefreshAt ?? 0);

        if (elapsed >= this.heartbeatIntervalMs) {
            void this.attemptRefresh("visibility");
        } else if (this.snapshot.isUserActive) {
            this.setState({ status: "running" });
            this.scheduleNextRefresh(this.heartbeatIntervalMs - elapsed);
        }
    };

    private attachLifecycleListeners(): void {
        document.addEventListener("visibilitychange", this.onVisibilityChange);
    }

    private detachLifecycleListeners(): void {
        document.removeEventListener(
            "visibilitychange",
            this.onVisibilityChange
        );
    }

    // ------------------------------------------------------------------
    // Inactivity
    // ------------------------------------------------------------------

    private onActivity = (): void => {
        const now = Date.now();
        if (
            now - this.activityThrottleAt <
            SessionHeartbeatManager.ACTIVITY_THROTTLE_MS
        ) {
            return;
        }

        this.activityThrottleAt = now;

        const wasInactive = !this.snapshot.isUserActive;
        if (wasInactive) {
            this.setState({ isUserActive: true });
            // Resume if conditions allow.
            if (
                this.snapshot.status === "paused" &&
                this.snapshot.isDocumentVisible
            ) {
                const elapsed = Date.now() - (this.snapshot.lastRefreshAt ?? 0);
                this.setState({ status: "running" });
                if (elapsed >= this.heartbeatIntervalMs) {
                    void this.attemptRefresh("manual");
                } else {
                    this.scheduleNextRefresh(
                        this.heartbeatIntervalMs - elapsed
                    );
                }
            }
        }

        this.resetInactivityTimer();
    };

    private resetInactivityTimer(): void {
        this.clearInactivityTimer();
        this.inactivityTimerId = window.setTimeout(() => {
            // Mark inactive, pause heartbeat. Session expires naturally — that's
            // the security benefit, not a bug.
            this.setState({ isUserActive: false });
            this.clearTimer();
            this.setState({ status: "paused", nextRefreshAt: null });
        }, this.cfg.inactivityThresholdMs);
    }

    private attachActivityListeners(): void {
        const opts: AddEventListenerOptions = { passive: true };
        for (const ev of this.activityEvents) {
            window.addEventListener(ev, this.onActivity, opts);
        }
        this.resetInactivityTimer();
    }

    private detachActivityListeners(): void {
        for (const ev of this.activityEvents) {
            window.removeEventListener(ev, this.onActivity);
        }
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private clearTimer(): void {
        if (this.timerId !== null) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
    }

    private clearInactivityTimer(): void {
        if (this.inactivityTimerId !== null) {
            clearTimeout(this.inactivityTimerId);
            this.inactivityTimerId = null;
        }
    }

    /**
     * Immutable update + change detection. Skips work — and the listener
     * fan-out — when no field in the patch actually changes. Allocating a
     * new snapshot object every time on no-op patches would still pass
     * `===` checks but burns CPU in components doing selector comparisons.
     */
    private setState(patch: Partial<SessionSnapshot>): void {
        let changed = false;
        for (const k in patch) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((this.snapshot as any)[k] !== (patch as any)[k]) {
                changed = true;
                break;
            }
        }
        if (!changed) return;

        this.snapshot = { ...this.snapshot, ...patch };
        for (const listener of this.listeners) listener();
    }
}

// ---- Lazy singleton (SSR-safe) ----

let instance: SessionHeartbeatManager | null = null;

export function getSessionHeartbeat(
    config: SessionHeartbeatConfig
): SessionHeartbeatManager {
    if (!instance) instance = new SessionHeartbeatManager(config);
    return instance;
}

export function disposeSessionHeartbeat(): void {
    instance?.dispose();
    instance = null;
}
