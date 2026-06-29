export function generateUUID(): string {
    // Use the native crypto API if available (localhost / HTTPS)
    if (
        typeof window !== "undefined" &&
        window.crypto &&
        window.crypto.randomUUID
    ) {
        return window.crypto.randomUUID();
    }

    // Fallback for insecure HTTP contexts
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        }
    );
}
