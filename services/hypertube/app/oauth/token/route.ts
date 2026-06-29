import { proxyToAuthServiceUnauthenticated } from "@/lib/auth-api-proxy";

export async function POST(request: Request) {
    const body = await request.text();
    return proxyToAuthServiceUnauthenticated("/api/v1/oauth/token", {
        method: "POST",
        body,
    });
}
