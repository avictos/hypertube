import type { NextFunction, Request, RequestHandler, Response } from "express";

const asyncHandler =
    (handler: RequestHandler): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };

export { asyncHandler };
