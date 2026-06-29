import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, importSPKI } from "jose";

const publicRoutes = [
    "/login",
    "/register",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
];

// Always public regardless of auth state — unlike `publicRoutes`, these aren't
// auth pages that should bounce a logged-in user away.
const ALWAYS_PUBLIC_PATHS = new Set(["/api-docs"]);

// POST oauth/token is how a client without any credentials yet obtains one — it
// must stay reachable with no session/bearer token present, unlike every other API
// route. Both the spec's bare path and the /api-prefixed proxy route are exempted.
const PUBLIC_API_EXACT_PATHS = new Set(["/oauth/token", "/api/oauth/token"]);

// The spec'd REST surface lives at bare paths (no /api prefix) so it matches the
// subject exactly. None of these collide with a UI page, except /movies/:id which
// is also the movie-player page — that one is handled separately below via content
// negotiation instead of a fixed path list.
const BARE_API_EXACT_PATHS = new Set(["/movies", "/users", "/comments"]);

function isBareApiPath(pathname: string): boolean {
    if (BARE_API_EXACT_PATHS.has(pathname)) return true;
    if (/^\/users\/[^/]+$/.test(pathname)) return true;
    if (/^\/comments\/[^/]+$/.test(pathname)) return true;
    if (/^\/movies\/[^/]+\/comments$/.test(pathname)) return true;
    return false;
}

/**
 * /movies/:id is both the movie-player page (browser navigation) and the spec'd
 * `GET /movies/:id` JSON endpoint (curl/Postman/grading scripts) — `excludes
 * "/movies/see-all" which isn't a real route on its own (only /movies/see-all/:id is).
 */
function isMovieDetailPath(pathname: string): boolean {
    return /^\/movies\/[^/]+$/.test(pathname) && pathname !== "/movies/see-all";
}

/**
 * True for an actual browser page-navigation or one of Next.js's own internal
 * RSC/prefetch requests for that page — both must keep rendering the page. False
 * for a plain fetch/curl/Postman call, which should get the JSON API instead.
 */
function prefersPage(request: NextRequest): boolean {
    if (request.headers.get("RSC")) return true;
    if (request.headers.get("Next-Router-Prefetch")) return true;
    if (request.headers.get("Next-Router-State-Tree")) return true;
    const accept = request.headers.get("accept") ?? "";
    return accept.includes("text/html");
}

const API_BASE_URL = process.env.AUTH_INTERNAL_URL ?? "http://localhost:3333";
const JWKS_CLIENT_SECRET = process.env.JWT_PUBLIC_KEY_ACCESS_SECRET;

// Module-scope cache: survives across requests on the same warm edge instance,
// mirroring how Clerk caches its JWKS key material instead of fetching per-request.
let cachedPublicKey: CryptoKey | null = null;
let cachedKeyFetchedAt = 0;
const KEY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — keys rotate rarely, so this is generous

async function getVerificationKey(): Promise<CryptoKey | null> {
    const isStale = Date.now() - cachedKeyFetchedAt > KEY_CACHE_TTL_MS;

    if (cachedPublicKey && !isStale) {
        return cachedPublicKey;
    }

    try {
        const res = await fetch(
            `${API_BASE_URL}/api/v1/auth/.well-known/jwks.json`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientSecret: JWKS_CLIENT_SECRET }),
                // Edge runtime: this is a plain fetch, no Node-only APIs involved.
            }
        );

        if (!res.ok) {
            return cachedPublicKey; // fall back to whatever we had, even if stale
        }

        const data = await res.json();
        const spki: string | undefined = data?.publicKey;

        if (!spki) {
            return cachedPublicKey;
        }

        cachedPublicKey = await importSPKI(spki, "RS256");
        cachedKeyFetchedAt = Date.now();
        return cachedPublicKey;
    } catch {
        // Network hiccup fetching the key — degrade to the stale cached key rather
        // than hard-failing every request in middleware.
        return cachedPublicKey;
    }
}

type SessionState = "valid" | "expired" | "invalid" | "missing";

type VerifiedToken = {
    state: SessionState;
    /** The token's `sub` claim (the user id), only set when state === "valid". */
    userId?: string;
    /** The token's `username` claim, only set when state === "valid". */
    username?: string;
};

async function verifyToken(token: string | undefined): Promise<VerifiedToken> {
    if (!token) return { state: "missing" };

    const key = await getVerificationKey();
    if (!key) {
        // Can't verify locally right now (key fetch failed and nothing cached yet).
        // Treat as "valid" optimistically so we don't lock everyone out on a key-fetch
        // blip; the actual API call will still 401 if the token is genuinely bad.
        return { state: "valid" };
    }

    try {
        const { payload } = await jwtVerify(token, key, {
            algorithms: ["RS256"],
        });
        return {
            state: "valid",
            userId: typeof payload.sub === "string" ? payload.sub : undefined,
            username:
                typeof payload.username === "string"
                    ? payload.username
                    : undefined,
        };
    } catch (error: any) {
        if (error?.code === "ERR_JWT_EXPIRED") {
            return { state: "expired" };
        }
        return { state: "invalid" };
    }
}

export async function middleware(request: NextRequest) {
    const { nextUrl, cookies } = request;

    if (
        PUBLIC_API_EXACT_PATHS.has(nextUrl.pathname) ||
        ALWAYS_PUBLIC_PATHS.has(nextUrl.pathname)
    ) {
        return NextResponse.next();
    }

    const sessionToken = cookies.get("__session")?.value;
    const clientToken = cookies.get("__client")?.value;

    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : undefined;

    const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
    const isMovieDetail = isMovieDetailPath(nextUrl.pathname);
    const isMovieDetailAsApi = isMovieDetail && !prefersPage(request);
    const isApiRoute =
        nextUrl.pathname === "/api" ||
        nextUrl.pathname.startsWith("/api/") ||
        isBareApiPath(nextUrl.pathname) ||
        isMovieDetailAsApi;

    let isAuthenticated = false;
    let verifiedUserId: string | undefined;
    let verifiedUsername: string | undefined;

    // Non-browser API clients (e.g. a token minted via POST /oauth/token) authenticate
    // with a bearer token instead of cookies. It's signed with the same RS256 key as
    // the session cookie, so it verifies through the exact same JWKS-backed check.
    if (bearerToken) {
        const bearerResult = await verifyToken(bearerToken);
        if (bearerResult.state === "valid") {
            isAuthenticated = true;
            verifiedUserId = bearerResult.userId;
            verifiedUsername = bearerResult.username;
        } else if (isApiRoute) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }
    }

    if (!isAuthenticated) {
        // Session token (short-lived) is the primary signal. If it's missing or expired,
        // fall back to checking the client token (long-lived refresh token) is at least
        // present+valid — that tells us the AuthProvider's heartbeat should be able to
        // recover the session client-side, so we don't need to hard-redirect.
        const sessionResult = await verifyToken(sessionToken);
        isAuthenticated = sessionResult.state === "valid";
        verifiedUserId = sessionResult.userId;
        verifiedUsername = sessionResult.username;

        if (!isAuthenticated) {
            const clientResult = await verifyToken(clientToken);
            // If session is expired/missing but client token is valid, we still let the
            // request through — AuthProvider's mount/heartbeat logic refreshes it.
            if (clientResult.state === "valid") {
                isAuthenticated = true;
                verifiedUserId = clientResult.userId;
                verifiedUsername = clientResult.username;
            }
        }
    }

    if (!isAuthenticated) {
        if (isPublicRoute) return NextResponse.next();

        if (isApiRoute) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const redirectUrl = new URL("/login", nextUrl.origin);
        redirectUrl.searchParams.set("redirect_url", nextUrl.pathname);
        return NextResponse.redirect(redirectUrl);
    }

    if (isPublicRoute && isAuthenticated) {
        const rawRedirectUrl = nextUrl.searchParams.get("redirect_url");
        let safeRedirectUrl = "/";

        if (rawRedirectUrl) {
            const basePath = rawRedirectUrl.split("?")[0];
            if (
                rawRedirectUrl.startsWith("/") &&
                !rawRedirectUrl.startsWith("//") &&
                !publicRoutes.includes(basePath)
            ) {
                safeRedirectUrl = rawRedirectUrl;
            }
        }
        return NextResponse.redirect(new URL(safeRedirectUrl, nextUrl.origin));
    }

    // Forward the verified identity to route handlers via a request header so they
    // don't need to re-decode the token themselves (and can't be spoofed by a client
    // since this header is set here, not copied from the incoming request).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("x-verified-user-id");
    requestHeaders.delete("x-verified-username");
    if (verifiedUserId) {
        requestHeaders.set("x-verified-user-id", verifiedUserId);
    }
    if (verifiedUsername) {
        requestHeaders.set("x-verified-username", verifiedUsername);
    }

    // Non-page requests to /movies/:id (curl/Postman/grading scripts) are served by
    // the JSON handler kept at /api/movies/:id — Next.js won't let a route.ts and the
    // movie-player page.tsx resolve to the same path, so this is done via rewrite
    // instead of moving the file. Browser navigations are untouched and keep hitting
    // the page above this point.
    if (isMovieDetailAsApi) {
        const movieId = nextUrl.pathname.split("/")[2];
        const rewriteUrl = new URL(`/api/movies/${movieId}`, nextUrl.origin);
        rewriteUrl.search = nextUrl.search;
        return NextResponse.rewrite(rewriteUrl, {
            request: { headers: requestHeaders },
        });
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
    matcher: [
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        "/(api|trpc)(.*)",
    ],
};
