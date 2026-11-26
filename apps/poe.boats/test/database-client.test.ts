import { expect, it, vi } from "vite-plus/test";
import { openDatabase, openWorkerDatabase, workerDatabaseCacheScopes } from "~/db/client";

const mysql = vi.hoisted(() => ({ createConnection: vi.fn(), end: vi.fn() }));
vi.mock("mysql2/promise", () => ({ createConnection: mysql.createConnection }));

it("shares the HTTP database across requests but isolates different database URLs", async () => {
    const first = await openDatabase("mysql://test:test@localhost/first");
    await first.close();
    const next = await openDatabase("mysql://test:test@localhost/first");
    expect(next.db).toBe(first.db);
    const other = await openDatabase("mysql://test:test@localhost/second");
    expect(other.db).not.toBe(first.db);
    expect((await openDatabase("mysql://test:test@localhost/second")).db).toBe(other.db);
});

it("connects through the Hyperdrive binding when the environment has one", async () => {
    mysql.createConnection.mockResolvedValue({ end: mysql.end });
    const hyperdrive = {
        host: "hyperdrive.local",
        port: 3306,
        user: "worker",
        password: "inert",
        database: "poeboats",
        connectionString: "mysql://worker:inert@hyperdrive.local:3306/poeboats",
    } as Hyperdrive;
    const env = {
        DATABASE_URL: "mysql://unused@localhost/unused",
        DATABASE_DRIVER: "planetscale",
        URL: "poe-boats.localhost",
        HYPERDRIVE: hyperdrive,
    } as const;
    const versioned = { ...env, CF_VERSION_METADATA: { id: "first", tag: "", timestamp: "" } };
    const database = await openWorkerDatabase(versioned);
    expect(mysql.createConnection).toHaveBeenCalledWith({
        host: "hyperdrive.local",
        port: 3306,
        user: "worker",
        password: "inert",
        database: "poeboats",
        disableEval: true,
    });
    await database.close();
    expect(mysql.end).toHaveBeenCalledOnce();

    const rotated = {
        ...versioned,
        HYPERDRIVE: {
            ...hyperdrive,
            host: "next-proxy.local",
            port: 3307,
            user: "next-user",
            database: "next-database",
        },
    };
    const next = await openWorkerDatabase(rotated);
    const scope = workerDatabaseCacheScopes.get(database.db);
    expect(next.db).not.toBe(database.db);
    expect(scope?.host).toBe(env.URL);
    expect(scope?.source).not.toContain(hyperdrive.password);
    expect(workerDatabaseCacheScopes.get(next.db)).toEqual(scope);
    await next.close();

    const deployed = await openWorkerDatabase({
        ...rotated,
        CF_VERSION_METADATA: { ...versioned.CF_VERSION_METADATA, id: "second" },
    });
    expect(workerDatabaseCacheScopes.get(deployed.db)?.source).not.toBe(scope?.source);
    await deployed.close();
    const otherWorker = await openWorkerDatabase({ ...rotated, URL: "other.example" });
    expect(workerDatabaseCacheScopes.get(otherWorker.db)?.host).not.toBe(scope?.host);
    await otherWorker.close();
    const unversioned = await openWorkerDatabase(env);
    expect(workerDatabaseCacheScopes.has(unversioned.db)).toBe(false);
    await unversioned.close();
});

it("uses the database URL and driver without a Hyperdrive binding", async () => {
    mysql.createConnection.mockClear();
    const env = {
        DATABASE_URL: "mysql://test:test@localhost/worker",
        DATABASE_DRIVER: "planetscale",
        URL: "poe-boats.localhost",
        CF_VERSION_METADATA: { id: "first", tag: "", timestamp: "" },
    } as const;
    const database = await openWorkerDatabase(env);
    expect(database.db).toBe((await openDatabase(env.DATABASE_URL)).db);
    const scope = workerDatabaseCacheScopes.get(database.db);
    const other = await openWorkerDatabase({
        ...env,
        DATABASE_URL: "mysql://test:test@localhost/other",
    });
    expect(scope?.host).toBe(env.URL);
    expect(workerDatabaseCacheScopes.get(other.db)?.source).not.toBe(scope?.source);
    expect(mysql.createConnection).not.toHaveBeenCalled();
});
