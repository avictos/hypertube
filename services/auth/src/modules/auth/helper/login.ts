import { StatusCodes } from "http-status-codes";

import { AuthTokens, JWT } from "../../../lib/jwt";
import { _argon2 } from "../../../lib/argon2";
import { db } from "../../../lib/db/orm/client";
import { AppError } from "../../../common/errors/app-error";
import { AuthTokenPayload } from "../auth.types";
import { redis } from "../../../lib/redis/client";
import { ONE_WEEK_IN_SECONDS } from "../../../lib/utils/times";
import { Session } from "../../../lib/db/orm/db-types";

type UserDetails = {
    id: string;
    email: string;
    is_verified: boolean;
    user: {
        id: string;
        first_name: string;
        last_name: string;
        username: string;
    };
    security: {
        id: string;
        password_hash: string;
        logged_in: boolean;
    };
};

/**
 * Checks if a user with the given email exists and is verified. If the user does not exist or is not verified, an AppError is thrown.
 * @param email The email address to check for existence and verification status
 * @returns A promise that resolves to the user record if it exists and is verified
 * @throws {AppError} If the user does not exist or is not verified, an AppError with appropriate status code and message is thrown
 */
const checkUserExists = async (email: string): Promise<UserDetails> => {
    const result = await db.emailAddresses.findUnique({
        where: { email },
        select: ["id", "email", "is_verified"],
        include: {
            user: {
                select: ["id", "first_name", "last_name", "username"],
            },
            security: {
                select: ["id", "password_hash", "logged_in"],
            },
        },
    });

    if (!result) {
        throw new AppError({
            statusCode: StatusCodes.UNAUTHORIZED,
            code: "AUTH_INVALID_CREDENTIALS",
            message: "Account with the provided email does not exist",
        });
    }

    if (!result.is_verified) {
        throw new AppError({
            statusCode: StatusCodes.UNAUTHORIZED,
            code: "AUTH_EMAIL_NOT_VERIFIED",
            message: "Account is not verified",
        });
    }

    // Removed the [0] arrays!
    const user = result.user;
    const security = result.security;

    if (!user || !security) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "AUTH_USER_DATA_INCOMPLETE",
            message: "Account data is incomplete",
        });
    }

    return {
        id: result.id!,
        email: result.email!,
        is_verified: result.is_verified!,
        user,
        security,
    } as UserDetails;
};

/**
 * Verifies the provided plaintext password against the stored password hash.
 * @param password The plaintext password to verify
 * @param result The user record containing the stored password hash to compare against
 * @returns A promise that resolves to true if the password is correct, or throws an AppError if the password is incorrect
 * @throws {AppError} If the password is incorrect, an AppError with status code 401 is thrown
 */
const verifyPassword = async (password: string, result: UserDetails): Promise<boolean> => {
    const passwordMatches = await _argon2.verify(result.security.password_hash, password);

    if (!passwordMatches) {
        throw new AppError({
            statusCode: StatusCodes.UNAUTHORIZED,
            code: "AUTH_INVALID_CREDENTIALS",
            message: "Invalid email or password",
        });
    }
    return true;
};

const getSessionsCount = async (userId: string): Promise<number> => {
    const cachedSessionsCount = await redis.get(`auth:sessions:${userId}:count`);
    if (cachedSessionsCount) {
        return parseInt(cachedSessionsCount);
    }
    const sessionsCount = await db.sessions.count({
        options: {
            where: {
                user_id: userId,
            },
        },
    });
    return sessionsCount;
};

type SessionInfo = {
    sessionId: string;
    expiresAt: Date;
};

const getSessionExpiry = async (userId: string): Promise<SessionInfo | null> => {
    const cachedExpiry = await redis.get(`auth:sessions:${userId}:oldest_expiry`);
    if (cachedExpiry) {
        const [sessionId, expiresAt] = cachedExpiry.split(":");
        return { sessionId, expiresAt: new Date(expiresAt) };
    }
    const session = await db.sessions.findFirst({
        where: {
            user_id: userId,
        },
        orderBy: {
            expires_at: "ASC",
        },
        select: ["id", "expires_at"],
    });
    if (session && session.expires_at > new Date()) {
        await cacheUserSessionExpiry(session.id!, userId, session.expires_at);
    }
    return session ? { sessionId: session.id, expiresAt: session.expires_at } : null;
};

const cacheUserSessionsCount = async (userId: string): Promise<void> => {
    await redis.incr(`auth:sessions:${userId}:count`);
    await redis.expire(`auth:sessions:${userId}:count`, ONE_WEEK_IN_SECONDS);
};

const cacheUserSessionExpiry = async (
    sessionId: string,
    userId: string,
    expiresAt: Date
): Promise<void> => {
    const ttlSeconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    await redis.set(
        `auth:sessions:${userId}:oldest_expiry`,
        `${sessionId}:${expiresAt.toISOString()}`,
        {
            EX: ttlSeconds,
        }
    );
};

const createSession = async (
    userId: string,
    trackerId: string,
    clientToken: string,
    expiresAt: Date
): Promise<Partial<Session>> => {
    return await db.sessions.create({
        data: {
            user_id: userId,
            tracker_id: trackerId,
            session_token: await _argon2.hash(clientToken),
            expires_at: expiresAt,
        },
        select: ["id"],
    });
};

const deleteSession = async (userId: string, sessionId: string): Promise<void> => {
    await redis.del(`auth:sessions:${userId}:oldest_expiry`);
    await redis.decr(`auth:sessions:${userId}:count`);
    await db.sessions.delete({
        where: {
            id: sessionId,
        },
    });
};

export type LoginTokens = {
    sessionToken: string;
    clientToken: string;
};

/**
 * Logs in the user by generating JWT tokens and creating a session record in the database.
 * @param user The authenticated user for whom to generate tokens and create a session
 * @returns A promise that resolves to a LoginResult containing the public user data and generated tokens
 * @throws If token generation fails or if there is an error creating the session record, an AppError with status code 500 is thrown
 */
const loginUser = async (result: UserDetails): Promise<LoginTokens> => {
    const payload: AuthTokenPayload = {
        firstName: result.user.first_name,
        lastName: result.user.last_name,
        username: result.user.username,
        email: result.email,
        trackerId: crypto.randomUUID(),
    };

    // Check if the user already has MAX active sessions.
    const sessionsCount = await getSessionsCount(result.user.id);
    const oldestSession = await getSessionExpiry(result.user.id);
    const oldestSessionExpired = oldestSession
        ? oldestSession.expiresAt.getTime() <= Date.now()
        : false;

    // If Max sessions reached, and oldest session is expired, create a new session.
    if (sessionsCount >= 5) {
        if (oldestSession && oldestSessionExpired) {
            await deleteSession(result.user.id, oldestSession.sessionId);
        } else {
            throw new AppError({
                statusCode: StatusCodes.TOO_MANY_REQUESTS,
                code: "AUTH_TOO_MANY_SESSIONS",
                message: "Too many active sessions.",
            });
        }
    }

    const tokens: AuthTokens = await JWT.generateTokens(result.user.id, payload);
    const expiresAt: Date = new Date(Date.now() + JWT.getClientTokenExpiryMs());

    const session = await createSession(
        result.user.id,
        payload.trackerId,
        tokens.clientToken,
        expiresAt
    );

    // We cache the sessions count and expiry for faster access in other parts.
    await cacheUserSessionsCount(result.user.id);
    if (!oldestSessionExpired) {
        await cacheUserSessionExpiry(session.id!, result.user.id, expiresAt);
    }

    return {
        sessionToken: tokens.sessionToken,
        clientToken: tokens.clientToken,
    };
};

export type { UserDetails };
export { checkUserExists, verifyPassword, loginUser };
