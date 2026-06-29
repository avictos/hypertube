import { randomBytes, createCipheriv, createDecipheriv, CipherGCM, DecipherGCM } from "crypto";

import { env } from "../config/env";

export class CRYPTO {
    private static readonly algorithm = env.CRYPTO_ALGORITHM || "aes-256-gcm";
    private static readonly iv_length = env.CRYPTO_IV_LENGTH || 12; // GCM requires a 12-byte initialization vector (IV)
    private static readonly activeSecretKey = Buffer.from(env.MASTER_CRYPTO_KEY.key, "base64");
    private static readonly activeKeyVersion = env.MASTER_CRYPTO_KEY.version || 1;

    private constructor() {}

    /**
     * Retrieves the encryption key for a given version.
     * @param version The version number of the encryption key to retrieve
     * @returns The encryption key as a Buffer
     */
    private static getEncryptionKey(version: number): Buffer {
        const keyEntry = env.CRYPTO_KEYS.find((cryptoKey) => cryptoKey.version === version);

        if (!keyEntry) {
            throw new Error("Unsupported encryption version");
        }

        return Buffer.from(keyEntry.key, "base64");
    }

    /**
     * Encrypts UTF-8 plaintext using AES-GCM and returns a versioned payload.
     *
     * Output format: `version:iv:authTag:ciphertext` where each component is base64-encoded
     * except the numeric version.
     *
     * @param plainText - Plaintext value to encrypt.
     * @returns A versioned encrypted payload suitable for storage and later decryption.
     * @throws {Error} If the cipher cannot be initialized (for example, invalid algorithm/key/IV).
     * @throws {Error} If encryption fails during finalization.
     */
    public static encrypt(plainText: string): string {
        const iv = randomBytes(this.iv_length);
        const cipher = createCipheriv(this.algorithm, this.activeSecretKey, iv) as CipherGCM;

        let encrypted = cipher.update(plainText, "utf8", "base64");
        encrypted += cipher.final("base64");
        const authTag = cipher.getAuthTag();

        // Format: version:iv:authTag:ciphertext
        // authTag to ensure non-tampering of the ciphertext, especially important for GCM mode.
        return `v${this.activeKeyVersion}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
    }

    /**
     * Decrypts a payload produced by {@link encrypt}.
     *
     * Expected input format: `version:iv:authTag:ciphertext`.
     *
     * @param encryptedData - Versioned encrypted payload.
     * @returns The original UTF-8 plaintext.
     * @throws {Error} If the input format is invalid.
     * @throws {Error} If the payload references an unsupported key version.
     * @throws {Error} If authentication fails or decryption cannot be completed.
     */
    public static decrypt(encryptedData: string): string {
        const parts = encryptedData.split(":");

        const version = parts[0];
        const iv = Buffer.from(parts[1], "base64");
        const authTag = Buffer.from(parts[2], "base64");
        const ciphertext = parts[3];
        let encryptionKey: Buffer = this.activeSecretKey;

        if (parts.length !== 4) {
            throw new Error("Invalid encrypted data format");
        }

        const keyVersion = parseInt(version.slice(1), 10); // Remove 'v' prefix

        if (keyVersion !== this.activeKeyVersion) {
            encryptionKey = this.getEncryptionKey(keyVersion);
        }

        const decipher = createDecipheriv(this.algorithm, encryptionKey, iv) as DecipherGCM;
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, "base64", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    }

    /**
     * Rotates the encryption key for the given encrypted data.
     * @param encryptedData The existing encrypted data to be re-encrypted with the new key
     * @returns The re-encrypted data using the latest key version
     * @throws {Error} If decryption of the existing data fails (e.g., due to tampering or invalid format)
     * @throws {Error} If encryption with the new key fails
     */
    public static rotateKey(encryptedData: string): string {
        const decrypted = this.decrypt(encryptedData);

        const rotatedEncryption = this.encrypt(decrypted);

        return rotatedEncryption;
    }
}
