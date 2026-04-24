import type { RateLimitInfo } from "./rate_limit.ts";

/**
 * Shape of the JSON error body returned by the GGG API on 4xx / 5xx
 * responses. Not all endpoints populate every field.
 */
export interface PoeErrorBody {
    error?: {
        code?: number;
        message?: string;
    };
    [key: string]: unknown;
}

/**
 * Thrown for any non-2xx response from the Path of Exile API.
 *
 * Exposes the raw {@link Response}, the parsed body (if JSON), and parsed
 * rate-limit headers so callers can decide whether to retry.
 */
export class PoeApiError extends Error {
    override readonly name = "PoeApiError";
    readonly status: number;
    readonly statusText: string;
    readonly response: Response;
    readonly body: PoeErrorBody | string | undefined;
    readonly rateLimit: RateLimitInfo;

    constructor(init: {
        status: number;
        statusText: string;
        response: Response;
        body: PoeErrorBody | string | undefined;
        rateLimit: RateLimitInfo;
    }) {
        const codeMessage =
            typeof init.body === "object" && init.body?.error?.message
                ? init.body.error.message
                : init.statusText;
        super(`PoE API ${init.status} ${init.statusText}: ${codeMessage}`);
        this.status = init.status;
        this.statusText = init.statusText;
        this.response = init.response;
        this.body = init.body;
        this.rateLimit = init.rateLimit;
    }
}

/**
 * Convenience narrowing: is this error a retriable rate-limit hit?
 * Returns `true` for HTTP 429 or any response that advertised `Retry-After`.
 */
export function isRateLimited(err: unknown): err is PoeApiError {
    return (
        err instanceof PoeApiError &&
        (err.status === 429 || err.rateLimit.retryAfterSeconds !== undefined)
    );
}
