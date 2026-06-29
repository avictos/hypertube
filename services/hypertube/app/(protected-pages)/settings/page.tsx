"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
    Field,
    FieldLabel,
    FieldGroup,
    FieldError,
    FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/sdk/auth/auth-provider";

const profileSchema = z.object({
    firstName: z
        .string()
        .min(2)
        .max(50)
        .regex(/^[a-zA-Z]+$/, "Letters only"),
    lastName: z
        .string()
        .min(2)
        .max(50)
        .regex(/^[a-zA-Z]+$/, "Letters only"),
    username: z
        .string()
        .min(2)
        .max(20)
        .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, underscores only"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

type SessionItem = {
    id: string;
    createdAt: string;
    expiresAt: string;
    isCurrent: boolean;
};

type MeData = {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    isEmailVerified: boolean;
    sessions: {
        active: number;
        max: number;
        items: SessionItem[];
    };
};

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function ProfileSection({
    me,
    onUpdated,
}: {
    me: MeData;
    onUpdated: (
        updated: Pick<MeData, "firstName" | "lastName" | "username">
    ) => void;
}) {
    const [serverError, setServerError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting, isDirty },
        reset,
    } = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            firstName: me.firstName,
            lastName: me.lastName,
            username: me.username,
        },
    });

    const onSubmit = async (values: ProfileFormValues) => {
        setServerError(null);
        setSuccess(false);
        try {
            const res = await fetch("/api/auth/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            const data = await res.json();
            if (!res.ok) {
                setServerError(data.message ?? "Failed to update profile");
                return;
            }
            onUpdated(data.user);
            reset(values);
            setSuccess(true);
        } catch {
            setServerError("Network error. Please try again.");
        }
    };

    return (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
            <h2 className="mb-1 text-lg font-bold text-white">Profile</h2>
            <p className="mb-6 text-sm text-gray-500">
                Update your personal information.
            </p>

            <form onSubmit={handleSubmit(onSubmit)}>
                <FieldGroup>
                    <Field>
                        <FieldLabel htmlFor="firstName">First name</FieldLabel>
                        <Input
                            id="firstName"
                            {...register("firstName")}
                            aria-invalid={!!errors.firstName}
                        />
                        <FieldError errors={[errors.firstName]} />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                        <Input
                            id="lastName"
                            {...register("lastName")}
                            aria-invalid={!!errors.lastName}
                        />
                        <FieldError errors={[errors.lastName]} />
                    </Field>

                    <Field>
                        <FieldLabel htmlFor="username">Username</FieldLabel>
                        <Input
                            id="username"
                            {...register("username")}
                            aria-invalid={!!errors.username}
                        />
                        <FieldError errors={[errors.username]} />
                    </Field>

                    <Field>
                        <FieldLabel>Email</FieldLabel>
                        <Input value={me.email} disabled readOnly />
                    </Field>

                    {serverError && (
                        <p role="alert" className="text-sm text-red-400">
                            {serverError}
                        </p>
                    )}
                    {success && (
                        <p className="text-sm text-green-400">
                            Profile updated successfully.
                        </p>
                    )}

                    <div className="flex justify-end">
                        <Button
                            type="submit"
                            disabled={isSubmitting || !isDirty}
                        >
                            {isSubmitting ? "Saving..." : "Save changes"}
                        </Button>
                    </div>
                </FieldGroup>
            </form>
        </section>
    );
}

const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
    { code: "en", label: "English" },
    { code: "es", label: "Spanish" },
    { code: "fr", label: "French" },
    { code: "de", label: "German" },
    { code: "it", label: "Italian" },
    { code: "pt", label: "Portuguese" },
    { code: "ar", label: "Arabic" },
    { code: "hi", label: "Hindi" },
    { code: "ja", label: "Japanese" },
    { code: "ko", label: "Korean" },
    { code: "zh", label: "Chinese" },
    { code: "ru", label: "Russian" },
    { code: "tr", label: "Turkish" },
];

function LanguageSection({ userId }: { userId: string }) {
    const [preferredLanguage, setPreferredLanguage] = useState("en");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/users/${userId}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((data) => {
                if (!cancelled && data?.user?.preferredLanguage) {
                    setPreferredLanguage(data.user.preferredLanguage);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [userId]);

    const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setPreferredLanguage(value);
        setSaving(true);
        setSuccess(false);
        setError(null);
        try {
            const res = await fetch(`/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ preferredLanguage: value }),
            });
            if (!res.ok) {
                setError("Failed to update preferred language");
                return;
            }
            setSuccess(true);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
            <h2 className="mb-1 text-lg font-bold text-white">
                Subtitle language
            </h2>
            <p className="mb-6 text-sm text-gray-500">
                When a movie&apos;s audio doesn&apos;t match this language,
                we&apos;ll fetch subtitles in it automatically.
            </p>

            <Field>
                <FieldLabel htmlFor="preferredLanguage">
                    Preferred language
                </FieldLabel>
                <select
                    id="preferredLanguage"
                    value={preferredLanguage}
                    onChange={handleChange}
                    disabled={loading || saving}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                    {LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </Field>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            {success && (
                <p className="mt-3 text-sm text-green-400">
                    Preferred language updated.
                </p>
            )}
        </section>
    );
}

function SessionsSection({
    me,
    onRefresh,
    onSignOut,
}: {
    me: MeData;
    onRefresh: () => void;
    onSignOut: () => Promise<void>;
}) {
    const [revoking, setRevoking] = useState<string | null>(null);
    const [loggingOut, setLoggingOut] = useState(false);
    const [revokingAll, setRevokingAll] = useState(false);

    const handleRevoke = async (sessionId: string) => {
        setRevoking(sessionId);
        try {
            await fetch(`/api/auth/sessions/${sessionId}`, {
                method: "DELETE",
            });
            onRefresh();
        } finally {
            setRevoking(null);
        }
    };

    const handleLogoutCurrent = async () => {
        setLoggingOut(true);
        try {
            await onSignOut();
        } catch {
            window.alert("Failed to log out");
            setLoggingOut(false);
        }
    };

    const handleRevokeAll = async () => {
        if (!confirm("Log out of all devices, including this one?")) return;
        setRevokingAll(true);
        try {
            const res = await fetch("/api/auth/logout/all", {
                method: "POST",
            });
            if (!res.ok) {
                window.alert("Failed to log out of all devices");
                return;
            }
            window.location.href = "/login";
        } catch {
            window.alert("Failed to log out of all devices");
        } finally {
            setRevokingAll(false);
        }
    };

    // --- SORTING LOGIC ---
    // 1. Create a shallow copy of the array so we don't mutate state directly
    // 2. Sort by `isCurrent` first (true comes before false)
    // 3. Then sort by `createdAt` descending (newest first)
    const sortedSessions = [...me.sessions.items].sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) return -1;
        if (!a.isCurrent && b.isCurrent) return 1;

        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
    });

    return (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6">
            <div className="mb-1 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">
                    Active sessions
                </h2>
                <span className="text-xs text-gray-500">
                    {me.sessions.active} / {me.sessions.max} used
                </span>
            </div>
            <p className="mb-6 text-sm text-gray-500">
                Devices currently signed in to your account.
            </p>

            <div className="space-y-3">
                {sortedSessions.map((session) => (
                    <div
                        key={session.id}
                        className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3"
                    >
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-200">
                                    Session {session.id.slice(0, 8)}
                                </span>
                                {session.isCurrent && (
                                    <span className="rounded-full bg-blue-900/60 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                                        This device
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 text-xs text-gray-500">
                                Created {formatDate(session.createdAt)} ·
                                Expires {formatDate(session.expiresAt)}
                            </p>
                        </div>

                        {session.isCurrent ? (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={loggingOut}
                                onClick={handleLogoutCurrent}
                            >
                                {loggingOut ? "Logging out..." : "Log out"}
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={revoking === session.id}
                                onClick={() => handleRevoke(session.id)}
                            >
                                {revoking === session.id
                                    ? "Revoking..."
                                    : "Revoke"}
                            </Button>
                        )}
                    </div>
                ))}
            </div>

            <FieldSeparator className="my-6" />

            <div className="flex justify-end">
                <Button
                    variant="destructive"
                    disabled={revokingAll}
                    onClick={handleRevokeAll}
                >
                    {revokingAll ? "Logging out..." : "Log out of all devices"}
                </Button>
            </div>
        </section>
    );
}

function DeleteAccountSection() {
    const [requested, setRequested] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleRequestDeletion = async () => {
        if (
            !confirm(
                "We'll email you a confirmation link to permanently delete your account. Continue?"
            )
        ) {
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/auth/me/delete", {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? "Failed to request account deletion");
                return;
            }
            setRequested(true);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="rounded-2xl border border-red-900/40 bg-red-950/10 p-6">
            <h2 className="mb-1 text-lg font-bold text-red-400">
                Delete account
            </h2>
            <p className="mb-6 text-sm text-gray-500">
                Permanently delete your account and all associated data. This
                cannot be undone.
            </p>

            {requested ? (
                <p className="text-sm text-green-400">
                    Check your email for a confirmation link to finish deleting
                    your account.
                </p>
            ) : (
                <>
                    {error && (
                        <p className="mb-3 text-sm text-red-400">{error}</p>
                    )}
                    <Button
                        variant="destructive"
                        disabled={loading}
                        onClick={handleRequestDeletion}
                    >
                        {loading ? "Sending..." : "Delete my account"}
                    </Button>
                </>
            )}
        </section>
    );
}

export default function SettingsPage() {
    const { isLoaded, isSignedIn, signOut } = useAuth();
    const [me, setMe] = useState<MeData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchMe = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/me", {
                cache: "no-store",
            });
            if (res.ok) {
                const data = await res.json();
                setMe(data.user);
            } else {
                setError("Failed to load account data");
            }
        } catch {
            setError("Network error loading account data");
        }
    }, []);

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchMe();
        }
    }, [isLoaded, isSignedIn, fetchMe]);

    if (!isLoaded || (isSignedIn && !me && !error)) {
        return (
            <div className="mx-auto max-w-3xl px-6 py-16">
                <div className="space-y-4">
                    <div className="h-8 w-48 animate-pulse rounded bg-gray-800" />
                    <div className="h-48 w-full animate-pulse rounded-2xl bg-gray-800" />
                </div>
            </div>
        );
    }

    if (!isSignedIn) {
        return (
            <div className="mx-auto max-w-3xl px-6 py-16 text-center">
                <p className="text-gray-400">
                    You need to be signed in to view settings.
                </p>
            </div>
        );
    }

    if (error || !me) {
        return (
            <div className="mx-auto max-w-3xl px-6 py-16 text-center">
                <p className="text-red-400">
                    {error ?? "Something went wrong."}
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
            <div>
                <h1 className="text-2xl font-bold text-white">Settings</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Manage your profile, sessions, and account.
                </p>
            </div>

            <ProfileSection
                me={me}
                onUpdated={(updated) =>
                    setMe((prev) => (prev ? { ...prev, ...updated } : prev))
                }
            />
            <LanguageSection userId={me.id} />
            <SessionsSection me={me} onRefresh={fetchMe} onSignOut={signOut} />
            <DeleteAccountSection />
        </div>
    );
}
