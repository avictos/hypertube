import { proxyToAuthService } from "@/lib/auth-api-proxy";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    return proxyToAuthService(request, `/api/v1/users/${id}`);
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.text();
    return proxyToAuthService(request, `/api/v1/users/${id}`, {
        method: "PATCH",
        body,
    });
}
