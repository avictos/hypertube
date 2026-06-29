import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";

import { AppError } from "../../common/errors/app-error";
import { DB_Error } from "../../lib/db/orm/operations/db-error";
import { listUsers, getPublicProfile, updatePublicProfile } from "./users.service";
import { UpdateUserInput } from "./users.validation";

const handleError = (
    error: unknown,
    res: Response,
    fallbackCode: string,
    fallbackMessage: string
) => {
    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            status: "error",
            code: error.code,
            message: error.message,
        });
    } else if (error instanceof DB_Error) {
        res.status(error.statusCode).json({
            status: "error",
            code: fallbackCode,
            message: error.message,
            details: error.details,
        });
    } else {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            status: "error",
            code: fallbackCode,
            message: fallbackMessage,
        });
    }
};

const usersController = {
    list: async (_req: Request, res: Response): Promise<void> => {
        try {
            const users = await listUsers();
            res.status(StatusCodes.OK).json({ status: "success", users });
        } catch (error) {
            handleError(error, res, "USERS_LIST_FAILED", "Failed to list users");
        }
    },

    getById: async (req: Request, res: Response): Promise<void> => {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        try {
            const profile = await getPublicProfile(id, req.auth!.userId);
            res.status(StatusCodes.OK).json({ status: "success", user: profile });
        } catch (error) {
            handleError(error, res, "USER_FETCH_FAILED", "Failed to fetch user profile");
        }
    },

    updateById: async (req: Request, res: Response): Promise<void> => {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        if (req.auth!.userId !== id) {
            res.status(StatusCodes.FORBIDDEN).json({
                status: "error",
                code: "USER_FORBIDDEN",
                message: "You can only update your own profile",
            });
            return;
        }

        try {
            const payload = req.body as UpdateUserInput;
            const profile = await updatePublicProfile(id, payload);
            res.status(StatusCodes.OK).json({ status: "success", user: profile });
        } catch (error) {
            handleError(error, res, "USER_UPDATE_FAILED", "Failed to update user profile");
        }
    },
};

export { usersController };
