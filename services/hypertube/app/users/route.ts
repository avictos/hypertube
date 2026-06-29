import { proxyToAuthService } from "@/lib/auth-api-proxy";

export async function GET(request: Request) {
    return proxyToAuthService(request, "/api/v1/users");
}
