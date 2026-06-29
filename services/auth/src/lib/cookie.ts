import { Response } from "express";

import { env } from "../config/env";
import { logger } from "../config/logger";
import { LoginTokens } from "../modules/auth/helper/login";

export class AuthCookie {
    private static isProduction: boolean = this.setIsProduction();

    private static setIsProduction(): boolean {
        const isProd = env.NODE_ENV === "production";
        if (!isProd) logger.warn("Using non-production cookie settings");
        return isProd;
    }

    /**
     * Attaches the freshly generated tokens to the HTTP Response.
     */
    public static setAuthCookies(res: Response, tokens: LoginTokens): void {
        const isProd = this.isProduction;
        const appDomain = isProd ? new URL(env.APP_DOMAIN).hostname : undefined;
        const authDomain = isProd ? new URL(env.AUTH_DOMAIN).hostname : undefined;

        // It needs to be sent with every normal API request, so path is "/"
        res.cookie(env.JWT_SESSION_COOKIE_NAME, tokens.sessionToken, {
            httpOnly: false, // For DX purposes, allow frontend access to the access token.
            secure: this.isProduction,
            sameSite: isProd ? "none" : "lax", // Allow access token to be sent with CORS requests (e.g., from frontend on different origin)
            maxAge: env.JWT_SESSION_EXPIRATION_SECONDS * 1_000,
            path: env.SESSION_TOKEN_PATH || "/",
            domain: appDomain,
        });

        // It should ONLY ever be sent when hitting the refresh endpoint
        res.cookie(env.JWT_CLIENT_COOKIE_NAME, tokens.clientToken, {
            httpOnly: true,
            secure: this.isProduction,
            sameSite: isProd ? "none" : "lax", // Ensure refresh token is NOT sent with CORS requests
            maxAge: env.JWT_CLIENT_EXPIRATION_SECONDS * 1_000,
            path: env.CLIENT_TOKEN_PATH || "/",
            domain: authDomain,
        });
    }

    /**
     * Sets the session cookie
     */
    public static setSessionCookie(res: Response, token: string): void {
        const isProd = this.isProduction;
        const appDomain = isProd ? new URL(env.APP_DOMAIN).hostname : undefined;

        //! If error happens with cookie in testing delete the old one from cache and retry.
        //! as res.cookie(...) replaces the old one with a new one, but options httpOnly, path, and domain
        //! must strictly match the old one.
        res.cookie(env.JWT_SESSION_COOKIE_NAME, token, {
            httpOnly: false,
            secure: this.isProduction,
            sameSite: isProd ? "none" : "lax",
            maxAge: env.JWT_SESSION_EXPIRATION_SECONDS * 1_000,
            path: env.SESSION_TOKEN_PATH || "/",
            domain: appDomain,
        });
    }

    /**
     * Destroys the cookies when the user logs out.
     */
    public static clearAuthCookies(res: Response): void {
        res.clearCookie(env.JWT_SESSION_COOKIE_NAME, { path: env.SESSION_TOKEN_PATH || "/" });
        res.clearCookie(env.JWT_CLIENT_COOKIE_NAME, {
            path: env.CLIENT_TOKEN_PATH || "http://localhost:3333/api/v1/auth/refresh",
        });
    }
}
