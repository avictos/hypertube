import { StatusCodes } from "http-status-codes";

import { AppError } from "../../../common/errors/app-error";
import { db } from "../../../lib/db/orm/client";
import { redis } from "../../../lib/redis/client";

const MAX_SESSIONS = 5;

export type SessionSummary = {
    id: string;
    createdAt: Date;
    expiresAt: Date;
    isCurrent: boolean;
};

export type MeResult = {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    isEmailVerified: boolean;
    mfaEnabled: boolean;
    lastLoginAt: Date | null;
    passwordChangedAt: Date;
    accountCreatedAt: Date;
    sessions: {
        active: number;
        max: number;
        items: SessionSummary[];
    };
};

// Notice the signature change here
export const getMe = async (userId: string, currentTrackerId: string): Promise<MeResult> => {
    // 1. Fetch user and 1:1 relations
    const record = (await db.users.findUnique({
        where: { id: userId },
        select: ["id", "first_name", "last_name", "username", "created_at"],
        include: {
            emailAddress: {
                select: ["email", "is_verified"],
            },
            security: {
                select: ["mfa_enabled", "last_login_at", "password_changed_at"],
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any;

    if (!record) {
        throw new AppError({
            statusCode: StatusCodes.NOT_FOUND,
            code: "AUTH_USER_NOT_FOUND",
            message: "User not found",
        });
    }

    // 2. Fetch sessions (1:Many) separately
    const sessions = (await db.sessions.findMany({
        where: { user_id: userId },
        // ADDED "tracker_id" to the select array so we can compare it below!
        select: ["id", "tracker_id", "session_token", "created_at", "expires_at"],
        orderBy: { created_at: "DESC" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any[];

    const emailRecord = record.emailAddress;
    if (!emailRecord) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_EMAIL_RECORD_MISSING",
            message: "Email record not found for user",
        });
    }

    const securityRecord = record.security;
    if (!securityRecord) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_SECURITY_RECORD_MISSING",
            message: "Security record not found for user",
        });
    }

    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const liveSessions = sessions.filter((s: any) => s.expires_at.getTime() > now);

    const sessionSummaries: SessionSummary[] = [];
    let isCurrentSessionValid = false; // <-- Track if we find the active session

    for (const session of liveSessions) {
        const isCurrent = session.tracker_id === currentTrackerId;

        if (isCurrent) {
            isCurrentSessionValid = true; // Match found!
        }

        sessionSummaries.push({
            id: session.id,
            createdAt: session.created_at,
            expiresAt: session.expires_at,
            isCurrent,
        });
    }

    // THE FIX: If the tracker ID isn't in the database, the session is dead/orphaned.
    if (!isCurrentSessionValid) {
        throw new AppError({
            statusCode: StatusCodes.UNAUTHORIZED,
            code: "AUTH_SESSION_REVOKED",
            message: "Session is invalid or has been revoked",
        });
    }

    // 6. Return the mapped payload
    return {
        id: record.id,
        firstName: record.first_name,
        lastName: record.last_name,
        username: record.username,
        email: emailRecord.email,
        isEmailVerified: emailRecord.is_verified,
        mfaEnabled: securityRecord.mfa_enabled,
        lastLoginAt: securityRecord.last_login_at,
        passwordChangedAt: securityRecord.password_changed_at,
        accountCreatedAt: record.created_at,
        sessions: {
            active: liveSessions.length,
            max: MAX_SESSIONS,
            items: sessionSummaries,
        },
    };
};

export type UpdateProfileInput = {
    firstName?: string;
    lastName?: string;
    username?: string;
};

export type UpdateProfileResult = {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
};

export const updateProfile = async (
    userId: string,
    input: UpdateProfileInput
): Promise<UpdateProfileResult> => {
    if (input.username) {
        const existingUsername = await db.users.findUnique({
            where: { username: input.username.toLowerCase() },
            select: ["id"],
        });

        if (existingUsername && existingUsername.id !== userId) {
            throw new AppError({
                statusCode: StatusCodes.CONFLICT,
                code: "AUTH_USERNAME_EXISTS",
                message: "Username is already in use",
            });
        }
    }

    const updated = await db.users.update({
        where: { id: userId },
        data: {
            ...(input.firstName !== undefined && { first_name: input.firstName }),
            ...(input.lastName !== undefined && { last_name: input.lastName }),
            ...(input.username !== undefined && { username: input.username.toLowerCase() }),
        },
        select: ["id", "first_name", "last_name", "username"],
    });

    if (!updated) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_PROFILE_UPDATE_FAILED",
            message: "Failed to update profile",
        });
    }

    const updatedRow = updated[0];

    if (!updatedRow) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_PROFILE_UPDATE_FAILED",
            message: "Failed to update profile",
        });
    }

    return {
        id: updatedRow.id!,
        firstName: updatedRow.first_name!,
        lastName: updatedRow.last_name!,
        username: updatedRow.username!,
    };
};

export const deleteAccount = async (userId: string): Promise<void> => {
    // sessions, email_addresses, and securities cascade-delete via FK ON DELETE CASCADE
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

    // Best-effort cleanup of cached per-user keys; the rows are already gone so this
    // doesn't need to be in the same transaction.
    try {
        await redis.del(`auth:sessions:${userId}:count`);
        await redis.del(`auth:sessions:${userId}:oldest_expiry`);
    } catch {
        // Non-fatal: stale cache keys will simply expire on their own TTL.
    }
};
