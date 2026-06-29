// app/api/auth/me/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decodeJwt } from "jose"; // <-- Import this

const AUTH_API = process.env.AUTH_INTERNAL_URL ?? "http://localhost:3333";
const SESSION_COOKIE = process.env.JWT_SESSION_COOKIE_NAME ?? "__session";

export async function GET() {
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
        // 1. Decode the token purely to extract the payload (no signature verification needed here)
        const decodedToken = decodeJwt(sessionToken);
        const userId = decodedToken.sub;
        const trackerId = decodedToken.trackerId;

        if (!userId) {
            return NextResponse.json(
                { error: "MALFORMED_TOKEN_PAYLOAD" },
                { status: 400 }
            );
        }
        if (!trackerId) {
            return NextResponse.json(
                { error: "MALFORMED_TOKEN_PAYLOAD" },
                { status: 400 }
            );
        }

        const meRes = await fetch(
            `${AUTH_API}/api/v1/auth/account/${userId}?trackerId=${trackerId}`,
            {
                headers: {
                    [process.env.AUTH_SECRET_HEADER_NAME ??
                    "x-auth-secret-key"]: process.env.AUTH_SECRET_KEY ?? "",
                },
                cache: "no-store",
            }
        );

        const body = await meRes.text();
        const nextRes = new NextResponse(body, {
            status: meRes.status,
            headers: {
                "content-type":
                    meRes.headers.get("content-type") ?? "application/json",
            },
        });

        // THE FIX: Forward any Set-Cookie headers from the Auth server back to the browser
        const setCookieHeaders = meRes.headers.getSetCookie();
        for (const cookieHeader of setCookieHeaders) {
            nextRes.headers.append("Set-Cookie", cookieHeader);
        }

        return nextRes;
    } catch (error) {
        // Catches cases where the token string is completely invalid/corrupted
        console.error("[Next API] Failed to decode session token:", error);
        return NextResponse.json(
            { error: "INVALID_SESSION_TOKEN" },
            { status: 401 }
        );
    }
}

export async function PATCH(request: Request) {
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
        const userId = decodedToken.sub;

        if (!userId) {
            return NextResponse.json(
                { error: "MALFORMED_TOKEN_PAYLOAD" },
                { status: 400 }
            );
        }

        const { firstName, lastName, username } = await request.json();
        if (!firstName || !lastName || !username) {
            return NextResponse.json(
                { error: "MISSING_FIELDS" },
                { status: 400 }
            );
        }

        const newMeRes = await fetch(
            `${AUTH_API}/api/v1/auth/account/${userId}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json", // <-- THIS FIXES THE 400 ERROR
                    [process.env.AUTH_SECRET_HEADER_NAME ??
                    "x-auth-secret-key"]: process.env.AUTH_SECRET_KEY ?? "",
                },
                body: JSON.stringify({
                    userId, // <-- Send the trusted userId to the Auth server
                    firstName,
                    lastName,
                    username,
                }),
            }
        );

        const body = await newMeRes.text();
        return new NextResponse(body, {
            status: newMeRes.status,
            headers: {
                "content-type":
                    newMeRes.headers.get("content-type") ?? "application/json",
            },
        });
    } catch (error) {
        console.error("[Next API] Failed to decode session token:", error);
        return NextResponse.json(
            { error: "INVALID_SESSION_TOKEN" },
            { status: 401 }
        );
    }
}
