import os from "node:os";
import * as argon2 from "argon2";
import { env } from "../config/env";

export class _argon2 {
    /**
     * Calculates the ideal Argon2 parallelism based on hardware.
     * Rule: 50% of available cores, capped at a maximum of 4.
     */
    private static getParallelism(): number {
        // os.availableParallelism() is preferred in Node 18.14+
        // It accounts for container limits (like Docker/Kubernetes)
        const cores = os.availableParallelism ? os.availableParallelism() : os.cpus().length;

        const halfCores = Math.floor(cores * 0.5);

        // Clamp between 1 (minimum) and 4 (user-defined max)
        return Math.min(env.ARGON2_MAX_PARALLELISM, Math.max(1, halfCores));
    }

    /**
     * Hashes a password using Argon2 with secure parameters.
     * @param password The plaintext password to hash.
     * @returns The resulting hash string.
     */
    static async hash(password: string): Promise<string> {
        return await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: env.ARGON2_MAX_MEMORY_COST,
            timeCost: env.ARGON2_MAX_TIME_COST,
            parallelism: this.getParallelism(),
        });
    }

    /**
     * Verifies a plaintext password against an Argon2 hash.
     * @param hash The Argon2 hash to verify against.
     * @param password The plaintext password to verify.
     * @returns True if the password matches the hash, false otherwise.
     */
    static async verify(hash: string, password: string): Promise<boolean> {
        try {
            return await argon2.verify(hash, password);
        } catch (error) {
            console.error("Error verifying password:", error);
            return false;
        }
    }
}
