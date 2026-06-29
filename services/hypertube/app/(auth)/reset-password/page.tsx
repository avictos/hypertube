"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

const resetPasswordSchema = z
    .object({
        password: z
            .string()
            .min(8, "At least 8 characters")
            .max(100, "Max 100 characters")
            .regex(/[A-Z]/, "Must contain one uppercase letter")
            .regex(/[a-z]/, "Must contain one lowercase letter")
            .regex(/[0-9]/, "Must contain one number")
            .regex(/[\W_]/, "Must contain one special character"),
        confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ["confirmPassword"],
    });

function ResetPasswordContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const email = searchParams.get("email");
    const token = searchParams.get("token");

    const [status, setStatus] = useState<
        "verifying" | "form" | "success" | "error"
    >("verifying");
    const [errorMessage, setErrorMessage] = useState("");
    const [countdown, setCountdown] = useState(5);

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // 1. Verify token on mount
    useEffect(() => {
        if (!email || !token) {
            setStatus("error");
            setErrorMessage("Invalid or missing password reset link.");
            return;
        }

        const verifyToken = async () => {
            try {
                const res = await fetch(
                    "http://localhost:3333/api/v1/auth/reset-password/verify",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, resetToken: token }),
                    }
                );

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(
                        data.message || data.error || "Verification failed"
                    );
                }

                // Token is valid, show the form
                setStatus("form");
            } catch (err: any) {
                setStatus("error");
                setErrorMessage(err.message);
            }
        };

        verifyToken();
    }, [email, token]);

    // 2. Countdown redirect on success
    useEffect(() => {
        if (status === "success") {
            const timer = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        router.push("/login");
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [status, router]);

    const form = useForm<z.infer<typeof resetPasswordSchema>>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: { password: "", confirmPassword: "" },
    });

    // 3. Submit New Password
    async function onSubmit(values: z.infer<typeof resetPasswordSchema>) {
        try {
            const res = await fetch(
                "http://localhost:3333/api/v1/auth/reset-password/change",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email,
                        resetToken: token,
                        newPassword: values.password,
                    }),
                }
            );

            const data = await res.json();
            if (!res.ok)
                throw new Error(
                    data.message || data.error || "Failed to change password"
                );

            setStatus("success");
        } catch (error: any) {
            setStatus("error");
            setErrorMessage(error.message);
        }
    }

    const isSubmitting = form.formState.isSubmitting;

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 font-sans text-white">
            <div className="w-full max-w-md space-y-6 rounded-2xl border border-gray-800 bg-gray-900/50 p-8 shadow-2xl backdrop-blur-md">
                {/* STATE: VERIFYING */}
                {status === "verifying" && (
                    <div className="flex flex-col items-center py-6 text-center">
                        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-blue-500" />
                        <h2 className="text-xl font-bold text-white">
                            Verifying link...
                        </h2>
                        <p className="mt-2 text-sm text-gray-400">
                            Please wait while we secure your session.
                        </p>
                    </div>
                )}

                {/* STATE: ERROR */}
                {status === "error" && (
                    <div className="flex flex-col items-center py-6 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
                            <svg
                                className="h-8 w-8 text-red-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-white">
                            Link Expired or Invalid
                        </h2>
                        <p className="mt-2 text-sm text-gray-400">
                            {errorMessage}
                        </p>
                        <Button
                            onClick={() => router.push("/forgot-password")}
                            className="mt-6 w-full bg-gray-800 text-white hover:bg-gray-700"
                        >
                            Request a new link
                        </Button>
                    </div>
                )}

                {/* STATE: SUCCESS */}
                {status === "success" && (
                    <div className="flex flex-col items-center py-6 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                            <svg
                                className="h-8 w-8 text-green-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-white">
                            Password Updated!
                        </h2>
                        <p className="mt-2 text-sm text-gray-400">
                            You will be redirected to the sign-in page in{" "}
                            <span className="font-bold text-white">
                                {countdown}
                            </span>{" "}
                            seconds.
                        </p>
                        <Button
                            onClick={() => router.push("/login")}
                            className="mt-6 w-full bg-blue-600 font-bold text-white hover:bg-blue-500"
                        >
                            Sign In Now
                        </Button>
                    </div>
                )}

                {/* STATE: FORM */}
                {status === "form" && (
                    <>
                        <div className="text-center">
                            <h2 className="text-2xl font-bold tracking-tight text-white">
                                Set New Password
                            </h2>
                            <p className="mt-2 text-sm text-gray-400">
                                Please enter your new password below.
                            </p>
                        </div>

                        <form
                            onSubmit={form.handleSubmit(onSubmit)}
                            className="space-y-5"
                        >
                            <Controller
                                name="password"
                                control={form.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel
                                            htmlFor={field.name}
                                            className="text-gray-300"
                                        >
                                            New Password
                                        </FieldLabel>
                                        <div className="relative">
                                            <Input
                                                {...field}
                                                id={field.name}
                                                type={
                                                    showPassword
                                                        ? "text"
                                                        : "password"
                                                }
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                aria-invalid={
                                                    fieldState.invalid
                                                }
                                                className="border-gray-700 bg-gray-950 pr-10 text-white focus-visible:ring-blue-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowPassword(
                                                        !showPassword
                                                    )
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

                            <Controller
                                name="confirmPassword"
                                control={form.control}
                                render={({ field, fieldState }) => (
                                    <Field data-invalid={fieldState.invalid}>
                                        <FieldLabel
                                            htmlFor={field.name}
                                            className="text-gray-300"
                                        >
                                            Confirm New Password
                                        </FieldLabel>
                                        <div className="relative">
                                            <Input
                                                {...field}
                                                id={field.name}
                                                type={
                                                    showConfirmPassword
                                                        ? "text"
                                                        : "password"
                                                }
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                aria-invalid={
                                                    fieldState.invalid
                                                }
                                                className="border-gray-700 bg-gray-950 pr-10 text-white focus-visible:ring-blue-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowConfirmPassword(
                                                        !showConfirmPassword
                                                    )
                                                }
                                                className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 hover:text-gray-300 focus:outline-none"
                                                tabIndex={-1}
                                            >
                                                {showConfirmPassword ? (
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
                                className="mt-2 w-full bg-blue-600 font-bold text-white hover:bg-blue-500"
                            >
                                {isSubmitting
                                    ? "Updating..."
                                    : "Reset Password"}
                            </Button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center bg-gray-950" />
            }
        >
            <ResetPasswordContent />
        </Suspense>
    );
}
