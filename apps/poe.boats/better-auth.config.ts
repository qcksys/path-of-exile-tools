/**
 * Better Auth CLI configuration file
 *
 * Docs: https://www.better-auth.com/docs/concepts/cli
 */
import "varlock/auto-load";
import { createDbConnection } from "~/db/client";
import { authServer as betterAuthApp } from "~/lib/auth.server";

const env = process.env as unknown as CloudflareBindings;
env.ENVIRONMENT = env.ENVIRONMENT || "local";

const db = createDbConnection(env.DATABASE_URL);

export const auth = betterAuthApp({ env, db });
