import { inspect } from "node:util";
import { env } from "../config/env";

const LOG_LEVELS: Record<string, number> = {
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
};

type LogLevel = "debug" | "info" | "warn" | "error";

const shouldLog = (level: LogLevel): boolean => {
    const configuredLevel = env.LOG_LEVEL || "info";
    return LOG_LEVELS[level] >= LOG_LEVELS[configuredLevel];
};

type LogMeta = Record<string, unknown> & { err?: Error };

const isDev = env.NODE_ENV === "development";

// ANSI escape codes for terminal colors
const colors = {
    debug: "\x1b[34m", // Blue
    info: "\x1b[36m", // Cyan
    warn: "\x1b[33m", // Yellow
    error: "\x1b[31m", // Red
    reset: "\x1b[0m",
    dim: "\x1b[90m", // Gray
};

/**
 * JSON.stringify drops Error object properties (name, message, stack)
 * because they are non-enumerable. This helper safely extracts them.
 */
const serializeMeta = (meta?: LogMeta) => {
    if (!meta) return undefined;
    if (!meta.err) return meta;

    const { err, ...rest } = meta;
    return {
        ...rest,
        err: {
            name: err.name,
            message: err.message,
            stack: err.stack,
        },
    };
};

const write = (level: LogLevel, message: string, meta?: LogMeta): void => {
    if (!shouldLog(level)) {
        return;
    }

    const timestamp = new Date().toISOString();

    // ---------------------------------------------------------
    // DEVELOPMENT: Pretty Logging
    // ---------------------------------------------------------
    if (isDev) {
        const color = colors[level];
        const StartSymbol = `‣`;
        const timeLabel = `${colors.dim}${timestamp}${colors.reset}`;
        const levelLabel = `${color}[${level.toUpperCase()}]${colors.reset}`;

        let logLine = `${StartSymbol} ${timeLabel} ${levelLabel} ${message}`;

        if (meta) {
            // util.inspect prints objects and errors beautifully with native syntax highlighting
            const metaString = inspect(meta, { colors: true, depth: null });
            logLine += `\n${metaString}`;
        }

        if (level === "error") {
            console.error(logLine);
        } else if (level === "warn") {
            console.warn(logLine);
        } else {
            console.log(logLine);
        }
        return;
    }

    // ---------------------------------------------------------
    // PRODUCTION: Performant JSON Logging
    // ---------------------------------------------------------
    const payload = {
        level,
        timestamp,
        message,
        ...(serializeMeta(meta) ?? {}),
    };

    const line = JSON.stringify(payload);

    if (level === "error") {
        console.error(line);
    } else if (level === "warn") {
        console.warn(line);
    } else {
        console.log(line);
    }
};

export const logger = {
    debug: (message: string, meta?: LogMeta): void => write("debug", message, meta),
    info: (message: string, meta?: LogMeta): void => write("info", message, meta),
    warn: (message: string, meta?: LogMeta): void => write("warn", message, meta),
    error: (message: string, meta?: LogMeta): void => write("error", message, meta),
    fatal: (message: string, meta?: LogMeta): void => {
        write("error", message, meta);
        process.exit(1); // Exit the process after logging a fatal error
    },
};
