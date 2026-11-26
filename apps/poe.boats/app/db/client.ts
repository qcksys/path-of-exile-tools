import { Client } from "@planetscale/database";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import type { ConnectionOptions } from "mysql2/promise";
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

type WorkerDatabaseEnv = Pick<CloudflareBindings, "DATABASE_URL" | "DATABASE_DRIVER"> &
    Partial<Pick<CloudflareBindings, "URL" | "HYPERDRIVE" | "CF_VERSION_METADATA">>;

export const workerDatabaseCacheScopes = new WeakMap<TDatabase, { host: string; source: string }>();

export async function openDatabase(url: string, driver = "planetscale") {
    if (driver === "planetscale") {
        // The HTTP client owns no socket. Reusing it also scopes summary caches to this database.
        if (sharedDatabase?.url !== url) sharedDatabase = { url, db: createDbConnection(url) };
        return { db: sharedDatabase.db, close: async () => {} };
    }
    if (driver !== "mysql") throw new Error("Unsupported database driver");
    return openMysql({ uri: url });
}

/** Opens a Worker environment's database: through its Hyperdrive binding when it has one. */
export async function openWorkerDatabase(env: WorkerDatabaseEnv) {
    const hyperdrive = env.HYPERDRIVE;
    // Hyperdrive keeps the pool to the origin, so each request opens its own local connection.
    const opened = hyperdrive
        ? await openMysql({
              host: hyperdrive.host,
              port: hyperdrive.port,
              user: hyperdrive.user,
              password: hyperdrive.password,
              database: hyperdrive.database,
          })
        : await openDatabase(env.DATABASE_URL, env.DATABASE_DRIVER);
    const version = env.CF_VERSION_METADATA?.id;
    if (env.URL && version) {
        // Hyperdrive issues request-specific connection parameters. Its binding belongs to this Worker version.
        const endpoint = hyperdrive ? undefined : new URL(env.DATABASE_URL);
        workerDatabaseCacheScopes.set(opened.db, {
            host: env.URL,
            source: JSON.stringify(
                endpoint
                    ? [version, env.DATABASE_DRIVER, endpoint.host, endpoint.pathname]
                    : [version, "HYPERDRIVE"],
            ),
        });
    } else workerDatabaseCacheScopes.delete(opened.db);
    return opened;
}

async function openMysql(options: ConnectionOptions) {
    const [{ createConnection }, { drizzle: mysqlDrizzle }] = await Promise.all([
        import("mysql2/promise"),
        import("drizzle-orm/mysql2"),
    ]);
    const client = await createConnection({ ...options, disableEval: true });
    const db = mysqlDrizzle({ client, relations });
    // Both adapters execute the same MySQL schema and queries; driver result metadata differs.
    return { db: db as unknown as TDatabase, close: () => client.end() };
}
