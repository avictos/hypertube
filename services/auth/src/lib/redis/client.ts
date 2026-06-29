import { createClient, RedisClientType, SetOptions } from "redis";

import { env } from "../../config/env";
import { logger } from "../../config/logger";

// Follows the Singleton pattern to ensure only one Redis
// client instance is created and shared across the application.
export class RedisClient {
    private client: RedisClientType;
    private connectPromise: Promise<void> | null = null;

    constructor() {
        const isRedisAuthEnabled =
            typeof env.REDIS_PASSWORD === "string" && env.REDIS_PASSWORD.length > 0;

        if (!isRedisAuthEnabled && env.NODE_ENV === "production") {
            logger.warn("REDIS_PASSWORD is not set in production; Redis AUTH is disabled");
        }

        this.client = createClient({
            socket: {
                host: env.REDIS_HOST,
                port: env.REDIS_PORT,
                connectTimeout: env.REDIS_CONNECTION_TIMEOUT_MILLIS,
                keepAlive: true,
                reconnectStrategy: (retries) => {
                    // Exponential backoff capped at 2s avoids hot-loop reconnects.
                    return Math.min(100 * 2 ** retries, 2_000);
                },
            },
            ...(isRedisAuthEnabled ? { password: env.REDIS_PASSWORD } : {}),
        });

        this.client.on("connect", () => {
            logger.info("Connecting to Redis...");
        });

        this.client.on("ready", () => {
            logger.info("Redis client is ready");
        });

        this.client.on("reconnecting", () => {
            logger.warn("Redis client reconnecting");
        });

        this.client.on("end", () => {
            logger.warn("Redis connection closed");
        });

        this.client.on("error", (err) => {
            logger.error("Redis client error", { err });
        });
    }

    private normalizeError(error: unknown): Error {
        if (error instanceof Error) {
            return error;
        }

        return new Error(String(error));
    }

    public async connect(): Promise<void> {
        if (this.client.isReady) {
            return;
        }

        if (!this.connectPromise) {
            this.connectPromise = this.client
                .connect()
                .then(() => {
                    logger.info("Connected to Redis successfully");
                })
                .catch((error: unknown) => {
                    const err = this.normalizeError(error);
                    logger.error("Failed to connect to Redis", { err });
                    throw err;
                })
                .finally(() => {
                    this.connectPromise = null;
                });
        }

        await this.connectPromise;
    }

    public async set(key: string, value: string, options?: SetOptions): Promise<void> {
        try {
            await this.connect();
            await this.client.set(key, value, options);
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to set key in Redis", { key, err });
            throw err;
        }
    }

    public async get(key: string): Promise<string | null> {
        try {
            await this.connect();
            return await this.client.get(key);
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to get key from Redis", { key, err });
            throw err;
        }
    }

    public async exists(key: string): Promise<boolean> {
        try {
            await this.connect();
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to check key existence in Redis", { key, err });
            throw err;
        }
    }

    public async expire(key: string, seconds: number): Promise<void> {
        try {
            await this.connect();
            await this.client.expire(key, seconds);
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to set expiration for key in Redis", { key, seconds, err });
            throw err;
        }
    }

    public async incr(key: string): Promise<number> {
        try {
            await this.connect();
            return await this.client.incr(key);
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to increment key in Redis", { key, err });
            throw err;
        }
    }

    public async decr(key: string): Promise<number> {
        try {
            await this.connect();
            return await this.client.decr(key);
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to decrement key in Redis", { key, err });
            throw err;
        }
    }

    public async del(key: string): Promise<void> {
        try {
            await this.connect();
            await this.client.del(key);
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to delete key from Redis", { key, err });
            throw err;
        }
    }

    public async sAdd(key: string, member: string): Promise<void> {
        try {
            await this.connect();
            await this.client.sAdd(key, member);
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to add set member in Redis", { key, member, err });
            throw err;
        }
    }

    public async sRem(key: string, member: string): Promise<void> {
        try {
            await this.connect();
            await this.client.sRem(key, member);
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to remove set member in Redis", { key, member, err });
            throw err;
        }
    }

    public async sMembers(key: string): Promise<string[]> {
        try {
            await this.connect();
            return await this.client.sMembers(key);
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to get set members from Redis", { key, err });
            throw err;
        }
    }

    public async disconnect(): Promise<void> {
        try {
            if (!this.client.isOpen) {
                logger.warn("Attempted to disconnect from Redis, but client was not open");
                return;
            }

            await this.client.quit();
            logger.info("Disconnected from Redis successfully");
        } catch (error: unknown) {
            const err = this.normalizeError(error);
            logger.error("Failed to disconnect from Redis", { err });
            throw err;
        }
    }
}

const redisClient = new RedisClient();

export { redisClient as redis };
