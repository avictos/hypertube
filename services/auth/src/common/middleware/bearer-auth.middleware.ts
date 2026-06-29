import type { RequestHandler } from "express";
import { StatusCodes } from "http-status-codes";

import { JWT } from "../../lib/jwt";

const bearerAuthMiddleware: RequestHandler = (req, res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        res.status(StatusCodes.UNAUTHORIZED).json({
            status: "error",
            code: "AUTH_MISSING_BEARER_TOKEN",
            message: "Missing or malformed Authorization header",
        });
        return;
    }

    const token = header.slice("Bearer ".length).trim();

    try {
        const decoded = JWT.verifyToken(token);
        const userId = decoded?.sub;

        if (!userId) {
            res.status(StatusCodes.UNAUTHORIZED).json({
                status: "error",
                code: "AUTH_INVALID_TOKEN",
                message: "Invalid or expired token",
            });
            return;
        }

        req.auth = {
            userId,
            email: typeof decoded?.email === "string" ? decoded.email : "",
        };
        next();
    } catch {
        res.status(StatusCodes.UNAUTHORIZED).json({
            status: "error",
            code: "AUTH_INVALID_TOKEN",
            message: "Invalid or expired token",
        });
    }
};

export { bearerAuthMiddleware };
