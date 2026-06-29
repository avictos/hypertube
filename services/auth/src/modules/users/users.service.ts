import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/errors/app-error";
import { db } from "../../lib/db/orm/client";
import { _argon2 } from "../../lib/argon2";
import { UpdateUserInput } from "./users.validation";

export type UserListItem = {
    id: string;
    username: string;
};

export const listUsers = async (): Promise<UserListItem[]> => {
    const rows = (await db.users.findMany({ select: ["id", "username"] })) as UserListItem[];
    return rows;
};

export type PublicProfile = {
    id: string;
    username: string;
    profilePictureUrl: string | null;
    email?: string;
    preferredLanguage?: string;
};

/**
 * Email is only included when the requester is viewing their own profile,
 * per section III.1 of the subject.
 */
export const getPublicProfile = async (
    targetUserId: string,
    requesterId: string
): Promise<PublicProfile> => {
    const record = (await db.users.findUnique({
        where: { id: targetUserId },
        select: ["id", "username", "profile_picture_url", "preferred_language"],
        include: { emailAddress: { select: ["email"] } },
    })) as any;

    if (!record) {
        throw new AppError({
            statusCode: StatusCodes.NOT_FOUND,
            code: "USER_NOT_FOUND",
            message: "User not found",
        });
    }

    const profile: PublicProfile = {
        id: record.id,
        username: record.username,
        profilePictureUrl: record.profile_picture_url ?? null,
    };

    if (requesterId === targetUserId) {
        profile.email = record.emailAddress?.email;
        profile.preferredLanguage = record.preferred_language;
    }

    return profile;
};

export const updatePublicProfile = async (
    targetUserId: string,
    input: UpdateUserInput
): Promise<PublicProfile> => {
    if (input.username !== undefined) {
        const existing = (await db.users.findUnique({
            where: { username: input.username.toLowerCase() },
            select: ["id"],
        })) as { id: string } | null;

        if (existing && existing.id !== targetUserId) {
            throw new AppError({
                statusCode: StatusCodes.CONFLICT,
                code: "USERNAME_EXISTS",
                message: "Username is already in use",
            });
        }
    }

    if (
        input.username !== undefined ||
        input.profilePictureUrl !== undefined ||
        input.preferredLanguage !== undefined
    ) {
        await db.users.update({
            where: { id: targetUserId },
            data: {
                ...(input.username !== undefined && { username: input.username.toLowerCase() }),
                ...(input.profilePictureUrl !== undefined && {
                    profile_picture_url: input.profilePictureUrl,
                }),
                ...(input.preferredLanguage !== undefined && {
                    preferred_language: input.preferredLanguage,
                }),
            },
            select: ["id"],
        });
    }

    if (input.email !== undefined) {
        const existingEmail = (await db.emailAddresses.findUnique({
            where: { email: input.email.toLowerCase() },
            select: ["user_id"],
        })) as { user_id: string } | null;

        if (existingEmail && existingEmail.user_id !== targetUserId) {
            throw new AppError({
                statusCode: StatusCodes.CONFLICT,
                code: "EMAIL_EXISTS",
                message: "Email is already in use",
            });
        }

        const currentEmail = (await db.emailAddresses.findFirst({
            where: { user_id: targetUserId },
            select: ["id"],
        })) as { id: string } | null;

        if (!currentEmail) {
            throw new AppError({
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                code: "EMAIL_RECORD_MISSING",
                message: "Email record not found for user",
            });
        }

        await db.emailAddresses.update({
            where: { id: currentEmail.id },
            data: { email: input.email.toLowerCase() },
            select: ["id"],
        });
    }

    if (input.password !== undefined) {
        const currentSecurity = (await db.securities.findFirst({
            where: { user_id: targetUserId },
            select: ["id"],
        })) as { id: string } | null;

        if (!currentSecurity) {
            throw new AppError({
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                code: "SECURITY_RECORD_MISSING",
                message: "Security record not found for user",
            });
        }

        const passwordHash = await _argon2.hash(input.password);
        await db.securities.update({
            where: { id: currentSecurity.id },
            data: { password_hash: passwordHash, password_changed_at: new Date() },
            select: ["id"],
        });
    }

    return getPublicProfile(targetUserId, targetUserId);
};
