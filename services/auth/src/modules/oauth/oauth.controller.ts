import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";

import { issueToken } from "./oauth.service";
import { AppError } from "../../common/errors/app-error";
import { OAuthTokenInput } from "./oauth.validation";

const oauthController = {
    issueToken: async (req: Request, res: Response): Promise<void> => {
        const payload = req.body as OAuthTokenInput;
        try {
            const result = await issueToken(payload);
            res.status(StatusCodes.OK).json({
                access_token: result.accessToken,
                token_type: result.tokenType,
                expires_in: result.expiresIn,
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
                    code: "OAUTH_TOKEN_ISSUE_FAILED",
                    message: "An unexpected error occurred while issuing the token",
                });
            }
        }
    },
};

export { oauthController };
