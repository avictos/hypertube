"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const email = searchParams.get("email");
    const token = searchParams.get("token");

    const [status, setStatus] = useState<"loading" | "success" | "error">(
        "loading"
    );
    const [errorMessage, setErrorMessage] = useState("");
    const [countdown, setCountdown] = useState(5);
    const [resendStatus, setResendStatus] = useState<
        "idle" | "loading" | "sent" | "error"
    >("idle");

    // 1. Auto-verify on mount
    useEffect(() => {
        if (!email || !token) {
            setStatus("error");
            setErrorMessage(
                "Missing verification link parameters. Please use the link from your email."
            );
            return;
        }

        const verify = async () => {
            try {
                const res = await fetch(
                    "http://localhost:3333/api/v1/auth/verify-email",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email,
                            verificationToken: token,
                        }),
                    }
                );

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(
                        data.message || data.error || "Verification failed"
                    );
                }

                setStatus("success");
            } catch (error: any) {
                setStatus("error");
                setErrorMessage(error.message);
            }
        };

        verify();
    }, [email, token]);

    // 2. Handle Countdown math (Pure State Update)
    useEffect(() => {
        if (status === "success" && countdown > 0) {
            const timer = setInterval(() => {
                setCountdown((prev) => prev - 1);
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [status, countdown]);

    // 3. Handle the Redirect (Side Effect based on state)
    useEffect(() => {
        if (status === "success" && countdown <= 0) {
            router.push("/login");
        }
    }, [status, countdown, router]);

    // 3. Resend email handler
    const handleResend = async () => {
        if (!email) return;
        setResendStatus("loading");
        try {
            const res = await fetch(
                "http://localhost:3333/api/v1/auth/resend-verification",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                }
            );

            if (!res.ok) throw new Error("Failed to resend");
            setResendStatus("sent");
        } catch {
            setResendStatus("error");
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 font-sans text-white">
            <div className="w-full max-w-md space-y-6 rounded-2xl border border-gray-800 bg-gray-900/50 p-8 text-center shadow-2xl backdrop-blur-md">
                {status === "loading" && (
                    <div className="flex flex-col items-center space-y-4">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-blue-500" />
                        <h2 className="text-xl font-bold text-white">
                            Verifying your email...
                        </h2>
                        <p className="text-sm text-gray-400">
                            Please wait a moment while we validate your token.
                        </p>
                    </div>
                )}

                {status === "success" && (
                    <div className="flex flex-col items-center space-y-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
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
                            Email Verified!
                        </h2>
                        <p className="text-sm text-gray-400">
                            Your account is now active. You will be redirected
                            to the sign-in page in{" "}
                            <span className="font-bold text-white">
                                {countdown}
                            </span>{" "}
                            seconds.
                        </p>
                        <Button
                            onClick={() => router.push("/login")}
                            className="mt-4 w-full bg-blue-600 font-bold text-white hover:bg-blue-500"
                        >
                            Go to Sign In Now
                        </Button>
                    </div>
                )}

                {status === "error" && (
                    <div className="flex flex-col items-center space-y-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
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
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-white">
                            Verification Failed
                        </h2>
                        <p className="text-sm text-gray-400">{errorMessage}</p>

                        {email && (
                            <div className="w-full pt-4">
                                <Button
                                    onClick={handleResend}
                                    disabled={
                                        resendStatus === "loading" ||
                                        resendStatus === "sent"
                                    }
                                    className="w-full border border-gray-700 bg-transparent text-white hover:bg-gray-800"
                                >
                                    {resendStatus === "loading" && "Sending..."}
                                    {resendStatus === "sent" &&
                                        "New link sent!"}
                                    {resendStatus === "error" &&
                                        "Failed. Try again"}
                                    {resendStatus === "idle" &&
                                        "Resend Verification Email"}
                                </Button>
                            </div>
                        )}
                        <Button
                            onClick={() => router.push("/login")}
                            className="w-full bg-gray-800 text-white hover:bg-gray-700"
                        >
                            Back to Login
                        </Button>
                        <Button
                            onClick={() => router.push("/register")}
                            className="w-full bg-gray-800 text-white hover:bg-gray-700"
                        >
                            Back to Registration
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center bg-gray-950">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-700 border-t-blue-500" />
                </div>
            }
        >
            <VerifyEmailContent />
        </Suspense>
    );
}
