import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.crypto" });

const getVersionedKeys = () => {
    const duplicateKeys = Object.keys(process.env).filter(
        (key) =>
            key.startsWith("CRYPTO_SECRET_KEY_V") &&
            Object.keys(process.env).filter((k) => k === key).length > 1
    );

    if (duplicateKeys.length > 0) {
        console.error(
            `Duplicate CRYPTO_SECRET_KEY_V{n} environment variables found: ${duplicateKeys.join(", ")}.`
        );
        process.exit(1);
    }
    const foundKeys = Object.keys(process.env).map((key) => key.startsWith("CRYPTO_SECRET_KEY_V"));

    if (foundKeys.length === 0) {
        console.error(
            "No CRYPTO_SECRET_KEY_V{n} environment variables found. At least one is required."
        );
        process.exit(1);
    }

    return Object.keys(process.env)
        .filter((key) => key.startsWith("CRYPTO_SECRET_KEY_V"))
        .map((key) => {
            const version = parseInt(key.replace("CRYPTO_SECRET_KEY_V", ""), 10);
            if (isNaN(version)) {
                console.error(`Invalid CRYPTO_SECRET_KEY version in environment variable: ${key}`);
                process.exit(1);
            }
            return {
                version,
                key: process.env[key] as string,
            };
        })
        .sort((a, b) => a.version - b.version); // Sort by version ascending
};

const versionedKeys = getVersionedKeys();

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    PORT: z.coerce.number().int().positive().default(3000),
    API_PREFIX: z.string().default("/api"),
    CORS_FRONTEND_ORIGIN: z.url().default("http://localhost:5173"),

    AUTH_DOMAIN: z.url().default("http://localhost:3000"),
    APP_DOMAIN: z.url().default("http://localhost:3000"),

    // The auth service's own externally-reachable origin — distinct from AUTH_DOMAIN
    // (which is actually the frontend's domain, used only for cookie scoping). OAuth
    // providers redirect back here, so this must point at this service's real port.
    AUTH_SERVICE_PUBLIC_URL: z.url().default("http://localhost:3333"),

    OAUTH_42_CLIENT_ID: z.string().optional(),
    OAUTH_42_CLIENT_SECRET: z.string().optional(),
    OAUTH_GOOGLE_CLIENT_ID: z.string().optional(),
    OAUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
    OAUTH_FACEBOOK_CLIENT_ID: z.string().optional(),
    OAUTH_FACEBOOK_CLIENT_SECRET: z.string().optional(),

    AUTH_SECRET_KEY: z.string().min(32).default("dev_only_replace_with_secure_key"),

    JWT_PRIVATE_KEY: z.string().min(32).default("dev_only_replace_with_private_key"),
    JWT_PUBLIC_KEY: z.string().min(32).default("dev_only_replace_with_public_key"),
    JWT_CLIENT_ACCESS_TO_PUBLIC_KEY_NAME: z.string().default("well-known:jwks.json"),
    JWT_CLIENT_ACCESS_TO_PUBLIC_KEY_SECRET: z
        .string()
        .min(32)
        .default("dev_only_replace_with_secret"),

    JWT_SESSION_COOKIE_NAME: z.string().default("__session"),
    JWT_CLIENT_COOKIE_NAME: z.string().default("__client"),
    JWT_SESSION_EXPIRES_IN: z.string().default("3m"),
    JWT_CLIENT_EXPIRES_IN: z.string().default("7d"), // 7 days
    JWT_SESSION_EXPIRATION_SECONDS: z.coerce.number().int().min(1).default(180), // 3 minutes
    JWT_CLIENT_EXPIRATION_SECONDS: z.coerce.number().int().min(1).default(604800), // 7 days
    JWT_ISSUER: z.url().default("http://localhost:3000"),
    JWT_AUDIENCE: z.url().default("http://localhost:5173"),
    SESSION_TOKEN_PATH: z.string().default("/"),
    CLIENT_TOKEN_PATH: z.string().default("http://localhost:3333/api/v1/auth/refresh"),

    ACCOUNT_DELETE_TOKEN_EXPIRATION_MINUTES: z.coerce.number().int().min(1).default(15),

    // For Crypto
    CRYPTO_ALGORITHM: z.string().default("aes-256-gcm"),
    CRYPTO_IV_LENGTH: z.coerce.number().int().min(1).default(12),
    CRYPTO_KEYS: z
        .array(
            z.object({
                version: z.number().int().positive(),
                key: z.string().min(32),
            })
        )
        .min(1, "At least one CRYPTO_SECRET_KEY_V{n} must be provided."),

    // For Argon2
    ARGON2_MAX_PARALLELISM: z.coerce.number().int().min(1).default(4),
    ARGON2_MAX_MEMORY_COST: z.coerce.number().int().min(10000).default(65536), // 64 MB
    ARGON2_MAX_TIME_COST: z.coerce.number().int().min(1).default(3),

    // For Input Validation
    FIRST_NAME_MIN_LENGTH: z.coerce.number().int().min(1).default(2),
    FIRST_NAME_MAX_LENGTH: z.coerce.number().int().min(1).default(50),
    LAST_NAME_MIN_LENGTH: z.coerce.number().int().min(1).default(2),
    LAST_NAME_MAX_LENGTH: z.coerce.number().int().min(1).default(50),
    USERNAME_MIN_LENGTH: z.coerce.number().int().min(1).default(2),
    USERNAME_MAX_LENGTH: z.coerce.number().int().min(1).default(20),
    PASSWORD_MIN_LENGTH: z.coerce.number().int().min(1).default(8),
    PASSWORD_MAX_LENGTH: z.coerce.number().int().min(1).default(72),
    EMAIL_MIN_LENGTH: z.coerce.number().int().min(1).default(5),
    EMAIL_MAX_LENGTH: z.coerce.number().int().min(1).default(254),

    RECOVERY_CODE_LENGTH: z.coerce.number().int().min(1).default(8),
    RECOVERY_CODE_MAX_COUNT: z.coerce.number().int().min(1).default(10),
    MAX_VERIFICATION_ATTEMPTS: z.coerce.number().int().min(1).default(3),

    VERIFICATION_TOKEN_EXPIRATION_MINUTES: z.coerce.number().int().min(1).default(15),
    PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES: z.coerce.number().int().min(1).default(15),
    VERIFICATION_ATTEMPT_RESET_WINDOW_MINUTES: z.coerce.number().int().min(1).default(60), // 1 hour
    VERIFICATION_TOKEN_RESEND_LOCK_MINUTES: z.coerce.number().int().min(1).default(1440), // 24 hours
    VERIFICATION_RESEND_LIMIT: z.coerce.number().int().min(1).default(5),
    VERIFICATION_RESEND_COOLDOWN_1_MINUTES: z.coerce.number().int().min(0).default(1),
    VERIFICATION_RESEND_COOLDOWN_2_MINUTES: z.coerce.number().int().min(0).default(5),
    VERIFICATION_RESEND_COOLDOWN_3_MINUTES: z.coerce.number().int().min(0).default(15),
    VERIFICATION_RESEND_COOLDOWN_4_MINUTES: z.coerce.number().int().min(0).default(60), // 1 hour
    EMAIL_LOCK_DURATION_MINUTES: z.coerce.number().int().min(0).default(1440), // 24 hours

    // For Rate Limiting
    MAX_SESSIONS_PER_USER: z.coerce.number().int().min(1).default(5),

    // Postgres Database variables
    MAX_DB_POOL_SIZE: z.coerce.number().int().min(1).default(20),
    IDLE_TIMEOUT_MILLIS: z.coerce.number().int().min(0).default(60_000),
    CONNECTION_TIMEOUT_MILLIS: z.coerce.number().int().min(0).default(2_000),

    DATABASE_URL: z.string().min(1),

    // Redis variables
    REDIS_HOST: z.string().min(1).default("localhost"),
    REDIS_PORT: z.coerce.number().int().min(1).default(6379),
    REDIS_PASSWORD: z
        .string()
        .optional()
        .transform((value) => {
            const trimmed = value?.trim();
            return trimmed && trimmed.length > 0 ? trimmed : undefined;
        }),
    REDIS_CONNECTION_TIMEOUT_MILLIS: z.coerce.number().int().min(0).default(10_000),

    // AWS SES variables
    AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
    AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    AWS_REGION: z.string().min(1).optional(),
    AWS_SES_SOURCE_EMAIL: z.email().min(1).optional(),
});

const parsed = envSchema.safeParse({
    ...process.env,
    CRYPTO_KEYS: versionedKeys,
});

if (!parsed.success) {
    const issues = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
        .join("; ");

    console.error(`Invalid environment variables: ${issues}`);
    process.exit(1);
}

const data = parsed.data;

export const env = {
    ...data,
    /** The latest key version used for new encryptions */
    get MASTER_CRYPTO_KEY() {
        return data.CRYPTO_KEYS[data.CRYPTO_KEYS.length - 1];
    },
};
