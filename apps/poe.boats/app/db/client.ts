import { Client } from "@planetscale/database";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { relations } from "~/db/relations.ts";

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
        relations,
    });
};

let sharedDatabase: { url: string; db: TDatabase } | undefined;

export async function openDatabase(url: string, driver = "planetscale") {
    if (driver === "planetscale") {
        // The HTTP client owns no socket. Reusing it also scopes summary caches to this database.
        if (sharedDatabase?.url !== url) sharedDatabase = { url, db: createDbConnection(url) };
        return { db: sharedDatabase.db, close: async () => {} };
    }
    if (driver !== "mysql") throw new Error("Unsupported database driver");
    const [{ createConnection }, { drizzle: mysqlDrizzle }] = await Promise.all([
        import("mysql2/promise"),
        import("drizzle-orm/mysql2"),
    ]);
    const client = await createConnection({ uri: url, disableEval: true });
    const db = mysqlDrizzle({ client, relations });
    // Both adapters execute the same MySQL schema and queries; driver result metadata differs.
    return { db: db as unknown as TDatabase, close: () => client.end() };
}
