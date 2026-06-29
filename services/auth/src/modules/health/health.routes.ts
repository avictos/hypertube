import { Router } from "express";
import { healthController } from "./health.controller";

const healthRoutes = Router();

healthRoutes.get("/", healthController.getHealth);

export { healthRoutes };
