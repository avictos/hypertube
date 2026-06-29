import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { env } from "../../config/env";
import { AuthCookie } from "../../lib/cookie";
import { buildAuthorizeUrl, handleCallback, isValidProvider } from "./oauth-providers.service";

const toSingle = (value: string | string[]): string => (Array.isArray(value) ? value[0] : value);

const loginPageWithError = (res: Response, code: string) => {
    res.redirect(
        StatusCodes.MOVED_TEMPORARILY,
        `${env.APP_DOMAIN}/login?error=${encodeURIComponent(code)}`
    );
};

const oauthProvidersController = {
    redirectToProvider: async (req: Request, res: Response): Promise<void> => {
        const provider = toSingle(req.params.provider);

        if (!isValidProvider(provider)) {
            res.status(StatusCodes.BAD_REQUEST).json({
                status: "error",
                code: "OAUTH_UNKNOWN_PROVIDER",
                message: "Unknown sign-in provider",
            });
            return;
        }

        try {
            const url = await buildAuthorizeUrl(provider);
            res.redirect(StatusCodes.MOVED_TEMPORARILY, url);
        } catch {
            loginPageWithError(res, "oauth_unavailable");
        }
    },

    callback: async (req: Request, res: Response): Promise<void> => {
        const provider = toSingle(req.params.provider);
        const { code, state } = req.query as { code?: string; state?: string };

        if (!isValidProvider(provider) || !code || !state) {
            loginPageWithError(res, "oauth_failed");
            return;
        }

        try {
            const tokens = await handleCallback(provider, code, state);
            AuthCookie.setAuthCookies(res, tokens);
            res.redirect(StatusCodes.MOVED_TEMPORARILY, env.APP_DOMAIN);
        } catch {
            loginPageWithError(res, "oauth_failed");
        }
    },
};

export { oauthProvidersController };
