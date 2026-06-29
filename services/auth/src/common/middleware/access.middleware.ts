import type { RequestHandler } from "express";
import { StatusCodes } from "http-status-codes";
import { env } from "../../config/env";

const accessMiddleware: RequestHandler = (req, _res, next) => {
    const askHeader = req.headers["x-auth-secret-key"] || req.headers["X-Auth-Secret-Key"];

    if (!askHeader) {
        _res.status(StatusCodes.BAD_REQUEST).json({
            status: "error",
            code: "MISSING_AUTH_HEADER",
            message: "Missing required authentication header",
        });
        return;
    }

    if (askHeader !== env.AUTH_SECRET_KEY) {
        _res.status(StatusCodes.UNAUTHORIZED).json({
            status: "error",
            code: "INVALID_AUTH_HEADER",
            message: "Invalid authentication header",
        });
        return;
    }

    next();
};

export { accessMiddleware };
