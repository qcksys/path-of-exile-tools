export class OperationError extends Error {
    constructor(
        message: string,
        public readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 503 = 400,
    ) {
        super(message);
    }
}
