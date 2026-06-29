/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import { logger } from "../config/logger";
import { getPool, shutdownPool } from "../lib/db/orm/pool";

const SCHEMA_PATH = path.join(__dirname, "./schema.sql");

/**
 * Creates the tables defined in schema.sql
 */
export const runMigration = async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
        logger.info("Starting database migration...");
        const sql = fs.readFileSync(SCHEMA_PATH, "utf8");
        await client.query(sql);
        logger.info("Migration completed successfully.");
    } catch (err: any) {
        logger.error("Migration failed!", { message: err.message });
        throw err; // Let the caller handle the exit
    } finally {
        client.release();
    }
};

/**
 * Wipes the public schema and recreates it.
 * This effectively "drops" everything (tables, types, indexes)
 * without needing to disconnect from the DB.
 */
export const dropDatabase = async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
        logger.warn("Dropping all tables (resetting public schema)...");
        // Drop everything in the public schema and recreate it
        await client.query("DROP SCHEMA public CASCADE;");
        await client.query("CREATE SCHEMA public;");
        await client.query("GRANT ALL ON SCHEMA public TO public;");
        logger.info("Database reset successfully.");
    } catch (err: any) {
        logger.error("Failed to drop database", { message: err.message });
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Often used in development to reset and re-seed the DB.
 */
export const refreshDatabase = async () => {
    try {
        await dropDatabase();
        await runMigration();
        logger.info("Database refreshed successfully.");
    } catch {
        logger.error("Database refresh failed.");
    }
};

// Simple CLI Runner
const action = process.argv[2]; // Get command line argument

const run = async () => {
    try {
        if (action === "drop") {
            await dropDatabase();
        } else if (action === "refresh") {
            await refreshDatabase();
        } else {
            await runMigration();
        }
    } finally {
        await shutdownPool();
    }
};

run();
