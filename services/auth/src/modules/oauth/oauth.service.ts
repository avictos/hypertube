import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/errors/app-error";
import { db } from "../../lib/db/orm/client";
import { _argon2 } from "../../lib/argon2";
import { JWT } from "../../lib/jwt";
import { env } from "../../config/env";
import { OAuthTokenInput } from "./oauth.validation";

type ResolvedAccount = {
    userId: string;
    email: string;
    isVerified: boolean;
    passwordHash: string;
    firstName: string;
    lastName: string;
    username: string;
};

const invalidCredentialsError = () =>
    new AppError({
        statusCode: StatusCodes.UNAUTHORIZED,
        code: "OAUTH_INVALID_CREDENTIALS",
        message: "Invalid client or secret",
    });

/**
 * `client` may be either the account's email address or its username,
 * matching the loose "client" wording used by the subject's oauth/token spec.
 */
const resolveAccount = async (client: string): Promise<ResolvedAccount> => {
    if (client.includes("@")) {
        const record = (await db.emailAddresses.findUnique({
            where: { email: client.toLowerCase() },
            select: ["email", "is_verified"],
            include: {
                user: { select: ["id", "first_name", "last_name", "username"] },
                security: { select: ["password_hash"] },
            },
        })) as any;

        if (!record?.user || !record.security) {
            throw invalidCredentialsError();
        }

        return {
            userId: record.user.id,
            email: record.email,
            isVerified: record.is_verified,
            passwordHash: record.security.password_hash,
            firstName: record.user.first_name,
            lastName: record.user.last_name,
            username: record.user.username,
        };
    }

    const record = (await db.users.findUnique({
        where: { username: client.toLowerCase() },
        select: ["id", "first_name", "last_name", "username"],
        include: {
            emailAddress: { select: ["email", "is_verified"] },
            security: { select: ["password_hash"] },
        },
    })) as any;

    if (!record?.emailAddress || !record.security) {
        throw invalidCredentialsError();
    }

    return {
        userId: record.id,
        email: record.emailAddress.email,
        isVerified: record.emailAddress.is_verified,
        passwordHash: record.security.password_hash,
        firstName: record.first_name,
        lastName: record.last_name,
        username: record.username,
    };
};

/**
 * A client created via POST /clients (see clients.service.ts) — its `client_id`
 * is always prefixed this way, so we can tell the two grants apart up front
 * instead of speculatively querying both tables on every request.
 */
const CLIENT_ID_PREFIX = "client_";

/**
 * Client-credentials grant: `client` is a registered API client's `client_id`,
 * `secret` is the plaintext secret shown once at creation time. Resolves to the
 * client's owning user, since the spec's authorization rules (own profile,
 * own comments) are all expressed in terms of a user, not an abstract client.
 */
const resolveByClientCredentials = async (
    clientId: string,
    secret: string
): Promise<ResolvedAccount> => {
    const clientRecord = (await db.oauthClients.findUnique({
        where: { client_id: clientId },
        select: ["id", "user_id", "client_secret_hash"],
    })) as { id: string; user_id: string; client_secret_hash: string } | null;

    if (!clientRecord) {
        throw invalidCredentialsError();
    }

    const secretMatches = await _argon2.verify(clientRecord.client_secret_hash, secret);
    if (!secretMatches) {
        throw invalidCredentialsError();
    }

    const userRecord = (await db.users.findUnique({
        where: { id: clientRecord.user_id },
        select: ["id", "first_name", "last_name", "username"],
        include: { emailAddress: { select: ["email", "is_verified"] } },
    })) as any;

    if (!userRecord?.emailAddress) {
        throw invalidCredentialsError();
    }

    await db.oauthClients.update({
        where: { id: clientRecord.id },
        data: { last_used_at: new Date() },
        select: ["id"],
    });

    return {
        userId: userRecord.id,
        email: userRecord.emailAddress.email,
        isVerified: userRecord.emailAddress.is_verified,
        passwordHash: "",
        firstName: userRecord.first_name,
        lastName: userRecord.last_name,
        username: userRecord.username,
    };
};

export type IssuedToken = {
    accessToken: string;
    tokenType: "Bearer";
    expiresIn: number;
};

/**
 * Two grants share this endpoint:
 *  - Client credentials: `client` is a `client_*` id from POST /clients, `secret` is
 *    its one-time-shown secret.
 *  - Resource-owner password: `client` is the account's email or username, `secret`
 *    is its login password.
 * Both resolve to a real user and return a Bearer JWT signed with the same RS256
 * key/claims as the browser's session cookie, so it verifies through the existing
 * JWKS-based check on both services.
 */
export const issueToken = async ({ client, secret }: OAuthTokenInput): Promise<IssuedToken> => {
    const isClientCredentialsGrant = client.startsWith(CLIENT_ID_PREFIX);

    const account = isClientCredentialsGrant
        ? await resolveByClientCredentials(client, secret)
        : await resolveAccount(client);

    if (!account.isVerified) {
        throw new AppError({
            statusCode: StatusCodes.UNAUTHORIZED,
            code: "AUTH_EMAIL_NOT_VERIFIED",
            message: "Account is not verified",
        });
    }

    if (!isClientCredentialsGrant) {
        const passwordMatches = await _argon2.verify(account.passwordHash, secret);
        if (!passwordMatches) {
            throw invalidCredentialsError();
        }
    }

    const { sessionToken } = await JWT.generateTokens(account.userId, {
        firstName: account.firstName,
        lastName: account.lastName,
        username: account.username,
        email: account.email,
        trackerId: crypto.randomUUID(),
    });

    return {
        accessToken: sessionToken,
        tokenType: "Bearer",
        expiresIn: env.JWT_SESSION_EXPIRATION_SECONDS,
    };
};
