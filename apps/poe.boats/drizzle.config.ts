import "varlock/auto-load";
import type { Config } from "drizzle-kit";
import { DB_TABLE_PREFIX } from "~/const";

const env = process.env as { DATABASE_URL: string };
const databaseUrl = new URL(env.DATABASE_URL);
if (databaseUrl.hostname.endsWith(".psdb.cloud") && !databaseUrl.searchParams.has("ssl")) {
    databaseUrl.searchParams.set("ssl", JSON.stringify({ rejectUnauthorized: true }));
}

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
        url: databaseUrl.toString(),
    },
    tablesFilter: [DB_TABLE_PREFIX],
    migrations: {
        table: `${DB_TABLE_PREFIX}migrations`,
    },
} satisfies Config;
