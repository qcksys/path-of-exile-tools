import { expect, it, vi } from "vite-plus/test";
import { openDatabase, openWorkerDatabase } from "~/db/client";

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
    const database = await openWorkerDatabase({
        DATABASE_URL: "mysql://unused@localhost/unused",
        DATABASE_DRIVER: "planetscale",
        HYPERDRIVE: hyperdrive,
    });
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
});

it("uses the database URL and driver without a Hyperdrive binding", async () => {
    mysql.createConnection.mockClear();
    const env = {
        DATABASE_URL: "mysql://test:test@localhost/worker",
        DATABASE_DRIVER: "planetscale",
    };
    const database = await openWorkerDatabase(env);
    expect(database.db).toBe((await openDatabase(env.DATABASE_URL)).db);
    expect(mysql.createConnection).not.toHaveBeenCalled();
});
