import { StatusCodes } from "http-status-codes";
import type { Request, Response } from "express";

import { AppError } from "../../common/errors/app-error";
import { DB_Error } from "../../lib/db/orm/operations/db-error";
import { createClient, listClients, deleteClient } from "./clients.service";
import { CreateClientInput } from "./clients.validation";

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

const clientsController = {
    create: async (req: Request, res: Response): Promise<void> => {
        try {
            const payload = req.body as CreateClientInput;
            const client = await createClient(req.auth!.userId, payload);
            res.status(StatusCodes.CREATED).json({ status: "success", client });
        } catch (error) {
            handleError(error, res, "CLIENT_CREATE_FAILED", "Failed to create API client");
        }
    },

    list: async (req: Request, res: Response): Promise<void> => {
        try {
            const clients = await listClients(req.auth!.userId);
            res.status(StatusCodes.OK).json({ status: "success", clients });
        } catch (error) {
            handleError(error, res, "CLIENT_LIST_FAILED", "Failed to list API clients");
        }
    },

    remove: async (req: Request, res: Response): Promise<void> => {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        try {
            await deleteClient(req.auth!.userId, id);
            res.status(StatusCodes.OK).json({ status: "success" });
        } catch (error) {
            handleError(error, res, "CLIENT_DELETE_FAILED", "Failed to delete API client");
        }
    },
};

export { clientsController };
