import z from "zod";

// This file is generated from schema.sql.
// Run `npm run generate:orm` after updating the schema.

// -------------- User and related types --------------

export const UsersTableName = "users";
export const Users = {
    id: "id",
    first_name: "first_name",
    last_name: "last_name",
    username: "username",
    profile_picture_url: "profile_picture_url",
    preferred_language: "preferred_language",
    created_at: "created_at",
    updated_at: "updated_at",
} as const;

export const BaseUserSchema = z.object({
    id: z.uuid(),
    first_name: z.string().max(50).min(2).max(50),
    last_name: z.string().max(50).min(2).max(50),
    username: z.string().max(20).min(2).max(20),
    profile_picture_url: z.string().nullable(),
    preferred_language: z.string().max(5),
    created_at: z.date(),
    updated_at: z.date(),
});
export const UserSchema = BaseUserSchema;
export type User = z.infer<typeof UserSchema>;
export const UpsertUserSchema = BaseUserSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
});
export type UpsertUser = z.infer<typeof UpsertUserSchema>;

export type UserUniqueFields = "id" | "username";

// -------------- EmailAddress and related types --------------

export const EmailAddressesTableName = "email_addresses";
export const EmailAddresses = {
    id: "id",
    user_id: "user_id",
    email: "email",
    is_verified: "is_verified",
    verification_token: "verification_token",
    verification_expires_at: "verification_expires_at",
    verification_attempts: "verification_attempts",
    last_verification_attempt_at: "last_verification_attempt_at",
    vcode_sent_at: "vcode_sent_at",
    vcode_resend_count: "vcode_resend_count",
    is_vcode_resend_locked: "is_vcode_resend_locked",
    vcode_resend_lock_expires_at: "vcode_resend_lock_expires_at",
    is_locked: "is_locked",
    lock_expires_at: "lock_expires_at",
    created_at: "created_at",
    updated_at: "updated_at",
} as const;

export const BaseEmailAddressSchema = z.object({
    id: z.uuid(),
    user_id: z.uuid(),
    email: z.email().max(256).min(5).max(256),
    is_verified: z.boolean(),
    verification_token: z.string(),
    verification_expires_at: z.date(),
    verification_attempts: z.number().int(),
    last_verification_attempt_at: z.date().nullable(),
    vcode_sent_at: z.date().nullable(),
    vcode_resend_count: z.number().int(),
    is_vcode_resend_locked: z.boolean(),
    vcode_resend_lock_expires_at: z.date().nullable(),
    is_locked: z.boolean(),
    lock_expires_at: z.date().nullable(),
    created_at: z.date(),
    updated_at: z.date(),
});
export const EmailAddressSchema = BaseEmailAddressSchema.refine(
    (data) => {
        if (data.is_verified && !data.verification_token) return false;
        return true;
    },
    {
        message: "verification_token is required when is_verified is true",
        path: ["verification_token"],
    }
).refine(
    (data) => {
        if (data.is_locked && !data.lock_expires_at) return false;
        return true;
    },
    {
        message: "lock_expires_at is required when is_locked is true",
        path: ["lock_expires_at"],
    }
);
export type EmailAddress = z.infer<typeof EmailAddressSchema>;
export const UpsertEmailAddressSchema = BaseEmailAddressSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
});
export type UpsertEmailAddress = z.infer<typeof UpsertEmailAddressSchema>;

export type EmailAddressUniqueFields = "id" | "email";

// -------------- Security and related types --------------

export const SecuritiesTableName = "securities";
export const Securities = {
    id: "id",
    user_id: "user_id",
    password_hash: "password_hash",
    failed_attempts: "failed_attempts",
    locked_until: "locked_until",
    last_failed_at: "last_failed_at",
    mfa_enabled: "mfa_enabled",
    mfa_secret: "mfa_secret",
    recovery_codes: "recovery_codes",
    password_changed_at: "password_changed_at",
    reset_token: "reset_token",
    reset_expires_at: "reset_expires_at",
    delete_token: "delete_token",
    delete_expires_at: "delete_expires_at",
    logged_in: "logged_in",
    last_login_at: "last_login_at",
    created_at: "created_at",
    updated_at: "updated_at",
} as const;

export const BaseSecuritySchema = z.object({
    id: z.uuid(),
    user_id: z.uuid(),
    password_hash: z.string(),
    failed_attempts: z.number().int().nullable(),
    locked_until: z.date().nullable(),
    last_failed_at: z.date().nullable(),
    mfa_enabled: z.boolean(),
    mfa_secret: z.string().nullable(),
    recovery_codes: z.array(z.string()).nullable(),
    password_changed_at: z.date(),
    reset_token: z.string().nullable(),
    reset_expires_at: z.date().nullable(),
    delete_token: z.string().nullable(),
    delete_expires_at: z.date().nullable(),
    logged_in: z.boolean(),
    last_login_at: z.date().nullable(),
    created_at: z.date(),
    updated_at: z.date(),
});
export const SecuritySchema = BaseSecuritySchema.refine(
    (data) => {
        if (data.mfa_enabled && !data.mfa_secret) return false;
        return true;
    },
    {
        message: "mfa_secret is required when mfa_enabled is true",
        path: ["mfa_secret"],
    }
)
    .refine(
        (data) => {
            const hasField1 = !!data.reset_expires_at;
            const hasField2 = !!data.reset_token;
            return hasField1 === hasField2;
        },
        {
            message: "reset_expires_at and reset_token must both be present or both be null",
            path: ["reset_expires_at"],
        }
    )
    .refine(
        (data) => {
            const hasField1 = !!data.delete_expires_at;
            const hasField2 = !!data.delete_token;
            return hasField1 === hasField2;
        },
        {
            message: "delete_expires_at and delete_token must both be present or both be null",
            path: ["delete_expires_at"],
        }
    );
export type Security = z.infer<typeof SecuritySchema>;
export const UpsertSecuritySchema = BaseSecuritySchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
});
export type UpsertSecurity = z.infer<typeof UpsertSecuritySchema>;

export type SecurityUniqueFields = "id" | "reset_token" | "delete_token";

// -------------- Session and related types --------------

export const SessionsTableName = "sessions";
export const Sessions = {
    id: "id",
    user_id: "user_id",
    tracker_id: "tracker_id",
    session_token: "session_token",
    expires_at: "expires_at",
    created_at: "created_at",
    updated_at: "updated_at",
} as const;

export const BaseSessionSchema = z.object({
    id: z.uuid(),
    user_id: z.uuid(),
    tracker_id: z.string(),
    session_token: z.string(),
    expires_at: z.date(),
    created_at: z.date(),
    updated_at: z.date(),
});
export const SessionSchema = BaseSessionSchema;
export type Session = z.infer<typeof SessionSchema>;
export const UpsertSessionSchema = BaseSessionSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
});
export type UpsertSession = z.infer<typeof UpsertSessionSchema>;

export type SessionUniqueFields = "id";
export type SessionCompositeUniqueFields = ["user_id", "session_token"];

// -------------- OauthClient and related types --------------

export const OauthClientsTableName = "oauth_clients";
export const OauthClients = {
    id: "id",
    user_id: "user_id",
    name: "name",
    client_id: "client_id",
    client_secret_hash: "client_secret_hash",
    last_used_at: "last_used_at",
    created_at: "created_at",
    updated_at: "updated_at",
} as const;

export const BaseOauthClientSchema = z.object({
    id: z.uuid(),
    user_id: z.uuid(),
    name: z.string().max(100).min(1).max(100),
    client_id: z.string(),
    client_secret_hash: z.string(),
    last_used_at: z.date().nullable(),
    created_at: z.date(),
    updated_at: z.date(),
});
export const OauthClientSchema = BaseOauthClientSchema;
export type OauthClient = z.infer<typeof OauthClientSchema>;
export const UpsertOauthClientSchema = BaseOauthClientSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
});
export type UpsertOauthClient = z.infer<typeof UpsertOauthClientSchema>;

export type OauthClientUniqueFields = "id" | "client_id";

// -------------- OauthIdentity and related types --------------

export const OauthIdentitiesTableName = "oauth_identities";
export const OauthIdentities = {
    id: "id",
    user_id: "user_id",
    provider: "provider",
    provider_user_id: "provider_user_id",
    email: "email",
    created_at: "created_at",
} as const;

export const BaseOauthIdentitySchema = z.object({
    id: z.uuid(),
    user_id: z.uuid(),
    provider: z.string(),
    provider_user_id: z.string(),
    email: z.email(),
    created_at: z.date(),
});
export const OauthIdentitySchema = BaseOauthIdentitySchema;
export type OauthIdentity = z.infer<typeof OauthIdentitySchema>;
export const UpsertOauthIdentitySchema = BaseOauthIdentitySchema.omit({
    id: true,
    created_at: true,
});
export type UpsertOauthIdentity = z.infer<typeof UpsertOauthIdentitySchema>;

export type OauthIdentityUniqueFields = "id";
export type OauthIdentityCompositeUniqueFields = ["provider", "provider_user_id"];

// -------------- Other functions --------------
export const getTableFields = (tableName: string) => {
    switch (tableName) {
        case UsersTableName:
            return Users;
        case EmailAddressesTableName:
            return EmailAddresses;
        case SecuritiesTableName:
            return Securities;
        case SessionsTableName:
            return Sessions;
        case OauthClientsTableName:
            return OauthClients;
        case OauthIdentitiesTableName:
            return OauthIdentities;
        default:
            throw new Error(`Unknown table name: ${tableName}`);
    }
};

// -------------- End of types --------------
