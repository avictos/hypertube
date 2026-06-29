import { decodeJwt } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const AUTH_API = process.env.AUTH_INTERNAL_URL ?? "http://localhost:3333";
const SESSION_COOKIE = process.env.JWT_SESSION_COOKIE_NAME ?? "__session";

export async function POST() {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

    // Bail early if either cookie is missing — no need to bother the auth service.
    if (!sessionToken) {
        return NextResponse.json(
            { error: "AUTH_TOKEN_MISSING" },
            { status: 401 }
        );
    }

    try {
        const decodedToken = decodeJwt(sessionToken);
        const userId = decodedToken.sub;

        const res = await fetch(`${AUTH_API}/api/v1/auth/logout/all`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                [process.env.AUTH_SECRET_HEADER_NAME ?? "x-auth-secret-key"]:
                    process.env.AUTH_SECRET_KEY ?? "",
            },
            body: JSON.stringify({ userId: userId }),
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: "Failed to log out of all sessions" },
                { status: res.status }
            );
        }

        const responseData = await res.json();
        const nextRes = NextResponse.json(responseData, { status: res.status });

        const setCookieHeaders = res.headers.getSetCookie();

        for (const cookieHeader of setCookieHeaders) {
            nextRes.headers.append("Set-Cookie", cookieHeader);
        }

        return nextRes;
    } catch {
        return NextResponse.json(
            { error: "Failed to log out of all sessions" },
            { status: 500 }
        );
    }
}
