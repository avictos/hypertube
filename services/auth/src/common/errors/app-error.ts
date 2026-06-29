type AppErrorParams = {
    message: string;
    statusCode: number;
    code: string;
    details?: unknown;
};

class AppError extends Error {
    public readonly statusCode: number;

    public readonly code: string;

    public readonly details?: unknown;

    constructor(params: AppErrorParams) {
        super(params.message);
        this.name = "AppError";
        this.statusCode = params.statusCode;
        this.code = params.code;
        this.details = params.details;
    }
}

export { AppError };
