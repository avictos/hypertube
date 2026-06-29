import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decodeJwt } from "jose";

const AUTH_API = process.env.AUTH_INTERNAL_URL ?? "http://localhost:3333";
const SESSION_COOKIE = process.env.JWT_SESSION_COOKIE_NAME ?? "__session";

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // Next.js 15 async params pattern
) {
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

        const resolvedParams = await params;
        const sessionId = resolvedParams.id;

        // Append userId securely to the query string
        const res = await fetch(
            `${AUTH_API}/api/v1/auth/sessions/${sessionId}?userId=${userId}`,
            {
                method: "DELETE",
                headers: {
                    [process.env.AUTH_SECRET_HEADER_NAME ??
                    "x-auth-secret-key"]: process.env.AUTH_SECRET_KEY ?? "",
                },
            }
        );

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error("[Next API] Failed to revoke session:", error);
        return NextResponse.json(
            { error: "INVALID_SESSION_TOKEN" },
            { status: 401 }
        );
    }
}
