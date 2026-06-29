import type { RequestHandler } from "express";
import { UAParser } from "ua-parser-js";
import { StatusCodes } from "http-status-codes";
import { env } from "../../config/env";

const browserCheckMiddleware: RequestHandler = (req, _res, next) => {
    if (env.NODE_ENV === "development") {
        return next();
    }
    const uaHeader = req.headers["user-agent"] || req.headers["User-Agent"];
    const uaString = Array.isArray(uaHeader) ? uaHeader.join(" ") : (uaHeader ?? "");
    const parser = new UAParser();
    parser.setUA(uaString);
    const browser = parser.getBrowser();

    if (!browser.name) {
        _res.status(StatusCodes.BAD_REQUEST).json({
            status: "error",
            code: "BROWSER_ONLY",
            message: "This endpoint can only be accessed from a browser",
        });
        return;
    }
    next();
};

export { browserCheckMiddleware };
