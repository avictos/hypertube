import { randomBytes } from "node:crypto";

export const generateEmailVerificationToken = (): string => {
    return randomBytes(32).toString("hex");
};
