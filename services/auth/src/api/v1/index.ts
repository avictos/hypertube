import { Router } from "express";
import { authRoutes } from "../../modules/auth/auth.routes";
import { healthRoutes } from "../../modules/health/health.routes";
import { oauthRoutes } from "../../modules/oauth/oauth.routes";
import { usersRoutes } from "../../modules/users/users.routes";
import { clientsRoutes } from "../../modules/clients/clients.routes";
import { oauthProvidersRoutes } from "../../modules/oauth-providers/oauth-providers.routes";

const v1Router = Router();

v1Router.use("/healthz", healthRoutes);
v1Router.use("/auth/oauth-providers", oauthProvidersRoutes);
v1Router.use("/auth", authRoutes);
v1Router.use("/oauth", oauthRoutes);
v1Router.use("/users", usersRoutes);
v1Router.use("/clients", clientsRoutes);

export { v1Router };
