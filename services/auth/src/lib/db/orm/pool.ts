import pg from "pg";
import { env } from "../../../config/env";
import { logger } from "../../../config/logger";

const { Pool } = pg;

let pool: pg.Pool;

let isConnecting = false;

/**
 * Provides a Singleton instance of the PostgreSQL connection pool. Initializes the pool on first call and reuses it for subsequent calls. Handles connection errors and ensures proper shutdown on application exit.
 * @returns A connected pg.Pool instance ready for querying the database
 */
export const getPool = (): pg.Pool => {
    if (pool) {
        return pool;
    }

    if (isConnecting) {
        throw new Error("Database pool is currently initializing.");
    }

    try {
        isConnecting = true;
        logger.info("Initializing database pool...");

        if (!env.DATABASE_URL) {
            logger.error("DATABASE_URL is not defined in environment variables.");
            process.exit(1);
        }

        pool = new Pool({
            connectionString: env.DATABASE_URL,
            max: env.MAX_DB_POOL_SIZE || 20,
            idleTimeoutMillis: env.IDLE_TIMEOUT_MILLIS || 60_000,
            connectionTimeoutMillis: env.CONNECTION_TIMEOUT_MILLIS || 2_000,
        });

        pool.on("error", (err) => {
            logger.error("Unexpected error on idle database client", {
                message: err.message,
                stack: err.stack,
            });
            process.exit(1);
        });

        return pool;
    } catch (err: any) {
        logger.error("Failed to create database pool", { err });
        process.exit(1);
    } finally {
        isConnecting = false;
    }
};

export const shutdownPool = async () => {
    if (pool) {
        logger.info("Shutting down database pool...");

        try {
            await pool.end();

            logger.info("Database pool has been shut down successfully.");
        } catch (err: any) {
            logger.error("Failed to shutdown database pool", { err });
        } finally {
            pool = null as any;
        }
    } else {
        logger.warn("Shutdown called, but no active pool was found.");
    }
};
