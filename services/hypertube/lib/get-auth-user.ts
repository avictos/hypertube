/**
 * Reads the verified identity that `middleware.ts` attaches to every authenticated
 * request (from either the session cookie or an Authorization: Bearer token).
 * Route handlers should use this instead of decoding cookies themselves, since these
 * headers are only ever set by the middleware after signature verification.
 */
export function getAuthUserId(request: Request): string | null {
    return request.headers.get("x-verified-user-id");
}

export function getAuthUsername(request: Request): string | null {
    return request.headers.get("x-verified-username");
}
