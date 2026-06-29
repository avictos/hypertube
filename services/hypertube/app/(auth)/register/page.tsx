"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { SocialLoginButtons } from "@/components/social-login-buttons";

const registerSchema = z
    .object({
        firstName: z
            .string()
            .min(2, "Min 2 characters")
            .max(50, "Max 50 characters")
            .regex(/^[a-zA-Z]+$/, "First name can only contain letters"),
        lastName: z
            .string()
            .min(2, "Min 2 characters")
            .max(50, "Max 50 characters")
            .regex(/^[a-zA-Z]+$/, "Last name can only contain letters"),
        username: z
            .string()
            .min(3, "Min 3 characters")
            .max(30, "Max 30 characters")
            .regex(
                /^[a-zA-Z0-9_]+$/,
                "Username can only contain letters, numbers, and underscores"
            ),
        email: z
            .string()
            .email("Invalid email address")
            .min(5, "Email too short")
            .max(255, "Email too long"),
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

export default function RegisterPage() {
    const router = useRouter();
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [submittedEmail, setSubmittedEmail] = useState("");

    // Resend verification state
    const [resendStatus, setResendStatus] = useState<
        "idle" | "loading" | "sent" | "error"
    >("idle");

    // Toggles for password visibility
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const form = useForm<z.infer<typeof registerSchema>>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            firstName: "khalid",
            lastName: "zegani",
            username: "kzegani",
            email: "khalid.zegani@gmail.com",
            password: "Password1234!!",
            confirmPassword: "Password1234!!",
        },
    });

    async function onSubmit(values: z.infer<typeof registerSchema>) {
        setGlobalError(null);
        try {
            const { confirmPassword, ...dataToSend } = values;

            const res = await fetch(
                "http://localhost:3333/api/v1/auth/register",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(dataToSend),
                }
            );

            const data = await res.json();
            if (!res.ok)
                throw new Error(
                    data.message || data.error || "Failed to register"
                );

            setSubmittedEmail(values.email);
            setIsSuccess(true);
        } catch (error: unknown) {
            if (error instanceof Error) {
                setGlobalError(error.message || "An unexpected error occurred");
            } else {
                setGlobalError("An unexpected error occurred");
            }
        }
    }

    // --- RESEND HANDLER ---
    const handleResend = async () => {
        if (!submittedEmail) return;
        setResendStatus("loading");
        try {
            const res = await fetch(
                "http://localhost:3333/api/v1/auth/resend-verification",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: submittedEmail }),
                }
            );

            if (!res.ok) throw new Error("Failed to resend");
            setResendStatus("sent");
        } catch {
            setResendStatus("error");
        }
    };

    const isSubmitting = form.formState.isSubmitting;

    // --- SUCCESS SCREEN ---
    if (isSuccess) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 font-sans text-white">
                <div className="w-full max-w-md space-y-6 rounded-2xl border border-gray-800 bg-gray-900/50 p-8 text-center shadow-2xl backdrop-blur-md">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                        <svg
                            className="h-8 w-8 text-green-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
                            />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white">
                        Check your inbox
                    </h2>
                    <p className="text-sm leading-relaxed text-gray-400">
                        We&apos;ve sent a verification link to <br />
                        <span className="font-semibold text-white">
                            {submittedEmail}
                        </span>
                    </p>

                    <div className="flex flex-col space-y-3 pt-4">
                        <Button
                            onClick={handleResend}
                            disabled={
                                resendStatus === "loading" ||
                                resendStatus === "sent"
                            }
                            className="w-full bg-blue-600 font-bold text-white hover:bg-blue-500"
                        >
                            {resendStatus === "loading" && "Sending..."}
                            {resendStatus === "sent" && "New link sent!"}
                            {resendStatus === "error" && "Failed. Try again"}
                            {resendStatus === "idle" &&
                                "Resend Verification Email"}
                        </Button>
                        <Button
                            onClick={() => router.push("/login")}
                            className="w-full border border-gray-700 bg-transparent text-white hover:bg-gray-800"
                        >
                            Return to Sign In
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // --- REGISTRATION FORM ---
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 py-12 font-sans text-white">
            <div className="w-full max-w-md space-y-8 rounded-2xl border border-gray-800 bg-gray-900/50 p-8 shadow-2xl backdrop-blur-md">
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
                        Create an account
                    </h2>
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
                    <div className="grid grid-cols-2 gap-4">
                        <Controller
                            name="firstName"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel
                                        htmlFor={field.name}
                                        className="text-gray-300"
                                    >
                                        First Name
                                    </FieldLabel>
                                    <Input
                                        {...field}
                                        id={field.name}
                                        autoComplete="given-name"
                                        placeholder="John"
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
                            name="lastName"
                            control={form.control}
                            render={({ field, fieldState }) => (
                                <Field data-invalid={fieldState.invalid}>
                                    <FieldLabel
                                        htmlFor={field.name}
                                        className="text-gray-300"
                                    >
                                        Last Name
                                    </FieldLabel>
                                    <Input
                                        {...field}
                                        id={field.name}
                                        autoComplete="family-name"
                                        placeholder="Doe"
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
                    </div>

                    <Controller
                        name="username"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    htmlFor={field.name}
                                    className="text-gray-300"
                                >
                                    Username
                                </FieldLabel>
                                <Input
                                    {...field}
                                    id={field.name}
                                    autoComplete="username"
                                    placeholder="johndoe123"
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
                                <FieldLabel
                                    htmlFor={field.name}
                                    className="text-gray-300"
                                >
                                    Password
                                </FieldLabel>
                                <div className="relative">
                                    <Input
                                        {...field}
                                        id={field.name}
                                        type={
                                            showPassword ? "text" : "password"
                                        }
                                        autoComplete="new-password"
                                        placeholder="••••••••"
                                        aria-invalid={fieldState.invalid}
                                        className="border-gray-700 bg-gray-950 pr-10 text-white focus-visible:ring-blue-500"
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

                    <Controller
                        name="confirmPassword"
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <Field data-invalid={fieldState.invalid}>
                                <FieldLabel
                                    htmlFor={field.name}
                                    className="text-gray-300"
                                >
                                    Confirm Password
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
                                        placeholder="••••••••"
                                        aria-invalid={fieldState.invalid}
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
                        {isSubmitting ? "Creating account..." : "Sign Up"}
                    </Button>
                </form>

                <SocialLoginButtons />

                <p className="text-center text-sm text-gray-400">
                    Already have an account?{" "}
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
