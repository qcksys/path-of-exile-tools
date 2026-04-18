import { env } from "cloudflare:workers";
import pino from "pino";

export const logger = pino({
    level: env.LOG_LEVEL ?? "warn",
    browser: { asObject: true },
});
