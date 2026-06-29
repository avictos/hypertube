import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decodeJwt } from "jose";

const AUTH_API = process.env.AUTH_INTERNAL_URL ?? "http://localhost:3333";
const SESSION_COOKIE = process.env.JWT_SESSION_COOKIE_NAME ?? "__session";

export async function POST() {
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
        const email = decodedToken.email as string; // Extracted directly from token payload

        if (!userId || !email) {
            return NextResponse.json(
                { error: "MALFORMED_TOKEN_PAYLOAD" },
                { status: 400 }
            );
        }

        const res = await fetch(
            `${AUTH_API}/api/v1/auth/account/${userId}/delete`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    [process.env.AUTH_SECRET_HEADER_NAME ??
                    "x-auth-secret-key"]: process.env.AUTH_SECRET_KEY ?? "",
                },
                body: JSON.stringify({ userId, email }), // Send trusted data to Auth server
            }
        );

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error("[Next API] Failed to request account deletion:", error);
        return NextResponse.json(
            { error: "INVALID_SESSION_TOKEN" },
            { status: 401 }
        );
    }
}
