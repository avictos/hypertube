"use client";

import { useCallback, useEffect, useState } from "react";

import {
    Field,
    FieldLabel,
    FieldGroup,
    FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/sdk/auth/auth-provider";

type ApiClient = {
    id: string;
    name: string;
    clientId: string;
    createdAt: string;
    lastUsedAt: string | null;
};

type CreatedClient = ApiClient & { clientSecret: string };

function formatDate(iso: string | null): string {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function CreateClientForm({
    onCreated,
}: {
    onCreated: (client: CreatedClient) => void;
}) {
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch("/api/clients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? "Failed to create client");
                return;
            }
            onCreated(data.client);
            setName("");
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <Field className="flex-1">
                <FieldLabel htmlFor="client-name">Client name</FieldLabel>
                <Input
                    id="client-name"
                    placeholder="e.g. my-test-script"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </Field>
            <Button type="submit" disabled={submitting || !name.trim()}>
                {submitting ? "Creating…" : "Create client"}
            </Button>
            {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
    );
}

function SecretRevealBanner({
    client,
    onDismiss,
}: {
    client: CreatedClient;
    onDismiss: () => void;
}) {
    return (
        <div className="rounded-xl border border-yellow-700/50 bg-yellow-950/30 p-4">
            <p className="text-sm font-bold text-yellow-300">
                Save this secret now — you won&apos;t be able to see it again.
            </p>
            <div className="mt-3 space-y-2 text-sm">
                <div>
                    <span className="text-gray-500">client_id: </span>
                    <code className="text-gray-200">{client.clientId}</code>
                </div>
                <div>
                    <span className="text-gray-500">client_secret: </span>
                    <code className="text-gray-200">{client.clientSecret}</code>
                </div>
            </div>
            <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onDismiss}
            >
                I&apos;ve saved it
            </Button>
        </div>
    );
}

function ClientsList({
    clients,
    onRevoke,
}: {
    clients: ApiClient[];
    onRevoke: (id: string) => void;
}) {
    if (clients.length === 0) {
        return <p className="text-sm text-gray-500">No API clients yet.</p>;
    }

    return (
        <div className="space-y-2">
            {clients.map((c) => (
                <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/30 p-3"
                >
                    <div>
                        <p className="text-sm font-bold text-gray-200">
                            {c.name}
                        </p>
                        <p className="text-xs text-gray-500">
                            <code>{c.clientId}</code> · created{" "}
                            {formatDate(c.createdAt)} · last used{" "}
                            {formatDate(c.lastUsedAt)}
                        </p>
                    </div>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onRevoke(c.id)}
                    >
                        Revoke
                    </Button>
                </div>
            ))}
        </div>
    );
}

type TryItResult = { status: number; body: unknown };

function TokenPlayground({
    defaultClient,
}: {
    defaultClient: CreatedClient | null;
}) {
    const [clientId, setClientId] = useState(defaultClient?.clientId ?? "");
    const [secret, setSecret] = useState(defaultClient?.clientSecret ?? "");
    const [token, setToken] = useState<string | null>(null);
    const [requesting, setRequesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<Record<string, TryItResult>>({});
    const [tryingPath, setTryingPath] = useState<string | null>(null);

    useEffect(() => {
        if (defaultClient) {
            setClientId(defaultClient.clientId);
            setSecret(defaultClient.clientSecret);
        }
    }, [defaultClient]);

    const handleRequestToken = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setToken(null);
        setRequesting(true);
        try {
            const res = await fetch("/api/oauth/token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client: clientId, secret }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? "Failed to obtain token");
                return;
            }
            setToken(data.access_token);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setRequesting(false);
        }
    };

    const tryEndpoint = async (path: string) => {
        if (!token) return;
        setTryingPath(path);
        try {
            const res = await fetch(path, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await res.json().catch(() => null);
            setResults((prev) => ({
                ...prev,
                [path]: { status: res.status, body },
            }));
        } finally {
            setTryingPath(null);
        }
    };

    return (
        <div className="space-y-4">
            <form onSubmit={handleRequestToken} className="space-y-4">
                <FieldGroup>
                    <Field>
                        <FieldLabel htmlFor="oauth-client">client</FieldLabel>
                        <Input
                            id="oauth-client"
                            placeholder="client_… or your account email/username"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                        />
                        <FieldDescription>
                            A client_id from above, or your own email/username
                            to skip client creation entirely.
                        </FieldDescription>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="oauth-secret">secret</FieldLabel>
                        <Input
                            id="oauth-secret"
                            type="password"
                            placeholder="client_secret or your account password"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                        />
                    </Field>
                </FieldGroup>
                <Button
                    type="submit"
                    disabled={requesting || !clientId || !secret}
                >
                    {requesting ? "Requesting…" : "POST /oauth/token"}
                </Button>
                {error && <p className="text-sm text-red-400">{error}</p>}
            </form>

            {token && (
                <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/30 p-4">
                    <div>
                        <p className="mb-1 text-xs text-gray-500">
                            access_token
                        </p>
                        <textarea
                            readOnly
                            value={token}
                            rows={3}
                            className="w-full resize-none rounded-lg border border-gray-700 bg-gray-950 p-2 font-mono text-xs text-gray-300"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {["/users", "/movies", "/comments"].map((path) => (
                            <Button
                                key={path}
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={tryingPath === path}
                                onClick={() => tryEndpoint(path)}
                            >
                                {tryingPath === path
                                    ? "Loading…"
                                    : `GET ${path}`}
                            </Button>
                        ))}
                    </div>

                    {Object.entries(results).map(([path, result]) => (
                        <div key={path}>
                            <p className="mb-1 text-xs text-gray-500">
                                {path} → {result.status}
                            </p>
                            <pre className="max-h-64 overflow-auto rounded-lg border border-gray-700 bg-gray-950 p-2 text-xs text-gray-300">
                                {JSON.stringify(result.body, null, 2)}
                            </pre>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function DeveloperPage() {
    const { isLoaded, isSignedIn } = useAuth();
    const [clients, setClients] = useState<ApiClient[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [revealedClient, setRevealedClient] = useState<CreatedClient | null>(
        null
    );

    const fetchClients = useCallback(async () => {
        try {
            const res = await fetch("/api/clients", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                setClients(data.clients);
            } else {
                setError("Failed to load API clients");
            }
        } catch {
            setError("Network error loading API clients");
        }
    }, []);

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchClients();
        }
    }, [isLoaded, isSignedIn, fetchClients]);

    const handleRevoke = async (id: string) => {
        await fetch(`/api/clients/${id}`, { method: "DELETE" });
        setClients((prev) => prev?.filter((c) => c.id !== id) ?? prev);
    };

    if (!isLoaded || (isSignedIn && clients === null && !error)) {
        return (
            <div className="mx-auto max-w-3xl px-6 py-16">
                <div className="h-48 w-full animate-pulse rounded-2xl bg-gray-800" />
            </div>
        );
    }

    if (!isSignedIn) {
        return (
            <div className="mx-auto max-w-3xl px-6 py-16 text-center">
                <p className="text-gray-400">
                    You need to be signed in to manage API clients.
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
            <div>
                <h1 className="text-2xl font-bold text-white">Developer</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Create OAuth2 API clients and try the REST API (/users,
                    /movies, /comments).
                </p>
            </div>

            <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
                <h2 className="mb-1 text-lg font-bold text-white">
                    API clients
                </h2>
                <p className="mb-6 text-sm text-gray-500">
                    Each client gets its own id + secret, exchanged at{" "}
                    <code className="text-gray-400">POST /oauth/token</code> for
                    a bearer token.
                </p>

                <div className="space-y-4">
                    <CreateClientForm
                        onCreated={(client) => {
                            setRevealedClient(client);
                            setClients((prev) =>
                                prev ? [client, ...prev] : [client]
                            );
                        }}
                    />

                    {revealedClient && (
                        <SecretRevealBanner
                            client={revealedClient}
                            onDismiss={() => setRevealedClient(null)}
                        />
                    )}

                    {error && <p className="text-sm text-red-400">{error}</p>}
                    {clients && (
                        <ClientsList
                            clients={clients}
                            onRevoke={handleRevoke}
                        />
                    )}
                </div>
            </section>

            <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
                <h2 className="mb-1 text-lg font-bold text-white">
                    Try the API
                </h2>
                <p className="mb-6 text-sm text-gray-500">
                    Exchange a client (or your own account) for a token, then
                    call the API directly.
                </p>
                <TokenPlayground defaultClient={revealedClient} />
            </section>
        </div>
    );
}
