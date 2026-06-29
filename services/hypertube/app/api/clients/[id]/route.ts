import { proxyToAuthService } from "@/lib/auth-api-proxy";

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    return proxyToAuthService(request, `/api/v1/clients/${id}`, {
        method: "DELETE",
    });
}
