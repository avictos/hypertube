import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/errors/app-error";
import { db } from "../../lib/db/orm/client";
import { _argon2 } from "../../lib/argon2";
import { CreateClientInput } from "./clients.validation";

const randomToken = (): string => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

export type ClientSummary = {
    id: string;
    name: string;
    clientId: string;
    createdAt: Date;
    lastUsedAt: Date | null;
};

export type CreatedClient = ClientSummary & {
    /** Only ever returned once, at creation time — never stored or retrievable again. */
    clientSecret: string;
};

export const createClient = async (
    userId: string,
    input: CreateClientInput
): Promise<CreatedClient> => {
    const clientId = `client_${randomToken()}`;
    const clientSecret = randomToken();
    const clientSecretHash = await _argon2.hash(clientSecret);

    const created = (await db.oauthClients.create({
        data: {
            user_id: userId,
            name: input.name,
            client_id: clientId,
            client_secret_hash: clientSecretHash,
            last_used_at: null,
        },
        select: ["id", "name", "client_id", "created_at", "last_used_at"],
    })) as {
        id: string;
        name: string;
        client_id: string;
        created_at: Date;
        last_used_at: Date | null;
    } | null;

    if (!created) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "CLIENT_CREATE_FAILED",
            message: "Failed to create API client",
        });
    }

    return {
        id: created.id!,
        name: created.name!,
        clientId: created.client_id!,
        createdAt: created.created_at!,
        lastUsedAt: created.last_used_at ?? null,
        clientSecret,
    };
};

export const listClients = async (userId: string): Promise<ClientSummary[]> => {
    const rows = (await db.oauthClients.findMany({
        where: { user_id: userId },
        select: ["id", "name", "client_id", "created_at", "last_used_at"],
        orderBy: { created_at: "DESC" },
    })) as any[];

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        clientId: row.client_id,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at ?? null,
    }));
};

export const deleteClient = async (userId: string, clientId: string): Promise<void> => {
    const existing = (await db.oauthClients.findUnique({
        where: { id: clientId },
        select: ["id", "user_id"],
    })) as { id: string; user_id: string } | null;

    if (!existing) {
        throw new AppError({
            statusCode: StatusCodes.NOT_FOUND,
            code: "CLIENT_NOT_FOUND",
            message: "API client not found",
        });
    }

    if (existing.user_id !== userId) {
        throw new AppError({
            statusCode: StatusCodes.FORBIDDEN,
            code: "CLIENT_FORBIDDEN",
            message: "You can only manage your own API clients",
        });
    }

    await db.oauthClients.delete({ where: { id: clientId } });
};
