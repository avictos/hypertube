import type { RequestHandler } from "express";
import { z, type ZodType } from "zod";
import { AppError } from "../errors/app-error";

const validateBody = <TBody>(schema: ZodType<TBody>): RequestHandler => {
    return (req, _res, next) => {
        if (req.body === undefined) {
            next(
                new AppError({
                    statusCode: 400,
                    code: "VALIDATION_ERROR",
                    message: "Request body validation failed",
                    details: {
                        errors: [
                            "Request body is missing. Send a JSON object and set Content-Type to application/json.",
                        ],
                    },
                })
            );
            return;
        }

        const parsed = schema.safeParse(req.body);

        if (!parsed.success) {
            next(
                new AppError({
                    statusCode: 400,
                    code: "AUTH_VALIDATION_ERROR",
                    message: "Invalid request body",
                    details: z.treeifyError(parsed.error),
                })
            );
            return;
        }

        req.body = parsed.data;
        next();
    };
};

export { validateBody };
