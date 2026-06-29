import { z } from "zod";

const oauthTokenSchema = z.object({
    client: z.string().min(1, "client is required"),
    secret: z.string().min(1, "secret is required"),
});

type OAuthTokenInput = z.infer<typeof oauthTokenSchema>;

export type { OAuthTokenInput };
export { oauthTokenSchema };
