declare module "@/lib/db" {
    export const db: {
        query: (text: string, params?: unknown[]) => Promise<unknown>;
    };
}
