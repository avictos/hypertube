"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

const requestResetSchema = z.object({
    email: z
        .string()
        .email("Invalid email address")
        .min(5, "Email too short")
        .max(255, "Email too long"),
});

export default function ForgotPasswordPage() {
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [submittedEmail, setSubmittedEmail] = useState("");

    const form = useForm<z.infer<typeof requestResetSchema>>({
        resolver: zodResolver(requestResetSchema),
        defaultValues: { email: "" },
    });

    async function onSubmit(values: z.infer<typeof requestResetSchema>) {
        setGlobalError(null);
        try {
            const res = await fetch(
                "http://localhost:3333/api/v1/auth/reset-password",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(values),
                }
            );

            const data = await res.json();
            if (!res.ok)
                throw new Error(
                    data.message ||
                        data.error ||
                        "Failed to request password reset"
                );

            setSubmittedEmail(values.email);
            setIsSuccess(true);
        } catch (error: any) {
            setGlobalError(error.message || "An unexpected error occurred");
        }
    }

    const isSubmitting = form.formState.isSubmitting;

    // --- SUCCESS SCREEN ---
    if (isSuccess) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 font-sans text-white">
                <div className="w-full max-w-md space-y-6 rounded-2xl border border-gray-800 bg-gray-900/50 p-8 text-center shadow-2xl backdrop-blur-md">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20">
                        <svg
                            className="h-8 w-8 text-blue-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white">
                        Check your email
                    </h2>
                    <p className="text-sm leading-relaxed text-gray-400">
                        We've sent password reset instructions to <br />
                        <span className="font-semibold text-white">
                            {submittedEmail}
                        </span>
                    </p>
                    <Link
                        href="/login"
                        className="mt-6 block text-sm font-semibold text-blue-500 hover:text-blue-400 hover:underline"
                    >
                        Return to Sign In
                    </Link>
                </div>
            </div>
        );
    }

    // --- REQUEST FORM ---
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 font-sans text-white">
            <div className="w-full max-w-md space-y-8 rounded-2xl border border-gray-800 bg-gray-900/50 p-8 shadow-2xl backdrop-blur-md">
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-gray-700 bg-gray-800">
                        <svg
                            className="h-5 w-5 text-gray-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                            />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">
                        Reset Password
                    </h2>
                    <p className="mt-2 text-sm text-gray-400">
                        Enter your email address and we'll send you a link to
                        reset your password.
                    </p>
                </div>

                {globalError && (
                    <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-center text-sm text-red-400">
                        {globalError}
                    </div>
                )}

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

                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-blue-600 font-bold text-white hover:bg-blue-500"
                    >
                        {isSubmitting ? "Sending..." : "Send Reset Link"}
                    </Button>
                </form>

                <p className="text-center text-sm text-gray-400">
                    Remember your password?{" "}
                    <Link
                        href="/login"
                        className="font-semibold text-blue-500 hover:text-blue-400 hover:underline"
                    >
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
