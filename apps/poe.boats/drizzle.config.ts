import { loadEnvFile } from "node:process";
import type { Config } from "drizzle-kit";
import { DB_TABLE_PREFIX } from "~/const";

loadEnvFile(".dev.vars");

const env = process.env as { DATABASE_URL: string };

export const drizzleConfig: {
    schema: string;
    out: string;
} = {
    schema: "./app/db/schema/*",
    out: "./app/db/migrations",
};

export default {
    dialect: "mysql",
    schema: drizzleConfig.schema,
    out: drizzleConfig.out,
    dbCredentials: {
        url: env.DATABASE_URL,
    },
    tablesFilter: [DB_TABLE_PREFIX],
    migrations: {
        table: `${DB_TABLE_PREFIX}migrations`,
    },
} satisfies Config;
