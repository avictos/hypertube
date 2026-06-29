import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

type SendEmailParams = {
    to: string;
    subject: string;
    html: string;
    text: string;
};

class SesClient {
    private client: SESClient | null = null;

    private getClient(): SESClient {
        if (this.client) {
            return this.client;
        }

        if (!env.AWS_REGION) {
            throw new AppError({
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                code: "AWS_SES_REGION_MISSING",
                message: "AWS region is not configured",
            });
        }

        const config: ConstructorParameters<typeof SESClient>[0] = {
            region: env.AWS_REGION,
        };

        if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
            config.credentials = {
                accessKeyId: env.AWS_ACCESS_KEY_ID,
                secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            };
        }

        this.client = new SESClient(config);
        return this.client;
    }

    public async sendEmail(params: SendEmailParams): Promise<void> {
        if (!env.AWS_SES_SOURCE_EMAIL) {
            throw new AppError({
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                code: "AWS_SES_SOURCE_EMAIL_MISSING",
                message: "AWS SES source email is not configured",
            });
        }

        const client = this.getClient();
        const command = new SendEmailCommand({
            Source: env.AWS_SES_SOURCE_EMAIL,
            Destination: {
                ToAddresses: [params.to],
            },
            Message: {
                Subject: {
                    Data: params.subject,
                    Charset: "UTF-8",
                },
                Body: {
                    Html: {
                        Data: params.html,
                        Charset: "UTF-8",
                    },
                    Text: {
                        Data: params.text,
                        Charset: "UTF-8",
                    },
                },
            },
        });

        try {
            await client.send(command);
        } catch (error) {
            logger.error("Failed to send SES email", { error });
            throw new AppError({
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
                code: "AWS_SES_SEND_FAILED",
                message: "Failed to send email",
            });
        }
    }
}

const sesClient = new SesClient();

export { SesClient, sesClient };
