import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { getPool, shutdownPool } from "./lib/db/orm/pool";
import { redis } from "./lib/redis/client";
import { sleepWithExit } from "./lib/utils/sleep";

const initializeServer = async (): Promise<void> => {
    // Initialize any necessary resources here (e.g., database connections, Redis client)
    try {
        getPool(); // Ensure the database pool is initialized
        await redis.connect();
    } catch (error) {
        logger.error("Failed to initialize Redis client", { error });
        sleepWithExit(200, 1); // Wait for logs to flush before exiting
    }
};

let server: ReturnType<typeof app.listen>;

const setPublicKeyAccessPassword = async (): Promise<void> => {
    if (!env.JWT_PUBLIC_KEY) {
        logger.fatal("JWT Public Key not found.");
    }
    try {
        await redis.set(env.JWT_CLIENT_ACCESS_TO_PUBLIC_KEY_NAME, env.JWT_PUBLIC_KEY);
        logger.info("JWT Public Key set in Redis successfully.");
    } catch {
        logger.error("Failed to set JWT Public Key in Redis.");
        sleepWithExit(200, 1); // Wait for logs to flush before exiting
    }
};

const bootstrap = async (): Promise<void> => {
    await initializeServer();
    await setPublicKeyAccessPassword();

    server = app.listen(env.PORT, () => {
        logger.info("HTTP server started", {
            env: env.NODE_ENV,
            port: env.PORT,
        });
    });
};

let isShuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;

    logger.info("Shutdown signal received", { signal });

    await shutdownPool();
    await redis.disconnect();

    server.close(() => {
        logger.info("HTTP server stopped");
        sleepWithExit(200, 0); // Wait for logs to flush before exiting
    });

    setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        sleepWithExit(200, 1); // Wait for logs to flush before exiting
    }, 10_000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

void bootstrap();
