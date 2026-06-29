import { StatusCodes } from "http-status-codes";
import { AppError } from "../../../common/errors/app-error";
import { env } from "../../../config/env";
import { redis } from "../../../lib/redis/client";

export const getPublicKey = async (): Promise<string> => {
    const key = await redis.get(env.JWT_CLIENT_ACCESS_TO_PUBLIC_KEY_NAME);

    if (!key) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "PUBLIC_KEY_RETRIEVAL_NF",
            message: "An unexpected error happened.",
        });
    }

    return key;
};
