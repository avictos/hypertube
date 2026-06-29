import type { Request, Response } from "express";
import { env } from "../../config/env";

const healthController = {
    getHealth: (_req: Request, res: Response): void => {
        res.status(200).json({
            status: "ok",
            env: env.NODE_ENV,
            uptimeSeconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
        });
    },
};

export { healthController };
