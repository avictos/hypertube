import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error";

const notFoundMiddleware: RequestHandler = (req, _res, next) => {
    next(
        new AppError({
            statusCode: 404,
            code: "NOT_FOUND",
            message: `Route not found: ${req.method} ${req.originalUrl}`,
        })
    );
};

export { notFoundMiddleware };
