import { env } from "../../config/env";

export type ProviderName = "42" | "google" | "facebook";

export type RawProviderProfile = {
    providerUserId: string;
    email: string;
    firstName: string;
    lastName: string;
    /** A username hint, not yet validated/sanitized against our own constraints. */
    usernameHint: string;
};

export type ProviderConfig = {
    authorizeUrl: string;
    tokenUrl: string;
    scope: string;
    clientId: string | undefined;
    clientSecret: string | undefined;
    /** Builds the userinfo request — Facebook needs `fields` + token as query params. */
    buildUserInfoRequest: (accessToken: string) => {
        url: string;
        headers?: Record<string, string>;
    };
    mapProfile: (json: any) => RawProviderProfile;
};

export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
    "42": {
        authorizeUrl: "https://api.intra.42.fr/oauth/authorize",
        tokenUrl: "https://api.intra.42.fr/oauth/token",
        scope: "public",
        clientId: env.OAUTH_42_CLIENT_ID,
        clientSecret: env.OAUTH_42_CLIENT_SECRET,
        buildUserInfoRequest: (accessToken) => ({
            url: "https://api.intra.42.fr/v2/me",
            headers: { Authorization: `Bearer ${accessToken}` },
        }),
        mapProfile: (json) => ({
            providerUserId: String(json.id),
            email: json.email,
            firstName: json.first_name,
            lastName: json.last_name,
            usernameHint: json.login,
        }),
    },
    google: {
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "openid email profile",
        clientId: env.OAUTH_GOOGLE_CLIENT_ID,
        clientSecret: env.OAUTH_GOOGLE_CLIENT_SECRET,
        buildUserInfoRequest: (accessToken) => ({
            url: "https://www.googleapis.com/oauth2/v3/userinfo",
            headers: { Authorization: `Bearer ${accessToken}` },
        }),
        mapProfile: (json) => ({
            providerUserId: String(json.sub),
            email: json.email,
            firstName: json.given_name ?? json.name ?? "User",
            lastName: json.family_name ?? "",
            usernameHint: typeof json.email === "string" ? json.email.split("@")[0] : "user",
        }),
    },
    facebook: {
        authorizeUrl: "https://www.facebook.com/v19.0/dialog/oauth",
        tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
        scope: "email,public_profile",
        clientId: env.OAUTH_FACEBOOK_CLIENT_ID,
        clientSecret: env.OAUTH_FACEBOOK_CLIENT_SECRET,
        buildUserInfoRequest: (accessToken) => ({
            url: `https://graph.facebook.com/me?fields=id,email,first_name,last_name&access_token=${encodeURIComponent(accessToken)}`,
        }),
        mapProfile: (json) => ({
            providerUserId: String(json.id),
            email: json.email,
            firstName: json.first_name ?? "User",
            lastName: json.last_name ?? "",
            usernameHint:
                typeof json.email === "string" ? json.email.split("@")[0] : `fb${json.id}`,
        }),
    },
};

export const isValidProvider = (value: string): value is ProviderName =>
    value === "42" || value === "google" || value === "facebook";
