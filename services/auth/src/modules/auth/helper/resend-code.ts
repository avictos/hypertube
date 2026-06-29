import { StatusCodes } from "http-status-codes";

import { env } from "../../../config/env";
import { db } from "../../../lib/db/orm/client";
import { logger } from "../../../config/logger";
import { AppError } from "../../../common/errors/app-error";
import { CRYPTO } from "../../../lib/crypto";
import { generateEmailVerificationToken } from "../../../lib/email-verification-token";
import { formatTime } from "../../../lib/format-time";

const COOLDOWN_PERIODS = [
    env.VERIFICATION_RESEND_COOLDOWN_1_MINUTES * 60 * 1000,
    env.VERIFICATION_RESEND_COOLDOWN_2_MINUTES * 60 * 1000,
    env.VERIFICATION_RESEND_COOLDOWN_3_MINUTES * 60 * 1000,
    env.VERIFICATION_RESEND_COOLDOWN_4_MINUTES * 60 * 1000,
];

export const resendVerificationCode = async (email: string): Promise<string> => {
    // 1. Retrieve the email record from the database
    const emailRecord = await db.emailAddresses.findUnique({
        where: {
            email: email,
        },
    });
    if (!emailRecord) {
        throw new AppError({
            statusCode: StatusCodes.NOT_FOUND,
            code: "AUTH_EMAIL_NOT_FOUND",
            message: "Email address not found",
        });
    }

    // 2. Check if the email is already verified
    if (emailRecord.is_verified) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_EMAIL_ALREADY_VERIFIED",
            message: "Email is already verified",
        });
    }

    // 3. Check if the email is locked due to too many resend attempts
    if (
        emailRecord.is_vcode_resend_locked === true &&
        emailRecord.vcode_resend_lock_expires_at &&
        emailRecord.vcode_resend_lock_expires_at.getTime() > Date.now()
    ) {
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_VCODE_RESEND_LOCKED",
            message: "Resending verification link is locked due to too many attempts",
        });
    }

    if (
        emailRecord.vcode_sent_at &&
        emailRecord.vcode_sent_at.getTime() +
            COOLDOWN_PERIODS[
                Math.min(emailRecord.vcode_resend_count! - 1, COOLDOWN_PERIODS.length - 1)
            ] >
            Date.now()
    ) {
        const waitMs =
            emailRecord.vcode_sent_at.getTime() +
            COOLDOWN_PERIODS[
                Math.min(emailRecord.vcode_resend_count! - 1, COOLDOWN_PERIODS.length - 1)
            ] -
            Date.now();
        throw new AppError({
            statusCode: StatusCodes.BAD_REQUEST,
            code: "AUTH_VCODE_RESEND_COOLDOWN",
            message: `Resending verification link is on cooldown. Try after ${formatTime(waitMs)}`,
        });
    }

    try {
        const newVerificationToken = generateEmailVerificationToken();
        const newVerificationTokenEncrypted = CRYPTO.encrypt(newVerificationToken);

        logger.info("Resending verification link", {
            email: email,
        });
        await db.emailAddresses.update({
            where: {
                email: email,
            },
            data: {
                verification_token: newVerificationTokenEncrypted,
                verification_expires_at: new Date(
                    Date.now() + env.VERIFICATION_TOKEN_EXPIRATION_MINUTES * 60 * 1000
                ),
                vcode_sent_at: new Date(),
                vcode_resend_count: emailRecord.vcode_resend_count! + 1,
                is_vcode_resend_locked:
                    emailRecord.vcode_resend_count! + 1 >= env.VERIFICATION_RESEND_LIMIT,
                vcode_resend_lock_expires_at:
                    emailRecord.vcode_resend_count! + 1 >= env.VERIFICATION_RESEND_LIMIT
                        ? new Date(
                              Date.now() + env.VERIFICATION_TOKEN_RESEND_LOCK_MINUTES * 60 * 1000
                          )
                        : null,
            },
        });

        return newVerificationToken;
    } catch (error) {
        logger.error("Failed to resend verification code:", { error });
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_RESEND_VERIFICATION_FAILED",
            message: "Failed to resend verification link",
        });
    }
};
