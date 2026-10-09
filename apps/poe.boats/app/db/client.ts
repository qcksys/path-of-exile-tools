import { Client } from "@planetscale/database";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { relations } from "~/db/relations.ts";
import { schema } from "~/db/schema";

export type TDatabase = ReturnType<typeof createDbConnection>;
export const createDbConnection = (url: string) => {
    const client = new Client({
        url,
        fetch: (url, init) => {
            if (init) {
                delete init.cache;
            }
            return fetch(url, init);
        },
    });
    return drizzle({
        client,
        schema,
        relations,
    });
};

export async function openDatabase(url: string, driver = "planetscale") {
    if (driver === "planetscale") return { db: createDbConnection(url), close: async () => {} };
    if (driver !== "mysql") throw new Error("Unsupported database driver");
    const [{ createConnection }, { drizzle: mysqlDrizzle }] = await Promise.all([
        import("mysql2/promise"),
        import("drizzle-orm/mysql2"),
    ]);
    const client = await createConnection({ uri: url, disableEval: true });
    const db = mysqlDrizzle({ client, schema, relations, mode: "default" });
    // Both adapters execute the same MySQL schema and queries; driver result metadata differs.
    return { db: db as unknown as TDatabase, close: () => client.end() };
}
