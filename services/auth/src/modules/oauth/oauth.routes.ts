import { Router } from "express";

import { asyncHandler } from "../../common/utils/async-handler";
import { validateBody } from "../../common/middleware/validate.middleware";
import { oauthController } from "./oauth.controller";
import { oauthTokenSchema } from "./oauth.validation";

const oauthRoutes = Router();

oauthRoutes.post(
    "/token",
    validateBody(oauthTokenSchema),
    asyncHandler(oauthController.issueToken)
);

export { oauthRoutes };
