import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import {
    openDb,
    queryAll,
    TransactionRollbackError,
    withTransaction,
} from "../../../packages/poe-stash-ingest/src/shared/db";

it("preserves both the original commit failure and a failed rollback after DuckDB ends the transaction", async () => {
    const directory = await mkdtemp(join(tmpdir(), "poe-stash-transaction-"));
    const path = join(directory, "fixture.duckdb");
    const db = await openDb(path);
    const other = await openDb(path);
    try {
        await db.conn.run("SET memory_limit='16MB'");
        await db.conn.run("CREATE TABLE transaction_probe (id INTEGER PRIMARY KEY)");
        const failure = await withTransaction(db.conn, async () => {
            await db.conn.run("INSERT INTO transaction_probe VALUES (1), (2)");
            await other.conn.run("INSERT INTO transaction_probe VALUES (1)");
        }).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(TransactionRollbackError);
        expect(failure).toBeInstanceOf(AggregateError);
        if (!(failure instanceof AggregateError)) throw failure;
        expect(failure.errors).toHaveLength(2);
        expect(failure.errors[0]).toBeInstanceOf(Error);
        expect(failure.errors[0].message).toMatch(/Failed to commit.*duplicate key/i);
        expect(failure.errors[1]).toBeInstanceOf(Error);
        expect(failure.errors[1].message).toMatch(/cannot rollback.*no transaction is active/i);
        expect(failure.cause).toBe(failure.errors[0]);
        expect(failure.name).toBe("TransactionRollbackError");
        expect(await queryAll(db.conn, "SELECT id FROM transaction_probe ORDER BY id")).toEqual([
            { id: 1 },
        ]);
        await withTransaction(db.conn, () =>
            db.conn.run("INSERT INTO transaction_probe VALUES (3)"),
        );
        expect(await queryAll(db.conn, "SELECT id FROM transaction_probe ORDER BY id")).toEqual([
            { id: 1 },
            { id: 3 },
        ]);
    } finally {
        await other.close();
        await db.close();
        await rm(directory, { recursive: true, force: true });
    }
});

it("rethrows the identical OOM error when rollback succeeds and leaves no pending writes", async () => {
    const db = await openDb(":memory:");
    try {
        await db.conn.run("SET threads=1");
        await db.conn.run("SET memory_limit='16MB'");
        await db.conn.run("SET max_temp_directory_size='0B'");
        await db.conn.run("CREATE TABLE transaction_probe (id INTEGER)");
        let original: unknown;
        const failure = await withTransaction(db.conn, async () => {
            await db.conn.run("INSERT INTO transaction_probe VALUES (1)");
            try {
                await db.conn.run("SELECT list(i) FROM range(10000000) t(i)");
            } catch (error) {
                original = error;
                throw error;
            }
        }).catch((error: unknown) => error);
        expect(original).toBeInstanceOf(Error);
        expect(failure).toBe(original);
        expect(failure).not.toBeInstanceOf(AggregateError);
        expect(failure).toHaveProperty("message", expect.stringContaining("Out of Memory"));
        expect(await queryAll(db.conn, "SELECT * FROM transaction_probe")).toEqual([]);
        await withTransaction(db.conn, () =>
            db.conn.run("INSERT INTO transaction_probe VALUES (2)"),
        );
        expect(await queryAll(db.conn, "SELECT * FROM transaction_probe")).toEqual([{ id: 2 }]);
    } finally {
        await db.close();
    }
});
