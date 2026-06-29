import { randomInt } from "node:crypto";

/**
 * Generates a secure 6-digit numeric verification code.
 * Uses CSPRNG (Cryptographically Secure Pseudo-Random Number Generator).
 */
export const generateEmailVerificationCode = (): string => {
    // randomInt(min, max) generates a number where min <= n < max
    return randomInt(100_000, 1_000_000).toString();
};
