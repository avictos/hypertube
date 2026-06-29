import { z } from "zod";

const createClientSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Max 100 characters"),
});

type CreateClientInput = z.infer<typeof createClientSchema>;

export type { CreateClientInput };
export { createClientSchema };
