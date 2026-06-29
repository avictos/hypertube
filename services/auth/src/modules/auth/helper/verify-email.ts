import { StatusCodes } from "http-status-codes";

import { AppError } from "../../../common/errors/app-error";
import { env } from "../../../config/env";
import { CRYPTO } from "../../../lib/crypto";
import { db } from "../../../lib/db/orm/client";

type VerificationEmailLookupRecord = {
    id: string;
    verification_attempts: number;
    verification_expires_at: Date;
    verification_token: string;
    last_verification_attempt_at: Date | null;
    is_verified: boolean;
    is_locked: boolean;
    lock_expires_at: Date | null;
};

type VerificationEmailRecord = {
    id: string;
    verification_attempts: number;
};

const attemptTokenVerification = async (
    email: string,
    token: string
): Promise<VerificationEmailRecord> => {
    const emailRecord = (await db.emailAddresses.findUnique({
        where: {
            email: email,
        },
    })) as VerificationEmailLookupRecord | null;

    if (!emailRecord) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_EMAIL_NOT_FOUND",
            message: "Email address not found",
        });
    }

    if (
        emailRecord.is_locked === true &&
        emailRecord.lock_expires_at &&
        emailRecord.lock_expires_at.getTime() > Date.now()
    ) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_EMAIL_LOCKED",
            message: "Email is locked due to too many failed verification attempts",
        });
    }

    if (emailRecord.is_verified === true) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_EMAIL_ALREADY_VERIFIED",
            message: "Email is already verified",
        });
    }

    if (emailRecord.verification_expires_at.getTime() <= Date.now()) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_VERIFICATION_TOKEN_EXPIRED",
            message: "Verification link has expired",
        });
    }

    // eslint-disable-next-line no-useless-assignment
    let storedToken = "";
    try {
        storedToken = CRYPTO.decrypt(emailRecord.verification_token);
    } catch {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_INVALID_VERIFICATION_TOKEN",
            message: "Invalid verification token",
        });
    }

    if (storedToken !== token) {
        if (emailRecord.verification_attempts! + 1 >= env.MAX_VERIFICATION_ATTEMPTS) {
            await db.emailAddresses.update({
                where: {
                    id: emailRecord.id,
                },
                data: {
                    verification_attempts: 0,
                    last_verification_attempt_at: new Date(),
                    is_locked: true,
                    lock_expires_at: new Date(
                        Date.now() + env.EMAIL_LOCK_DURATION_MINUTES * 60 * 1_000
                    ),
                },
            });
            throw new AppError({
                statusCode: StatusCodes.BAD_REQUEST,
                code: "AUTH_TOO_MANY_VERIFICATION_ATTEMPTS",
                message: "Too many verification attempts",
            });
        }

        const resetVerificationAttempts = emailRecord.last_verification_attempt_at
            ? emailRecord.last_verification_attempt_at.getTime() +
                  env.VERIFICATION_ATTEMPT_RESET_WINDOW_MINUTES * 60 * 1_000 <=
              Date.now()
            : false;

        await db.emailAddresses.update({
            where: {
                id: emailRecord.id,
            },
            data: {
                verification_attempts: resetVerificationAttempts
                    ? 1
                    : emailRecord.verification_attempts! + 1,
                last_verification_attempt_at: new Date(),
            },
        });

        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_INVALID_VERIFICATION_TOKEN",
            message: "Invalid verification token",
        });
    }

    return {
        id: emailRecord.id,
        verification_attempts: emailRecord.verification_attempts!,
    };
};

const markEmailAsVerified = async (emailRecord: VerificationEmailRecord): Promise<void> => {
    await db.emailAddresses.update({
        where: {
            id: emailRecord.id,
        },
        data: {
            is_verified: true,
            verification_attempts: emailRecord.verification_attempts + 1,
        },
    });
};

const buildVerificationLink = (email: string, token: string): string => {
    return `${env.APP_DOMAIN}/verify-email?email=${encodeURIComponent(
        email
    )}&token=${encodeURIComponent(token)}`;
};

export { attemptTokenVerification, markEmailAsVerified, buildVerificationLink };
