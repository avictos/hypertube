"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { SocialLoginButtons } from "@/components/social-login-buttons";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
    oauth_failed: "That sign-in attempt failed. Please try again.",
    oauth_unavailable: "That sign-in provider isn't available right now.",
};

// --- CLIENT-SIDE VALIDATION SCHEMA ---
const loginSchema = z.object({
    email: z
        .string()
        .email("Invalid email address")
        .min(5, "Email too short")
        .max(255, "Email too long"),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(100, "Password is too long"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginContent() {
    const searchParams = useSearchParams();

    const [globalError, setGlobalError] = useState<string | null>(() => {
        const errorCode = searchParams.get("error");
        return errorCode ? (OAUTH_ERROR_MESSAGES[errorCode] ?? null) : null;
    });
    const [successMessage, setSuccessMessage] = useState<string | null>(() => {
        return searchParams.get("registered") === "true"
            ? "Registration successful! Please sign in."
            : null;
    });
    const [showPassword, setShowPassword] = useState(false);

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "khalid.zegani@gmail.com",
            password: "Password1234!!",
        },
    });

    async function onSubmit(values: LoginFormValues) {
        setGlobalError(null);
        setSuccessMessage(null);

        try {
            const res = await fetch("http://localhost:3333/api/v1/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(values),
            });

            // 1. If backend returns a 303 Redirect for ALREADY_LOGGED_IN, do a hard reload
            if (res.redirected) {
                window.location.assign("/");
                return;
            }

            // 2. Defensively parse JSON
            let data;
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                data = await res.json();
            } else {
                throw new Error(
                    `Server error (${res.status}): Unexpected response format.`
                );
            }

            // 3. Handle specific backend API errors
            if (!res.ok) {
                const backendMessage =
                    data.message || data.error || `HTTP Error ${res.status}`;
                throw new Error(backendMessage);
            }

            // 4. URL Sanitization Logic
            const rawRedirectUrl = searchParams.get("redirect_url");

            const publicRoutes = [
                "/login",
                "/register",
                "/verify-email",
                "/forgot-password",
                "/reset-password",
            ];

            let safeRedirectUrl = "/"; // Default to home

            if (rawRedirectUrl) {
                const basePath = rawRedirectUrl.split("?")[0];
                const isRelativePath =
                    rawRedirectUrl.startsWith("/") &&
                    !rawRedirectUrl.startsWith("//");
                const isPublicAuthRoute = publicRoutes.includes(basePath);

                if (isRelativePath && !isPublicAuthRoute) {
                    safeRedirectUrl = rawRedirectUrl;
                }
            }

            // 5. Force a full page reload to the safe URL
            // This forces the AuthProvider to remount and grab the fresh cookies
            window.location.assign(safeRedirectUrl);
        } catch (error: unknown) {
            if (error instanceof Error) {
                setGlobalError(error.message || "An unexpected error occurred");
            } else {
                setGlobalError("An unexpected error occurred");
            }
            form.reset(); // Clear form on error
        }
    }

    const isSubmitting = form.formState.isSubmitting;

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 font-sans text-white">
            <div className="w-full max-w-md space-y-8 rounded-2xl border border-gray-800 bg-gray-900/50 p-8 shadow-2xl backdrop-blur-md">
                {/* Header */}
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
                        <svg
                            className="h-6 w-6 text-white"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">
                        Welcome back
                    </h2>
                    <p className="mt-2 text-sm text-gray-400">
                        Sign in to your Hypertube account
                    </p>
                </div>

                {/* Alerts */}
                {successMessage && (
                    <div className="rounded-lg border border-green-900/50 bg-green-950/30 p-3 text-center text-sm text-green-400">
                        {successMessage}
                    </div>
                )}
                {globalError && (
                    <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-center text-sm text-red-400">
                        {globalError}
                    </div>
                )}

                {/* Form */}
                <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-5"
                >
                    <Controller
                        name="email"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    htmlFor={field.name}
                                    className="text-gray-300"
                                >
                                    Email Address
                                </FieldLabel>
                                <Input
                                    {...field}
                                    id={field.name}
                                    type="email"
                                    autoComplete="email"
                                    placeholder="john@example.com"
                                    aria-invalid={fieldState.invalid}
                                    className="border-gray-700 bg-gray-950 text-white focus-visible:ring-blue-500"
                                />
                                {fieldState.invalid && (
                                    <FieldError
                                        errors={[fieldState.error]}
                                        className="text-xs text-red-400"
                                    />
                                )}
                            </Field>
                        )}
                    />

                    <Controller
                        name="password"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <div className="flex items-center justify-between pb-1">
                                    <FieldLabel
                                        htmlFor={field.name}
                                        className="text-gray-300"
                                    >
                                        Password
                                    </FieldLabel>
                                    <Link
                                        href="/forgot-password"
                                        className="text-xs text-blue-500 hover:underline"
                                    >
                                        Forgot password?
                                    </Link>
                                </div>
                                <div className="relative">
                                    <Input
                                        {...field}
                                        id={field.name}
                                        type={
                                            showPassword ? "text" : "password"
                                        }
                                        autoComplete="current-password"
                                        placeholder="••••••••"
                                        aria-invalid={fieldState.invalid}
                                        className="border-gray-700 bg-gray-950 text-white focus-visible:ring-blue-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowPassword(!showPassword)
                                        }
                                        className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 hover:text-gray-300 focus:outline-none"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? (
                                            <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                viewBox="0 0 24 24"
                                            >
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                                <line
                                                    x1="1"
                                                    y1="1"
                                                    x2="23"
                                                    y2="23"
                                                ></line>
                                            </svg>
                                        ) : (
                                            <svg
                                                className="h-4 w-4"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                viewBox="0 0 24 24"
                                            >
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                <circle
                                                    cx="12"
                                                    cy="12"
                                                    r="3"
                                                ></circle>
                                            </svg>
                                        )}
                                    </button>
                                </div>
                                {fieldState.invalid && (
                                    <FieldError
                                        errors={[fieldState.error]}
                                        className="text-xs text-red-400"
                                    />
                                )}
                            </Field>
                        )}
                    />

                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-blue-600 font-bold text-white hover:bg-blue-500"
                    >
                        {isSubmitting ? "Signing in..." : "Sign In"}
                    </Button>
                </form>

                <SocialLoginButtons />

                <p className="text-center text-sm text-gray-400">
                    Don&apos;t have an account?{" "}
                    <Link
                        href="/register"
                        className="font-semibold text-blue-500 hover:text-blue-400 hover:underline"
                    >
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center bg-gray-950" />
            }
        >
            <LoginContent />
        </Suspense>
    );
}
