import { env } from "../../../config/env";
import { sesClient } from "../../../lib/aws/client";

export const sendVerificationEmail = async (email: string, link: string): Promise<void> => {
    const subject = "Verify your email";
    const text = `Verify your email by clicking this link: ${link}`;
    const html = `<p>Verify your email by clicking this link:</p><p><a href="${link}">${link}</a></p>`;

    await sesClient.sendEmail({ to: email, subject, html, text });
};

export const sendPasswordResetEmail = async (email: string, link: string): Promise<void> => {
    const subject = "Reset your password";
    const text = `Reset your password by clicking this link: ${link}`;
    const html = `<p>Reset your password by clicking this link:</p><p><a href="${link}">${link}</a></p>`;

    await sesClient.sendEmail({ to: email, subject, html, text });
};

export const sendAccountDeletionEmail = async (email: string, link: string): Promise<void> => {
    const expiration = env.ACCOUNT_DELETE_TOKEN_EXPIRATION_MINUTES;
    const subject = "Confirm account deletion";

    const text =
        `We received a request to permanently delete your account.\n\n` +
        `To proceed, please click the link below. For security reasons, this link will expire in ${expiration} minutes and requires you to be actively logged into your account to finalize the deletion:\n` +
        `${link}\n\n` +
        `If you didn't request this, you can safely ignore this email. Your account remains completely secure and no action will be taken.`;

    const html = `
        <div style="font-family: sans-serif; max-width: 600px; line-height: 1.5; color: #333;">
            <p>We received a request to permanently delete your account.</p>
            <p>To proceed, please click the link below. For security reasons, this link will expire in <b>${expiration} minutes</b> and requires you to be actively logged into your account to finalize the deletion:</p>
            <p><a href="${link}" style="color: #2563eb;">${link}</a></p>
            <p style="color: #666; font-size: 14px; margin-top: 32px;">
                If you didn't request this, you can safely ignore this email. Your account remains completely secure and no action will be taken.
            </p>
        </div>
    `;

    await sesClient.sendEmail({ to: email, subject, html, text });
};
