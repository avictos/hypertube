import { proxyToAuthService } from "@/lib/auth-api-proxy";

export async function GET(request: Request) {
    return proxyToAuthService(request, "/api/v1/clients");
}

export async function POST(request: Request) {
    const body = await request.text();
    return proxyToAuthService(request, "/api/v1/clients", {
        method: "POST",
        body,
    });
}
