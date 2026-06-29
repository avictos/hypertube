"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/sdk/auth/auth-provider";

function DeleteAccountContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { signOut } = useAuth(); // Needed to clean up the UI state after deletion

    const [status, setStatus] = useState<
        "idle" | "loading" | "success" | "error"
    >("idle");
    const [errorMessage, setErrorMessage] = useState("");

    const userId = searchParams.get("userId");
    const token = searchParams.get("token");

    const handleConfirmDelete = async () => {
        if (!userId || !token) {
            setStatus("error");
            setErrorMessage("Invalid or missing deletion link parameters.");
            return;
        }

        setStatus("loading");
        try {
            const res = await fetch("/api/auth/me/delete/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, token }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(
                    data.message || data.error || "Failed to delete account"
                );
            }

            setStatus("success");

            // Wait 2 seconds so they can read the success message, then kick to login
            setTimeout(() => {
                signOut();
                router.push("/login");
            }, 2000);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            setStatus("error");
            setErrorMessage(error.message);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 font-sans text-white">
            <div className="w-full max-w-md space-y-6 rounded-2xl border border-red-900/40 bg-gray-900/80 p-8 text-center shadow-2xl backdrop-blur-md">
                {status === "success" ? (
                    <div className="flex flex-col items-center space-y-4">
                        <h2 className="text-2xl font-bold text-white">
                            Account Deleted
                        </h2>
                        <p className="text-sm text-gray-400">
                            Your account and all associated data have been
                            permanently removed. Redirecting...
                        </p>
                    </div>
                ) : (
                    <>
                        <h2 className="text-2xl font-bold text-red-400">
                            Final Confirmation
                        </h2>
                        <p className="text-sm leading-relaxed text-gray-400">
                            You are about to permanently delete your account.
                            This action is irreversible. All of your data will
                            be wiped immediately.
                        </p>

                        {status === "error" && (
                            <div className="rounded-lg bg-red-950/50 p-3 text-sm text-red-400">
                                {errorMessage}
                            </div>
                        )}

                        <div className="flex flex-col space-y-3 pt-4">
                            <Button
                                variant="destructive"
                                onClick={handleConfirmDelete}
                                disabled={status === "loading"}
                                className="w-full"
                            >
                                {status === "loading"
                                    ? "Deleting..."
                                    : "Yes, permanently delete my account"}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => router.push("/settings")}
                                disabled={status === "loading"}
                                className="w-full border-gray-700 bg-transparent text-white hover:bg-gray-800"
                            >
                                Cancel and return to settings
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// Wrapped in Suspense because it uses useSearchParams
export default function DeleteAccountPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
            <DeleteAccountContent />
        </Suspense>
    );
}
