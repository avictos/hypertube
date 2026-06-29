import { StatusCodes } from "http-status-codes";

import { AppError } from "../../../common/errors/app-error";
import { db } from "../../../lib/db/orm/client";
import { redis } from "../../../lib/redis/client";

/**
 * Revokes a single session by its ID, but only if it belongs to `userId`.
 * Used for the "log out this device" action in the sessions list — distinct
 * from revokeSessionByTrackerId (logout.ts), which only ever knows about the
 * session tied to the *current* request's token.
 */
export const revokeSessionById = async (userId: string, sessionId: string): Promise<void> => {
    const session = await db.sessions.findUnique({
        where: { id: sessionId },
        select: ["id", "user_id", "session_token"],
    });

    if (!session || session.user_id !== userId) {
        throw new AppError({
            statusCode: StatusCodes.NOT_FOUND,
            code: "AUTH_SESSION_NOT_FOUND",
            message: "Session not found",
        });
    }

    await db.sessions.delete({
        where: { id: sessionId },
    });

    // We don't have the raw (unhashed) client token here — only its hash is
    // stored on the session row — so we can't remove the exact cache entry by
    // re-hashing a plaintext token like removeSessionTokenFromCache expects.
    // Falling back to invalidating the per-user count/expiry caches is safe:
    // worst case a stale isSessionTokenCached() hit lets one more request
    // through before the DB lookup in isSessionValid() catches the deleted row.
    await redis.del(`auth:sessions:${userId}:oldest_expiry`);
    await redis.decr(`auth:sessions:${userId}:count`);
};
