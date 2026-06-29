import { Router } from "express";

import { asyncHandler } from "../../common/utils/async-handler";
import { validateBody } from "../../common/middleware/validate.middleware";
import { bearerAuthMiddleware } from "../../common/middleware/bearer-auth.middleware";
import { usersController } from "./users.controller";
import { updateUserSchema } from "./users.validation";

const usersRoutes = Router();

usersRoutes.use(bearerAuthMiddleware);

usersRoutes.get("/", asyncHandler(usersController.list));
usersRoutes.get("/:id", asyncHandler(usersController.getById));
usersRoutes.patch("/:id", validateBody(updateUserSchema), asyncHandler(usersController.updateById));

export { usersRoutes };
