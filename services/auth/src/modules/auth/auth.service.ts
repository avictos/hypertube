import { StatusCodes } from "http-status-codes";

import type {
    AuthTokenPayload,
    AuthUser,
    AuthVerifyEmailResult,
    ChangePasswordResult,
    LoginInput,
    PasswordResetLinkResult,
    PasswordResetVerifyResult,
    ResendVerificationResult,
} from "./auth.types";
import { logger } from "../../config/logger";
import { AppError } from "../../common/errors/app-error";
import { checkAccountDoesNotExist, createRecords } from "./helper/register";
import {
    jwksJSONInput,
    RegisterInput,
    ResendVerificationInput,
    ResetPasswordRequestInput,
    ResetPasswordVerifyInput,
    VerifyEmailInput,
    ChangePasswordInput,
    ConfirmDeleteAccountInput,
} from "./auth.validation";
import {
    attemptTokenVerification,
    buildVerificationLink,
    markEmailAsVerified,
} from "./helper/verify-email";
import { resendVerificationCode } from "./helper/resend-code";
import { checkUserExists, LoginTokens, loginUser, verifyPassword } from "./helper/login";
import { env } from "../../config/env";
import { JWT } from "../../lib/jwt";
import { isSessionValid } from "./helper/refresh";
import { getPublicKey } from "./helper/jwks-json";
import {
    createPasswordResetLink,
    updatePasswordWithResetToken,
    verifyPasswordResetToken,
} from "./helper/password-reset";
import { revokeAllSessionsByUserId, revokeSessionByTrackerId } from "./helper/logout";
import {
    sendAccountDeletionEmail,
    sendPasswordResetEmail,
    sendVerificationEmail,
} from "./helper/email";
import { db } from "../../lib/db/orm/client";
import {
    deleteAccount,
    getMe,
    MeResult,
    updateProfile,
    UpdateProfileInput,
    UpdateProfileResult,
} from "./helper/me";
import { confirmAccountDeletion, createAccountDeletionLink } from "./helper/delete-account";
import { revokeSessionById } from "./helper/revoke-session";

class AuthService {
    public async jwksJSON(input: jwksJSONInput): Promise<string> {
        try {
            if (input.clientSecret === env.JWT_CLIENT_ACCESS_TO_PUBLIC_KEY_SECRET) {
                return await getPublicKey();
            }
            throw new AppError({
                statusCode: StatusCodes.UNAUTHORIZED,
                code: "PUBLIC_KEY_RETRIEVAL_UNAUTHORIZED",
                message: "Invalid client secret",
            });
        } catch (error) {
            logger.debug("Error retrieving public key", { error });
            logger.error("Failed to retrieve public key:", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw new AppError({
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                code: "PUBLIC_KEY_RETRIEVAL_FAILED",
                message: "Failed to retrive public key.",
            });
        }
    }

    /**
     * Registers a new user. Validates input, checks for existing email, hashes password, and creates the user record.
     * @param input Registration data including first name, last name, username, email, and password
     * @returns An AuthResult containing the public user data and access token
     */
    public async register(input: RegisterInput): Promise<AuthUser> {
        try {
            // Check if email already exists
            //* if the email already exists, an AppError will be thrown with status code 409
            await checkAccountDoesNotExist(input.email, input.username);

            const result = await createRecords(
                input.firstName,
                input.lastName,
                input.username,
                input.email,
                input.password
            );

            const verificationLink = buildVerificationLink(
                input.email,
                result.emailAddress.verificationToken
            );

            try {
                await sendVerificationEmail(input.email, verificationLink);
            } catch (error) {
                logger.debug("Failed to send verification email:", { error });
                logger.error("Failed to send verification email for email:", {
                    email: input.email,
                    message: error instanceof Error ? error.message : "Unknown error",
                });

                // Best-effort rollback if email sending fails
                const userId = result.user.id;
                if (userId) {
                    try {
                        await db.securities.delete({
                            where: {
                                user_id: userId,
                            },
                        });
                    } catch (cleanupError) {
                        logger.error("Failed to delete security record after email failure", {
                            error: cleanupError,
                            userId,
                        });
                    }
                    try {
                        await db.emailAddresses.delete({
                            where: {
                                user_id: userId,
                            },
                        });
                    } catch (cleanupError) {
                        logger.error("Failed to delete email record after email failure", {
                            error: cleanupError,
                            userId,
                        });
                    }
                    try {
                        await db.users.delete({
                            where: {
                                id: userId,
                            },
                        });
                    } catch (cleanupError) {
                        logger.error("Failed to delete user after email failure", {
                            error: cleanupError,
                            userId,
                        });
                    }
                }

                throw new AppError({
                    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                    code: "AUTH_EMAIL_SEND_FAILED",
                    message: "Failed to send verification email",
                });
            }

            return {
                id: result.user.id!,
                firstName: result.user.first_name!,
                lastName: result.user.last_name!,
                username: result.user.username!,
                email: result.emailAddress.email!,
                createdAt: result.user.created_at!,
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            logger.debug("Error creating user:", { error });
            logger.error("User registration failed for email:", {
                email: input.email,
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw new AppError({
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                code: "AUTH_USER_CREATION_FAILED",
                message: "Failed to create user",
            });
        }
    }

    public async verifyEmail(input: VerifyEmailInput): Promise<AuthVerifyEmailResult> {
        try {
            const emailRecord = await attemptTokenVerification(
                input.email,
                input.verificationToken
            );

            await markEmailAsVerified(emailRecord);

            return {
                message: "Email verified successfully",
            };
        } catch (error) {
            logger.debug("Email verification failed:", { error });
            logger.error("Email verification failed for email:", {
                email: input.email,
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    public async resendVerification(
        input: ResendVerificationInput
    ): Promise<ResendVerificationResult> {
        try {
            const verificationToken = await resendVerificationCode(input.email);
            const verificationLink = buildVerificationLink(input.email, verificationToken);

            await sendVerificationEmail(input.email, verificationLink);
            return {
                message: "Verification link resent successfully",
            };
        } catch (error) {
            logger.debug("Resend verification failed:", { error });
            logger.error("Resend verification failed for email:", {
                email: input.email,
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    public async login(input: LoginInput): Promise<{ message: string; tokens: LoginTokens }> {
        try {
            const result = await checkUserExists(input.email);

            await verifyPassword(input.password, result);

            if (result.security.logged_in === true) {
                logger.debug(`Login attempt for already logged in user: ${input.email}`);
                throw new AppError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    code: "AUTH_ALREADY_LOGGED_IN",
                    message: "User is already logged in.",
                });
            }

            const loginTokens = await loginUser(result);

            // console.log("Client token generated:", loginTokens.clientToken);

            return {
                message: "Login successful",
                tokens: loginTokens,
            };
        } catch (error) {
            logger.debug("Login failed:", { error });
            logger.error("Login failed for email:", {
                email: input.email,
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    public async refreshSession(cookies: {
        [key: string]: string;
    }): Promise<{ message: string; newSessionToken: string }> {
        try {
            const clientToken: string = cookies[env.JWT_CLIENT_COOKIE_NAME];

            const isValid = await isSessionValid(clientToken);
            if (!isValid) {
                throw new AppError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    code: "AUTH_TOKEN_REFRESH_FAILED",
                    message: "Refresh token is invalid or expired",
                });
            }

            const clientDecoded = JWT.decode(clientToken) as AuthTokenPayload & { sub: string };
            const newSessionToken = JWT.refreshSession(clientDecoded.sub, {
                firstName: clientDecoded.firstName,
                lastName: clientDecoded.lastName,
                username: clientDecoded.username,
                email: clientDecoded.email,
                trackerId: clientDecoded.trackerId,
            });

            return {
                message: "Session refreshed",
                newSessionToken,
            };
        } catch (error) {
            logger.debug("Token refresh failed:", { error });
            logger.error("Token refresh failed:", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    public verifySession(cookie: string | undefined): { valid: boolean; userId?: string } {
        if (!cookie) {
            logger.debug("Session verification failed: no token provided");
            return { valid: false };
        }

        try {
            const decoded = JWT.verifyToken(cookie);
            if (!decoded?.sub) {
                logger.debug("Session verification failed: missing sub claim");
                return { valid: false };
            }
            return { valid: true, userId: decoded.sub };
        } catch (error) {
            logger.debug("Session verification failed:", { error });
            return { valid: false };
        }
    }

    public async logout(trackerId: string): Promise<{ message: string }> {
        try {
            await revokeSessionByTrackerId(trackerId);
            return { message: "Logged out" };
        } catch (error) {
            if (error instanceof AppError && error.code === "AUTH_INVALID_TOKEN") {
                return { message: "Invalid token" };
            }
            throw error;
        }
    }

    public async logoutAll(userId: string): Promise<{ message: string }> {
        try {
            await revokeAllSessionsByUserId(userId);

            return { message: "Logged out from all sessions" };
        } catch (error) {
            if (error instanceof AppError && error.code === "AUTH_INVALID_TOKEN") {
                return { message: "Invalid token" };
            }
            throw error;
        }
    }

    public async requestPasswordReset(
        input: ResetPasswordRequestInput
    ): Promise<PasswordResetLinkResult> {
        try {
            const resetUrl = await createPasswordResetLink(input.email);

            await sendPasswordResetEmail(input.email, resetUrl);

            return {
                message: "Password reset link sent",
            };
        } catch (error) {
            logger.debug("Password reset request failed:", { error });
            logger.error("Password reset request failed for email:", {
                email: input.email,
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    public async verifyPasswordReset(
        input: ResetPasswordVerifyInput
    ): Promise<PasswordResetVerifyResult> {
        try {
            await verifyPasswordResetToken(input.email, input.resetToken);

            return {
                message: "Password reset link is valid",
            };
        } catch (error) {
            logger.debug("Password reset verification failed:", { error });
            logger.error("Password reset verification failed for email:", {
                email: input.email,
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    public async changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
        try {
            await updatePasswordWithResetToken(input.email, input.resetToken, input.newPassword);

            return {
                message: "Password updated successfully",
            };
        } catch (error) {
            logger.debug("Password change failed:", { error });
            logger.error("Password change failed for email:", {
                email: input.email,
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    public async getMe(userId: string, currentTrackerId: string): Promise<MeResult> {
        try {
            return await getMe(userId, currentTrackerId);
        } catch (error) {
            logger.debug("Failed to fetch user profile:", { error });
            logger.error("Failed to fetch user profile:", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    public async updateProfile(
        userId: string,
        input: UpdateProfileInput
    ): Promise<UpdateProfileResult> {
        try {
            return await updateProfile(userId, input);
        } catch (error) {
            logger.debug("Failed to update user profile:", { error });
            logger.error("Failed to update user profile:", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    public async deleteAccount(cookies: { [key: string]: string }): Promise<{ message: string }> {
        try {
            const clientToken: string | undefined = cookies[env.JWT_CLIENT_COOKIE_NAME];

            if (!clientToken) {
                throw new AppError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    code: "AUTH_TOKEN_MISSING",
                    message: "No active session",
                });
            }

            const decoded = JWT.verifyToken(clientToken);
            const userId = decoded?.sub;

            if (!userId) {
                throw new AppError({
                    statusCode: StatusCodes.UNAUTHORIZED,
                    code: "AUTH_INVALID_TOKEN",
                    message: "Invalid or expired token",
                });
            }

            await deleteAccount(userId);

            return { message: "Account deleted successfully" };
        } catch (error) {
            logger.debug("Failed to delete account:", { error });
            logger.error("Failed to delete account:", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }

    /**
     * Resolves userId + email from the session cookie. Shared by the three
     * methods below so we don't repeat the decode-and-validate boilerplate.
     */
    private async resolveAuthenticatedUser(cookies: {
        [key: string]: string;
    }): Promise<{ userId: string; email: string }> {
        const clientToken: string | undefined = cookies[env.JWT_CLIENT_COOKIE_NAME];

        if (!clientToken) {
            throw new AppError({
                statusCode: StatusCodes.UNAUTHORIZED,
                code: "AUTH_TOKEN_MISSING",
                message: "No active session",
            });
        }

        const decoded = JWT.verifyToken(clientToken) as AuthTokenPayload & { sub: string };
        const userId = decoded?.sub;

        if (!userId) {
            throw new AppError({
                statusCode: StatusCodes.UNAUTHORIZED,
                code: "AUTH_INVALID_TOKEN",
                message: "Invalid or expired token",
            });
        }

        return { userId, email: decoded.email };
    }

    public async requestAccountDeletion(
        userId: string,
        email: string
    ): Promise<{ message: string }> {
        try {
            const confirmUrl = await createAccountDeletionLink(userId);
            await sendAccountDeletionEmail(email, confirmUrl);

            return { message: "Account deletion confirmation email sent" };
        } catch (error) {
            logger.error("Failed to request account deletion:", { error });
            throw error;
        }
    }

    public async confirmAccountDeletion(
        userId: string,
        token: string
    ): Promise<{ message: string }> {
        try {
            await confirmAccountDeletion(userId, token);
            return { message: "Account deleted successfully" };
        } catch (error) {
            logger.error("Failed to confirm account deletion:", { error });
            throw error;
        }
    }

    public async revokeSession(
        userId: string, // <-- Takes userId directly now
        sessionId: string
    ): Promise<{ message: string }> {
        try {
            // No need to resolve cookies anymore!
            await revokeSessionById(userId, sessionId);

            return { message: "Session revoked" };
        } catch (error) {
            logger.debug("Failed to revoke session:", { error });
            logger.error("Failed to revoke session:", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    }
}

const authService = new AuthService();

export { authService };
