import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/errors/app-error";
import { db } from "../../lib/db/orm/client";
import { redis } from "../../lib/redis/client";
import { _argon2 } from "../../lib/argon2";
import { env } from "../../config/env";
import { loginUser, UserDetails, LoginTokens } from "../auth/helper/login";
import { PROVIDERS, ProviderName, RawProviderProfile, isValidProvider } from "./providers";

const STATE_TTL_SECONDS = 600;
const stateKey = (state: string) => `oauth:state:${state}`;

const randomToken = (): string => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

// Built via RegExp(string) rather than a /[...]/  literal so the combining-diacritics
// range (U+0300–U+036F) can't get mangled into literal characters by an editor/pipeline.
const COMBINING_DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

const providerConfigError = () =>
    new AppError({
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        code: "OAUTH_PROVIDER_NOT_CONFIGURED",
        message: "This sign-in provider is not configured",
    });

const oauthFailedError = (message = "OAuth sign-in failed") =>
    new AppError({
        statusCode: StatusCodes.BAD_REQUEST,
        code: "OAUTH_PROVIDER_FAILED",
        message,
    });

/** Must exactly match the redirect URI registered with each provider's app config. */
const callbackUrl = (provider: ProviderName): string =>
    `${env.AUTH_SERVICE_PUBLIC_URL}/api/v1/auth/oauth-providers/${provider}/callback`;

export const buildAuthorizeUrl = async (provider: ProviderName): Promise<string> => {
    const config = PROVIDERS[provider];
    if (!config.clientId) {
        throw providerConfigError();
    }

    const state = crypto.randomUUID();
    await redis.set(stateKey(state), provider, { EX: STATE_TTL_SECONDS });

    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: callbackUrl(provider),
        response_type: "code",
        scope: config.scope,
        state,
    });

    return `${config.authorizeUrl}?${params.toString()}`;
};

const exchangeCodeForToken = async (provider: ProviderName, code: string): Promise<string> => {
    const config = PROVIDERS[provider];
    if (!config.clientId || !config.clientSecret) {
        throw providerConfigError();
    }

    const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: callbackUrl(provider),
        grant_type: "authorization_code",
    });

    const res = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: body.toString(),
    });

    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
        throw oauthFailedError("Failed to exchange authorization code");
    }

    return json.access_token as string;
};

const fetchProfile = async (
    provider: ProviderName,
    accessToken: string
): Promise<RawProviderProfile> => {
    const config = PROVIDERS[provider];
    const { url, headers } = config.buildUserInfoRequest(accessToken);

    const res = await fetch(url, { headers });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
        throw oauthFailedError("Failed to fetch profile from provider");
    }

    const profile = config.mapProfile(json);
    if (!profile.providerUserId || !profile.email) {
        throw oauthFailedError("Provider did not return an email address");
    }

    return profile;
};

const sanitizeNamePart = (value: string, fallback: string): string => {
    const stripped = (value ?? "")
        .normalize("NFD")
        .replace(COMBINING_DIACRITICS_RE, "") // strip accents so "González" -> "Gonzalez"
        .replace(/[^a-zA-Z]/g, "")
        .slice(0, 50);
    return stripped.length >= 2 ? stripped : fallback;
};

const buildUniqueUsername = async (hint: string): Promise<string> => {
    const base =
        (hint ?? "")
            .normalize("NFD")
            .replace(COMBINING_DIACRITICS_RE, "")
            .replace(/[^a-zA-Z0-9_]/g, "")
            .toLowerCase()
            .slice(0, 16) || "user";
    const padded = base.length >= 2 ? base : `${base}user`.slice(0, 16);

    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate =
            attempt === 0 ? padded : `${padded}${Math.floor(Math.random() * 10000)}`.slice(0, 20);
        const existing = await db.users.findUnique({
            where: { username: candidate },
            select: ["id"],
        });
        if (!existing) return candidate;
    }

    throw oauthFailedError("Could not generate a unique username");
};

/**
 * Resolves a provider profile to a user id: an existing linked identity wins,
 * then an auto-link onto a matching *verified* email (per the account-linking
 * policy), then falls back to creating a brand-new account.
 */
const findOrCreateUser = async (
    provider: ProviderName,
    profile: RawProviderProfile
): Promise<string> => {
    const existingIdentity = (await db.oauthIdentities.findUnique({
        where: { provider, provider_user_id: profile.providerUserId },
        select: ["user_id"],
    })) as { user_id: string } | null;

    if (existingIdentity) {
        return existingIdentity.user_id;
    }

    const email = profile.email.toLowerCase();

    const existingEmail = (await db.emailAddresses.findUnique({
        where: { email },
        select: ["user_id", "is_verified"],
    })) as { user_id: string; is_verified: boolean } | null;

    if (existingEmail?.is_verified) {
        await db.oauthIdentities.create({
            data: {
                user_id: existingEmail.user_id,
                provider,
                provider_user_id: profile.providerUserId,
                email,
            },
        });
        return existingEmail.user_id;
    }

    const firstName = sanitizeNamePart(profile.firstName, "User");
    const lastName = sanitizeNamePart(profile.lastName, "Account");
    const username = await buildUniqueUsername(profile.usernameHint);
    // OAuth-only accounts never use this password — it's unguessable and exists only
    // to satisfy the NOT NULL constraint shared with email/password accounts.
    const randomPasswordHash = await _argon2.hash(randomToken());

    const user = await db.users.create({
        data: { first_name: firstName, last_name: lastName, username },
    });

    if (!user?.id) {
        throw new AppError({
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            code: "OAUTH_USER_CREATION_FAILED",
            message: "Failed to create account from provider profile",
        });
    }

    await db.emailAddresses.create({
        data: {
            user_id: user.id,
            email,
            is_verified: true, // the provider already verified this email
            verification_token: randomToken(),
            verification_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
    });

    await db.securities.create({
        data: { user_id: user.id, password_hash: randomPasswordHash },
    });

    await db.oauthIdentities.create({
        data: { user_id: user.id, provider, provider_user_id: profile.providerUserId, email },
    });

    return user.id;
};

export const handleCallback = async (
    provider: ProviderName,
    code: string,
    state: string
): Promise<LoginTokens> => {
    const cachedProvider = await redis.get(stateKey(state));
    await redis.del(stateKey(state));

    if (!cachedProvider || cachedProvider !== provider) {
        throw oauthFailedError("Invalid or expired OAuth state");
    }

    const accessToken = await exchangeCodeForToken(provider, code);
    const profile = await fetchProfile(provider, accessToken);
    const userId = await findOrCreateUser(provider, profile);

    const record = (await db.users.findUnique({
        where: { id: userId },
        select: ["id", "first_name", "last_name", "username"],
        include: {
            emailAddress: { select: ["id", "email", "is_verified"] },
            security: { select: ["id", "password_hash", "logged_in"] },
        },
    })) as any;

    if (!record?.emailAddress || !record.security) {
        throw oauthFailedError("Account data is incomplete");
    }

    const userDetails: UserDetails = {
        id: record.emailAddress.id,
        email: record.emailAddress.email,
        is_verified: record.emailAddress.is_verified,
        user: {
            id: record.id,
            first_name: record.first_name,
            last_name: record.last_name,
            username: record.username,
        },
        security: {
            id: record.security.id,
            password_hash: record.security.password_hash,
            logged_in: record.security.logged_in,
        },
    };

    return loginUser(userDetails);
};

export { isValidProvider };
export type { ProviderName };
