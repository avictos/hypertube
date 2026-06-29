import { logger } from "../../config/logger";
import type { ErrorRequestHandler } from "express";
import { AppError } from "../errors/app-error";

const errorHandlerMiddleware: ErrorRequestHandler = (error, req, res, next) => {
    void next;
    const requestId = req.requestId ?? "n/a";

    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
                requestId,
            },
        });
        return;
    }

    logger.error("Unhandled exception", {
        requestId,
        message: error instanceof Error ? error.message : "Unknown error",
    });

    res.status(500).json({
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred",
            requestId,
        },
    });
};

export { errorHandlerMiddleware };
