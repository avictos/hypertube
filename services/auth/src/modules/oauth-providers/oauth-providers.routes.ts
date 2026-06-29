import { Router } from "express";

import { asyncHandler } from "../../common/utils/async-handler";
import { oauthProvidersController } from "./oauth-providers.controller";

const oauthProvidersRoutes = Router();

oauthProvidersRoutes.get("/:provider", asyncHandler(oauthProvidersController.redirectToProvider));
oauthProvidersRoutes.get("/:provider/callback", asyncHandler(oauthProvidersController.callback));

export { oauthProvidersRoutes };
