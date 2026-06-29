import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { validateBody } from "../../common/middleware/validate.middleware";
import { authController } from "./auth.controller";
import {
    changePasswordSchema,
    confirmDeleteAccountSchema,
    jwksJSONSchema,
    loginSchema,
    registerSchema,
    resetPasswordRequestSchema,
    resetPasswordVerifySchema,
    resendVerificationSchema,
    verifyEmailSchema,
    updateProfileSchema,
} from "./auth.validation";
import { accessMiddleware } from "../../common/middleware/access.middleware";

const authRoutes = Router();

authRoutes.post(
    "/.well-known/jwks.json",
    validateBody(jwksJSONSchema),
    asyncHandler(authController.jwksJSON)
);

authRoutes.post("/register", validateBody(registerSchema), asyncHandler(authController.register));
authRoutes.post(
    "/verify-email",
    validateBody(verifyEmailSchema),
    asyncHandler(authController.verifyEmail)
);
authRoutes.post(
    "/resend-verification",
    validateBody(resendVerificationSchema),
    asyncHandler(authController.resendVerification)
);
authRoutes.post("/login", validateBody(loginSchema), asyncHandler(authController.login));
authRoutes.post("/refresh", asyncHandler(authController.refreshSession));
authRoutes.post("/verify", asyncHandler(authController.verifySession));
authRoutes.post("/logout", accessMiddleware, asyncHandler(authController.logout));
authRoutes.post("/logout/all", accessMiddleware, asyncHandler(authController.logoutAll));
authRoutes.post(
    "/reset-password",
    validateBody(resetPasswordRequestSchema),
    asyncHandler(authController.requestPasswordReset)
);
authRoutes.post(
    "/reset-password/verify",
    validateBody(resetPasswordVerifySchema),
    asyncHandler(authController.verifyPasswordReset)
);
authRoutes.post(
    "/reset-password/change",
    validateBody(changePasswordSchema),
    asyncHandler(authController.changePassword)
);

// Internal BFF-only account endpoints (trusted via accessMiddleware's shared
// secret header, called only by the Next.js server). Kept off the public
// `/users` path so they don't collide with the spec'd public REST surface.
authRoutes.get("/account/:userId", accessMiddleware, asyncHandler(authController.getMe));
authRoutes.patch(
    "/account/:userId",
    accessMiddleware,
    validateBody(updateProfileSchema),
    asyncHandler(authController.updateMe)
);
authRoutes.post(
    "/account/:userId/delete",
    accessMiddleware,
    asyncHandler(authController.requestDeleteMe)
);
authRoutes.delete(
    "/account/:userId/delete",
    accessMiddleware,
    validateBody(confirmDeleteAccountSchema),
    asyncHandler(authController.confirmDeleteMe)
);

authRoutes.delete("/sessions/:id", accessMiddleware, asyncHandler(authController.revokeSession));

export { authRoutes };
