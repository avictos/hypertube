import { randomBytes } from "node:crypto";
import { StatusCodes } from "http-status-codes";

import { AppError } from "../../../common/errors/app-error";
import { env } from "../../../config/env";
import { CRYPTO } from "../../../lib/crypto";
import { db } from "../../../lib/db/orm/client";
import { redis } from "../../../lib/redis/client";

type DeleteTokenRecord = {
    id: string;
    delete_token: string | null;
    delete_expires_at: Date | null;
};

const deleteTokenCacheKey = (userId: string): string => {
    return `auth:account-delete:${userId}`;
};

const getSecondsUntil = (expiresAt: Date): number => {
    return Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
};

const buildDeleteConfirmUrl = (userId: string, token: string): string => {
    return `${env.APP_DOMAIN}/delete-account?userId=${encodeURIComponent(
        userId
    )}&token=${encodeURIComponent(token)}`;
};

/**
 * Generates a new account-deletion confirmation token, overwriting any
 * existing tokens to ensure older emails are instantly invalidated.
 * Caches it in Redis and returns the confirmation URL.
 */
export const createAccountDeletionLink = async (userId: string): Promise<string> => {
    // 1. Get the security record ID so we can perform the update
    const security = (await db.securities.findFirst({
        where: { user_id: userId },
        select: ["id"],
    })) as DeleteTokenRecord | null;

    if (!security) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_SECURITY_RECORD_MISSING",
            message: "Security record not found",
        });
    }

    // 2. ALWAYS generate a brand new token
    const deleteToken = randomBytes(32).toString("hex");
    const deleteTokenEncrypted = CRYPTO.encrypt(deleteToken);
    const deleteExpiresAt = new Date(
        Date.now() + env.ACCOUNT_DELETE_TOKEN_EXPIRATION_MINUTES * 60 * 1000
    );

    // 3. Overwrite the database record (This instantly invalidates old DB tokens)
    const updated = await db.securities.update({
        where: { id: security.id },
        data: {
            delete_token: deleteTokenEncrypted,
            delete_expires_at: deleteExpiresAt,
        },
        select: ["id"],
    });

    if (updated.length === 0) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_ACCOUNT_DELETE_REQUEST_FAILED",
            message: "Failed to create account deletion request",
        });
    }

    // 4. Overwrite the Redis cache (This instantly invalidates old cached tokens)
    await redis.set(
        deleteTokenCacheKey(userId),
        JSON.stringify({ token: deleteToken, expiresAt: deleteExpiresAt.toISOString() }),
        { EX: getSecondsUntil(deleteExpiresAt) }
    );

    return buildDeleteConfirmUrl(userId, deleteToken);
};

/**
 * Verifies the deletion token for `userId` and, if valid, deletes the account.
 * Cascades (email_addresses, securities, sessions) via the existing FK
 * ON DELETE CASCADE constraints — same as the original deleteAccount in me.ts.
 */
export const confirmAccountDeletion = async (userId: string, token: string): Promise<void> => {
    const cached = await redis.get(deleteTokenCacheKey(userId));
    let tokenIsValid = false;

    if (cached) {
        try {
            const parsed = JSON.parse(cached) as { token: string; expiresAt: string };
            if (parsed.token === token && new Date(parsed.expiresAt).getTime() > Date.now()) {
                tokenIsValid = true;
            }
        } catch {
            // fall through to DB check
        }
    }

    if (!tokenIsValid) {
        // Same findFirst rationale as above — user_id isn't a UNIQUE column
        // on securities per the generated SecurityUniqueFields type.
        const security = (await db.securities.findFirst({
            where: { user_id: userId },
            select: ["id", "delete_token", "delete_expires_at"],
        })) as DeleteTokenRecord | null;

        if (!security) {
            throw new AppError({
                statusCode: StatusCodes.NOT_FOUND,
                code: "AUTH_USER_NOT_FOUND",
                message: "User not found",
            });
        }

        if (!security.delete_token || !security.delete_expires_at) {
            throw new AppError({
                statusCode: StatusCodes.BAD_REQUEST,
                code: "AUTH_DELETE_TOKEN_MISSING",
                message: "No account deletion request is pending",
            });
        }

        if (security.delete_expires_at.getTime() <= Date.now()) {
            throw new AppError({
                statusCode: StatusCodes.BAD_REQUEST,
                code: "AUTH_DELETE_TOKEN_EXPIRED",
                message: "Account deletion link has expired",
            });
        }

        // eslint-disable-next-line no-useless-assignment
        let storedToken = "";
        try {
            storedToken = CRYPTO.decrypt(security.delete_token);
        } catch {
            throw new AppError({
                statusCode: StatusCodes.BAD_REQUEST,
                code: "AUTH_DELETE_TOKEN_INVALID",
                message: "Invalid account deletion token",
            });
        }

        if (storedToken !== token) {
            throw new AppError({
                statusCode: StatusCodes.BAD_REQUEST,
                code: "AUTH_DELETE_TOKEN_INVALID",
                message: "Invalid account deletion token",
            });
        }
    }

    const deleted = await db.users.delete({
        where: { id: userId },
    });

    if (!deleted) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_ACCOUNT_DELETION_FAILED",
            message: "Failed to delete account",
        });
    }

    await redis.del(deleteTokenCacheKey(userId));
    await redis.del(`auth:sessions:${userId}:count`);
    await redis.del(`auth:sessions:${userId}:oldest_expiry`);
};
