import { randomBytes } from "node:crypto";
import { StatusCodes } from "http-status-codes";

import { AppError } from "../../../common/errors/app-error";
import { env } from "../../../config/env";
import { _argon2 } from "../../../lib/argon2";
import { CRYPTO } from "../../../lib/crypto";
import { db } from "../../../lib/db/orm/client";
import { redis } from "../../../lib/redis/client";

type PasswordResetRecord = {
    id: string;
    email: string;
    user_id: string;
    is_verified: boolean;
    security: {
        id: string;
        reset_token: string | null;
        reset_expires_at: Date | null;
    };
};

type CachedResetToken = {
    token: string;
    expiresAt: string;
};

const resetTokenCacheKey = (email: string): string => {
    return `auth:password-reset:${email}`;
};

const getSecondsUntil = (expiresAt: Date): number => {
    return Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
};

const getCachedResetToken = async (email: string): Promise<CachedResetToken | null> => {
    const cached = await redis.get(resetTokenCacheKey(email));
    if (!cached) {
        return null;
    }

    try {
        const parsed = JSON.parse(cached) as CachedResetToken;
        const expiresAt = new Date(parsed.expiresAt);
        if (!parsed.token || Number.isNaN(expiresAt.getTime())) {
            await redis.del(resetTokenCacheKey(email));
            return null;
        }

        if (expiresAt.getTime() <= Date.now()) {
            await redis.del(resetTokenCacheKey(email));
            return null;
        }

        return parsed;
    } catch {
        await redis.del(resetTokenCacheKey(email));
        return null;
    }
};

const setCachedResetToken = async (
    email: string,
    token: string,
    expiresAt: Date
): Promise<void> => {
    const payload: CachedResetToken = {
        token,
        expiresAt: expiresAt.toISOString(),
    };

    await redis.set(resetTokenCacheKey(email), JSON.stringify(payload), {
        EX: getSecondsUntil(expiresAt),
    });
};

const getPasswordResetRecord = async (email: string): Promise<PasswordResetRecord> => {
    const emailRecord = await db.emailAddresses.findUnique({
        where: { email },
        select: ["id", "email", "user_id", "is_verified"],
        include: {
            security: {
                select: ["id", "reset_token", "reset_expires_at"],
            },
        },
    });

    if (!emailRecord) {
        throw new AppError({
            statusCode: StatusCodes.NOT_FOUND,
            code: "AUTH_EMAIL_NOT_FOUND",
            message: "Email address not found",
        });
    }

    if (!emailRecord.is_verified) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_EMAIL_NOT_VERIFIED",
            message: "Email is not verified",
        });
    }

    const security = emailRecord.security;
    if (!security?.id) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_SECURITY_RECORD_MISSING",
            message: "Security record not found",
        });
    }

    return {
        id: emailRecord.id!,
        email: emailRecord.email!,
        user_id: emailRecord.user_id!,
        is_verified: emailRecord.is_verified!,
        security,
    };
};

const assertResetTokenValid = (
    resetToken: string,
    resetRecord: { reset_token: string | null; reset_expires_at: Date | null }
): void => {
    if (!resetRecord.reset_token || !resetRecord.reset_expires_at) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_RESET_TOKEN_MISSING",
            message: "Password reset token is missing",
        });
    }

    if (resetRecord.reset_expires_at.getTime() <= Date.now()) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_RESET_TOKEN_EXPIRED",
            message: "Password reset token has expired",
        });
    }

    // eslint-disable-next-line no-useless-assignment
    let storedToken = "";
    try {
        storedToken = CRYPTO.decrypt(resetRecord.reset_token);
    } catch {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_RESET_TOKEN_INVALID",
            message: "Invalid password reset token",
        });
    }

    if (storedToken !== resetToken) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_RESET_TOKEN_INVALID",
            message: "Invalid password reset token",
        });
    }
};

const buildResetUrl = (email: string, resetToken: string): string => {
    return `${env.APP_DOMAIN}/reset-password?email=${encodeURIComponent(
        email
    )}&token=${encodeURIComponent(resetToken)}`;
};

export const createPasswordResetLink = async (email: string): Promise<string> => {
    const cached = await getCachedResetToken(email);
    if (cached) {
        return buildResetUrl(email, cached.token);
    }

    const emailRecord = await getPasswordResetRecord(email);

    if (emailRecord.security.reset_token && emailRecord.security.reset_expires_at) {
        if (emailRecord.security.reset_expires_at.getTime() > Date.now()) {
            const existingToken = CRYPTO.decrypt(emailRecord.security.reset_token);
            await setCachedResetToken(
                emailRecord.email,
                existingToken,
                emailRecord.security.reset_expires_at
            );
            return buildResetUrl(email, existingToken);
        }
    }

    const resetToken = randomBytes(32).toString("hex");
    const resetTokenEncrypted = CRYPTO.encrypt(resetToken);
    const resetExpiresAt = new Date(
        Date.now() + env.PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES * 60 * 1000
    );

    const updated = await db.securities.update({
        where: {
            id: emailRecord.security.id,
        },
        data: {
            reset_token: resetTokenEncrypted,
            reset_expires_at: resetExpiresAt,
        },
        select: ["id"],
    });

    if (updated.length === 0) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_PASSWORD_RESET_FAILED",
            message: "Failed to set password reset token",
        });
    }

    await setCachedResetToken(emailRecord.email, resetToken, resetExpiresAt);

    return buildResetUrl(email, resetToken);
};

export const verifyPasswordResetToken = async (
    email: string,
    resetToken: string
): Promise<void> => {
    const cached = await getCachedResetToken(email);
    if (cached && cached.token === resetToken) {
        return;
    }

    const emailRecord = await getPasswordResetRecord(email);

    assertResetTokenValid(resetToken, emailRecord.security);

    if (emailRecord.security.reset_token && emailRecord.security.reset_expires_at) {
        const existingToken = CRYPTO.decrypt(emailRecord.security.reset_token);
        await setCachedResetToken(
            emailRecord.email,
            existingToken,
            emailRecord.security.reset_expires_at
        );
    }
};

export const updatePasswordWithResetToken = async (
    email: string,
    resetToken: string,
    newPassword: string
): Promise<void> => {
    const cached = await getCachedResetToken(email);
    if (cached && cached.token !== resetToken) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_RESET_TOKEN_INVALID",
            message: "Invalid password reset token",
        });
    }

    const emailRecord = await getPasswordResetRecord(email);

    if (!cached) {
        assertResetTokenValid(resetToken, emailRecord.security);
    }

    const passwordHash = await _argon2.hash(newPassword);

    const updated = await db.securities.update({
        where: {
            id: emailRecord.security.id,
        },
        data: {
            password_hash: passwordHash,
            reset_token: null,
            reset_expires_at: null,
            password_changed_at: new Date(),
        },
        select: ["id"],
    });

    if (updated.length === 0) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_PASSWORD_CHANGE_FAILED",
            message: "Failed to update password",
        });
    }

    await redis.del(resetTokenCacheKey(emailRecord.email));
};
