import { logger } from "../../../config/logger";
import { db } from "../../../lib/db/orm/client";
import { redis } from "../../../lib/redis/client";

export const revokeSessionByTrackerId = async (trackerId: string): Promise<boolean> => {
    // 1. Delete from Postgres (and capture the deleted row to get the user_id)
    const deletedSessions = await db.sessions.delete({
        where: {
            tracker_id: trackerId,
        },
    });

    if (deletedSessions.length > 0) {
        // 2. The user_id is required to update the Redis cache
        const userId = deletedSessions[0].user_id;

        // 3. Keep Redis in perfect sync with Postgres
        await redis.del(`auth:sessions:${userId}:oldest_expiry`);
        await redis.decr(`auth:sessions:${userId}:count`);

        return true;
    }

    logger.debug("Session not found for logout trackerId", { trackerId: trackerId });
    return false;
};

export const revokeAllSessionsByUserId = async (userId: string): Promise<number> => {
    const deletedSessions = await db.sessions.delete({
        where: {
            user_id: userId,
        },
    });

    await redis.del(`auth:sessions:${userId}:oldest_expiry`);
    await redis.del(`auth:sessions:${userId}:count`);

    return deletedSessions.length;
};
