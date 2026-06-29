import { Router } from "express";

import { asyncHandler } from "../../common/utils/async-handler";
import { validateBody } from "../../common/middleware/validate.middleware";
import { bearerAuthMiddleware } from "../../common/middleware/bearer-auth.middleware";
import { clientsController } from "./clients.controller";
import { createClientSchema } from "./clients.validation";

const clientsRoutes = Router();

clientsRoutes.use(bearerAuthMiddleware);

clientsRoutes.post("/", validateBody(createClientSchema), asyncHandler(clientsController.create));
clientsRoutes.get("/", asyncHandler(clientsController.list));
clientsRoutes.delete("/:id", asyncHandler(clientsController.remove));

export { clientsRoutes };
