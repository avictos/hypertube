import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decodeJwt } from "jose";

const AUTH_API = process.env.AUTH_INTERNAL_URL ?? "http://localhost:3333";
const SESSION_COOKIE = process.env.JWT_SESSION_COOKIE_NAME ?? "__session";

export async function POST(request: Request) {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

    if (!sessionToken) {
        return NextResponse.json(
            { error: "AUTH_TOKEN_MISSING" },
            { status: 401 }
        );
    }

    try {
        const decodedToken = decodeJwt(sessionToken);
        const loggedInUserId = decodedToken.sub;

        const { userId: linkUserId, token } = await request.json();

        // Guard against confirming for a mismatched account
        if (loggedInUserId !== linkUserId) {
            return NextResponse.json(
                { error: "AUTH_DELETE_ACCOUNT_MISMATCH" },
                { status: 403 }
            );
        }

        const res = await fetch(
            `${AUTH_API}/api/v1/auth/account/${loggedInUserId}/delete`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    [process.env.AUTH_SECRET_HEADER_NAME ??
                    "x-auth-secret-key"]: process.env.AUTH_SECRET_KEY ?? "",
                },
                body: JSON.stringify({ userId: loggedInUserId, token }),
            }
        );

        const data = await res.json();
        const nextRes = NextResponse.json(data, { status: res.status });

        // Forward the cleared cookies back to the browser!
        const setCookieHeaders = res.headers.getSetCookie();
        for (const cookieHeader of setCookieHeaders) {
            nextRes.headers.append("Set-Cookie", cookieHeader);
        }

        return nextRes;
    } catch (error) {
        console.error("[Next API] Failed to confirm account deletion:", error);
        return NextResponse.json(
            { error: "INVALID_SESSION_TOKEN" },
            { status: 401 }
        );
    }
}
