import { logger } from "../../../config/logger";
import { db } from "../../../lib/db/orm/client";
import { JWT } from "../../../lib/jwt";

export const isSessionValid = async (token: string): Promise<boolean> => {
    const decoded = JWT.verifyToken(token);
    const userId = decoded?.sub;
    const trackerId = (decoded as { trackerId?: string } | null)?.trackerId;

    if (!userId || !trackerId) {
        logger.debug("Token missing userId or trackerId");
        return false;
    }

    const session = await db.sessions.findFirst({
        where: { user_id: userId, tracker_id: trackerId },
        select: ["expires_at"],
    });

    if (!session) return false;
    if (session.expires_at.getTime() <= Date.now()) return false;

    return true;
};
