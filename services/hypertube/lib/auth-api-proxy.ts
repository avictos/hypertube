import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const AUTH_API = process.env.AUTH_INTERNAL_URL ?? "http://localhost:3333";
const SESSION_COOKIE = process.env.JWT_SESSION_COOKIE_NAME ?? "__session";

/**
 * Resolves the Authorization header to forward to the auth service: passes through
 * a client-supplied bearer token (non-browser API clients), or builds one from the
 * session cookie (the cookie is the same RS256 JWT shape, so it verifies the same way).
 */
export async function resolveAuthBearer(
    request: Request
): Promise<string | null> {
    const authHeader = request.headers.get("authorization");
    if (authHeader) return authHeader;

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
    return sessionToken ? `Bearer ${sessionToken}` : null;
}

/**
 * For routes that issue credentials rather than require them — currently just
 * oauth/token, where the caller by definition doesn't have a bearer token yet.
 */
export async function proxyToAuthServiceUnauthenticated(
    path: string,
    init?: { method?: string; body?: string }
): Promise<NextResponse> {
    const res = await fetch(`${AUTH_API}${path}`, {
        method: init?.method ?? "GET",
        headers: init?.body ? { "Content-Type": "application/json" } : {},
        body: init?.body,
        cache: "no-store",
    });

    const body = await res.text();
    return new NextResponse(body, {
        status: res.status,
        headers: {
            "content-type":
                res.headers.get("content-type") ?? "application/json",
        },
    });
}

export async function proxyToAuthService(
    request: Request,
    path: string,
    init?: { method?: string; body?: string }
): Promise<NextResponse> {
    const bearer = await resolveAuthBearer(request);
    if (!bearer) {
        return NextResponse.json(
            { error: "AUTH_TOKEN_MISSING" },
            { status: 401 }
        );
    }

    const res = await fetch(`${AUTH_API}${path}`, {
        method: init?.method ?? "GET",
        headers: {
            Authorization: bearer,
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init?.body,
        cache: "no-store",
    });

    const body = await res.text();
    return new NextResponse(body, {
        status: res.status,
        headers: {
            "content-type":
                res.headers.get("content-type") ?? "application/json",
        },
    });
}
