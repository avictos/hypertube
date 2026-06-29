import { z } from "zod";

import { env } from "../../config/env";

const SUPPORTED_LANGUAGE_CODES = [
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ar",
    "hi",
    "ja",
    "ko",
    "zh",
    "ru",
    "tr",
] as const;

const updateUserSchema = z
    .object({
        username: z
            .string()
            .min(env.USERNAME_MIN_LENGTH, `Min ${env.USERNAME_MIN_LENGTH} characters`)
            .max(env.USERNAME_MAX_LENGTH, `Max ${env.USERNAME_MAX_LENGTH} characters`)
            .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
            .optional(),
        email: z
            .email("Invalid email address")
            .min(env.EMAIL_MIN_LENGTH, "Email too short")
            .max(env.EMAIL_MAX_LENGTH, "Email too long")
            .optional(),
        password: z
            .string()
            .min(env.PASSWORD_MIN_LENGTH, `At least ${env.PASSWORD_MIN_LENGTH} characters`)
            .max(env.PASSWORD_MAX_LENGTH, `Max ${env.PASSWORD_MAX_LENGTH} characters`)
            .regex(/[A-Z]/, "Must contain one uppercase letter")
            .regex(/[a-z]/, "Must contain one lowercase letter")
            .regex(/[0-9]/, "Must contain one number")
            .regex(/[!@#$%^&*(),.?":{}|[\]|<>]/, "Must contain one special character")
            .optional(),
        profilePictureUrl: z.url("Invalid profile picture URL").optional(),
        preferredLanguage: z.enum(SUPPORTED_LANGUAGE_CODES).optional(),
    })
    .refine((data) => Object.values(data).some((value) => value !== undefined), {
        message: "At least one field to update must be provided",
    });

type UpdateUserInput = z.infer<typeof updateUserSchema>;

export type { UpdateUserInput };
export { updateUserSchema };
