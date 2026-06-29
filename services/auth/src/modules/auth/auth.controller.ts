import { StatusCodes } from "http-status-codes";

import { authService } from "./auth.service";
import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error";
import {
    ChangePasswordInput,
    jwksJSONInput,
    LoginInput,
    RegisterInput,
    ResetPasswordRequestInput,
    ResetPasswordVerifyInput,
    VerifyEmailInput,
} from "./auth.validation";
import { DB_Error } from "../../lib/db/orm/operations/db-error";
import { AuthCookie } from "../../lib/cookie";
import { env } from "../../config/env";
import { UpdateProfileInput } from "./helper/me";

const authController = {
    jwksJSON: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as jwksJSONInput;
        try {
            const result = await authService.jwksJSON(payload);
            res.status(StatusCodes.OK).json({
                status: "success",
                publicKey: result,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "PUBLIC_KEY_RETRIEVAL_FAILED",
                    message: "An unexpected error occurred during retrieval.",
                });
            }
        }
    },

    register: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as RegisterInput;
        try {
            const result = await authService.register(payload);
            res.status(StatusCodes.CREATED).json({
                status: "success",
                ...result,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_REGISTRATION_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_REGISTRATION_FAILED",
                    message: "An unexpected error occurred during registration",
                });
            }
        }
    },

    verifyEmail: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as VerifyEmailInput;
        try {
            const result = await authService.verifyEmail(payload);
            res.status(StatusCodes.OK).json({
                status: "success",
                ...result,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_EMAIL_VERIFICATION_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_EMAIL_VERIFICATION_FAILED",
                    message: "An unexpected error occurred during email verification",
                });
            }
        }
    },

    resendVerification: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as VerifyEmailInput;
        try {
            const result = await authService.resendVerification(payload);
            res.status(StatusCodes.OK).json({
                status: "success",
                ...result,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_RESEND_VERIFICATION_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_RESEND_VERIFICATION_FAILED",
                    message: "An unexpected error occurred while resending verification email",
                });
            }
        }
    },

    login: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as LoginInput;
        try {
            const result = await authService.login(payload);
            AuthCookie.setAuthCookies(res, result.tokens);
            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
            });
        } catch (error) {
            if (error instanceof AppError) {
                // Handle already logged in case
                if (error.code === "AUTH_ALREADY_LOGGED_IN") {
                    return void res.redirect(StatusCodes.SEE_OTHER, "/");
                }
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_LOGIN_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_LOGIN_FAILED",
                    message: "An unexpected error occurred during login",
                });
            }
        }
    },

    refreshSession: async (req: Request, res: Response): Promise<void> => {
        try {
            const result = await authService.refreshSession(req.cookies);
            AuthCookie.setSessionCookie(res, result.newSessionToken);

            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
                __session: result.newSessionToken,
            });
        } catch (error) {
            if (error instanceof AppError) {
                AuthCookie.clearAuthCookies(res);

                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_TOKEN_REFRESH_FAILED",
                    message: "An unexpected error occurred during token refresh",
                });
            }
        }
    },

    verifySession: (req: Request, res: Response): void => {
        try {
            const result = authService.verifySession(req.cookies[env.JWT_SESSION_COOKIE_NAME]);
            if (result.valid) {
                res.status(StatusCodes.OK).json({
                    status: "success",
                    userId: result.userId,
                });
            } else {
                res.status(StatusCodes.UNAUTHORIZED).json({
                    status: "error",
                    code: "AUTH_INVALID_SESSION",
                    message: "Invalid or expired session",
                });
            }
        } catch {
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                status: "error",
                code: "AUTH_SESSION_VERIFICATION_FAILED",
                message: "An unexpected error occurred during session verification",
            });
        }
    },

    logout: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as { trackerId: string };
        try {
            if (!payload.trackerId) {
                res.status(StatusCodes.BAD_REQUEST).json({
                    status: "error",
                    code: "AUTH_LOGOUT_FAILED",
                    message: "Session tracker is required to log out",
                });
                return;
            }

            const result = await authService.logout(payload.trackerId);

            AuthCookie.clearAuthCookies(res);

            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_LOGOUT_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_LOGOUT_FAILED",
                    message: "An unexpected error occurred during logout",
                });
            }
        }
    },

    logoutAll: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as { userId: string };
        try {
            if (!payload.userId) {
                res.status(StatusCodes.BAD_REQUEST).json({
                    status: "error",
                    code: "AUTH_LOGOUT_ALL_FAILED",
                    message: "User ID is required to log out from all sessions",
                });
                return;
            }

            const result = await authService.logoutAll(payload.userId);

            AuthCookie.clearAuthCookies(res);

            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_LOGOUT_ALL_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_LOGOUT_ALL_FAILED",
                    message: "An unexpected error occurred during logout all",
                });
            }
        }
    },

    requestPasswordReset: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as ResetPasswordRequestInput;
        try {
            const result = await authService.requestPasswordReset(payload);
            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_PASSWORD_RESET_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_PASSWORD_RESET_FAILED",
                    message: "An unexpected error occurred during password reset",
                });
            }
        }
    },

    verifyPasswordReset: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as ResetPasswordVerifyInput;
        try {
            const result = await authService.verifyPasswordReset(payload);
            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_PASSWORD_RESET_VERIFY_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_PASSWORD_RESET_VERIFY_FAILED",
                    message: "An unexpected error occurred during password reset verification",
                });
            }
        }
    },

    changePassword: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as ChangePasswordInput;
        try {
            const result = await authService.changePassword(payload);
            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_PASSWORD_CHANGE_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_PASSWORD_CHANGE_FAILED",
                    message: "An unexpected error occurred during password change",
                });
            }
        }
    },

    getMe: async (req: Request, res: Response): Promise<void> => {
        try {
            const { userId } = req.params;
            const resolvedUserId = Array.isArray(userId) ? userId[0] : userId;
            const currentTrackerId = req.query.trackerId as string;

            if (!currentTrackerId) {
                res.status(StatusCodes.BAD_REQUEST).json({
                    status: "error",
                    code: "AUTH_MISSING_TRACKER_ID",
                    message: "Tracker ID is required to identify the current session",
                });
                return;
            }

            const result = await authService.getMe(resolvedUserId, currentTrackerId);

            res.status(StatusCodes.OK).json({
                status: "success",
                user: result,
            });
        } catch (error) {
            if (error instanceof AppError) {
                // THE FIX: Intercept the specific errors and clear cookies
                if (error.code === "AUTH_SESSION_REVOKED" || error.code === "AUTH_USER_NOT_FOUND") {
                    AuthCookie.clearAuthCookies(res);
                }

                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_PROFILE_FETCH_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_PROFILE_FETCH_FAILED",
                    message: "An unexpected error occurred while fetching the profile",
                });
            }
        }
    },

    updateMe: async (req: Request, res: Response): Promise<void> => {
        // Destructure userId from the rest of the payload
        const { userId, ...payload } = req.body as UpdateProfileInput & { userId: string };

        try {
            // No cookies needed! Just pass the trusted userId.
            const result = await authService.updateProfile(userId, payload);
            res.status(StatusCodes.OK).json({
                status: "success",
                user: result,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_PROFILE_UPDATE_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_PROFILE_UPDATE_FAILED",
                    message: "An unexpected error occurred while updating the profile",
                });
            }
        }
    },

    deleteMe: async (req: Request, res: Response): Promise<void> => {
        try {
            const result = await authService.deleteAccount(req.cookies);
            AuthCookie.clearAuthCookies(res);
            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_ACCOUNT_DELETION_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_ACCOUNT_DELETION_FAILED",
                    message: "An unexpected error occurred while deleting the account",
                });
            }
        }
    },

    requestDeleteMe: async (req: Request, res: Response): Promise<void> => {
        const { userId, email } = req.body;
        try {
            // Pass trusted data directly
            const result = await authService.requestAccountDeletion(userId, email);
            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_ACCOUNT_DELETE_REQUEST_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_ACCOUNT_DELETE_REQUEST_FAILED",
                    message: "An unexpected error occurred while requesting account deletion",
                });
            }
        }
    },

    confirmDeleteMe: async (req: Request, res: Response): Promise<void> => {
        const { userId, token } = req.body;
        try {
            // Pass trusted data directly
            const result = await authService.confirmAccountDeletion(userId, token);

            // Server wipes the cookies, Next.js will forward this to the browser
            AuthCookie.clearAuthCookies(res);

            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_ACCOUNT_DELETION_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_ACCOUNT_DELETION_FAILED",
                    message: "An unexpected error occurred while deleting the account",
                });
            }
        }
    },

    revokeSession: async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params;
        const sessionId = Array.isArray(id) ? id[0] : id;

        // Extract the trusted userId from the query string
        const userId = req.query.userId as string;

        if (!userId) {
            res.status(StatusCodes.BAD_REQUEST).json({
                status: "error",
                code: "AUTH_MISSING_USER_ID",
                message: "User ID is required to revoke a session",
            });
            return;
        }

        try {
            // Pass userId directly! No cookies!
            const result = await authService.revokeSession(userId, sessionId);

            res.status(StatusCodes.OK).json({
                status: "success",
                message: result.message,
            });
        } catch (error) {
            if (error instanceof AppError) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: error.code,
                    message: error.message,
                });
            } else if (error instanceof DB_Error) {
                res.status(error.statusCode).json({
                    status: "error",
                    code: "AUTH_SESSION_REVOKE_FAILED",
                    message: error.message,
                    details: error.details,
                });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status: "error",
                    code: "AUTH_SESSION_REVOKE_FAILED",
                    message: "An unexpected error occurred while revoking the session",
                });
            }
        }
    },
};

export { authController };
