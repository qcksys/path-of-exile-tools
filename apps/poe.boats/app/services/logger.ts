import { env } from "cloudflare:workers";
import { createLogger } from "@qcksys/pino-cloudflare";

export const logger = createLogger({
    level: env.LOG_LEVEL ?? "warn",
});
