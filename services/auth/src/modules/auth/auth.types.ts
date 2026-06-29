export type AuthUser = {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    createdAt: Date;
};

export type PublicUser = {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    createdAt: Date;
};

export type LoginInput = {
    email: string;
    password: string;
};

export type AuthVerifyEmailResult = {
    message: string;
};

export type ResendVerificationResult = {
    message: string;
};

export type AuthTokenPayload = {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    trackerId: string;
};

export type PasswordResetLinkResult = {
    message: string;
};

export type PasswordResetVerifyResult = {
    message: string;
};

export type ChangePasswordResult = {
    message: string;
};

export type UserProfile = {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
};
