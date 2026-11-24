import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { compactDatabase } from "../../../packages/poe-stash-ingest/src/shared/compact";
import { type DbHandle, openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

// DuckDB 1.x reclaims rows deleted from a table with an index only once a whole row group of
// 122,880 rows is gone. Listings leave ps_listing in any order, so its file grew without bound.
// DuckDB 2.0's storage format lets a checkpoint compact such tables; older files need a copy.
// The smallest row group DuckDB allows, so a few row groups take little time to fill.
const ROW_GROUP = 2048;
let dir: string;
let db: DbHandle | undefined;
beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "database-compact-"));
});
afterEach(async () => {
    await db?.close();
    db = undefined;
    await rm(dir, { recursive: true, force: true });
});

async function addListings(handle: DbHandle, count: number) {
    await handle.conn.run(
        `INSERT INTO ps_listing BY NAME
        SELECT 'seller-' || (i % 500) AS account_name, 'stash-' || (i // 20) AS stash_id,
            'item-' || i AS item_id, 'Standard' AS league, 'key-' || (i % 1000) AS item_key,
            TRUE AS identified, 2 AS frame_type, 'Necrotic Armour' AS type_line,
            'Necrotic Armour' AS base_type, ('{"id":"item-' || i || '"}')::JSON AS raw_item,
            TIMESTAMP '2026-11-20 10:00:00' AS first_seen_at, TIMESTAMP '2026-11-20 10:00:00' AS last_seen_at,
            i AS listing_id
        FROM range($1) t(i)`,
        [count],
    );
}

const stored = async (handle: DbHandle, table: string) => {
    const [row] = await queryAll<{ stored: string; live: string }>(
        handle.conn,
        `SELECT (SELECT estimated_size FROM duckdb_tables()
                WHERE database_name = current_database() AND table_name = '${table}')::VARCHAR AS stored,
            (SELECT count(*) FROM ${table})::VARCHAR AS live`,
    );
    return { stored: Number(row?.stored), live: Number(row?.live) };
};

const storageVersion = async (handle: DbHandle) => {
    const [row] = await queryAll<{ version: string }>(
        handle.conn,
        "SELECT tags['storage_version'] AS version FROM duckdb_databases() WHERE database_name = current_database()",
    );
    return row?.version;
};

it("writes new database files in the format whose checkpoints compact indexed tables", async () => {
    db = await openDb(join(dir, "market.duckdb"));
    expect(await storageVersion(db)).toMatch(/^v2\./);
});

it("reclaims rows deleted out of order from the keyed listing table at a checkpoint", async () => {
    db = await openDb(":memory:");
    // The worker's schema, keys and index included, in a file with small row groups.
    await db.conn.run(
        `ATTACH '${join(dir, "small.duckdb")}' AS small (ROW_GROUP_SIZE ${ROW_GROUP})`,
    );
    await db.conn.run("COPY FROM DATABASE memory TO small");
    await db.conn.run("USE small");
    await addListings(db, 4 * ROW_GROUP);
    await db.conn.run("CHECKPOINT small");
    // Three of every four, so every row group keeps some listings.
    await db.conn.run("DELETE FROM ps_listing WHERE listing_id % 4 <> 0");
    await db.conn.run("CHECKPOINT small");
    const { stored: rows, live } = await stored(db, "ps_listing");
    expect(live).toBe(ROW_GROUP);
    expect(rows).toBeLessThan(2 * live);
    // The primary key still holds after its rows moved.
    await expect(addListings(db, 1)).rejects.toThrow(/Duplicate key|PRIMARY KEY|primary key/i);
});

it("copies an older-format database into the current format with the same rows, indexes and keys", async () => {
    const current = join(dir, "current.duckdb");
    const older = join(dir, "older.duckdb");
    const copy = join(dir, "copy.duckdb");
    db = await openDb(current);
    await addListings(db, 2_000);
    await db.conn.run("DELETE FROM ps_listing WHERE listing_id % 2 = 1");
    await db.close();
    db = undefined;
    // The worker's file was written by DuckDB 1.x: write one in that format to start from.
    const converter = await openDb(":memory:");
    await converter.conn.run(`ATTACH '${current}' AS current (READ_ONLY)`);
    await converter.conn.run(`ATTACH '${older}' AS older (STORAGE_VERSION 'v1.2.0')`);
    await converter.conn.run("COPY FROM DATABASE current TO older");
    await converter.close();

    const result = await compactDatabase(older, copy, { memoryLimit: "512MB", threads: "2" });
    expect(result.sourceStorage).toMatch(/^v1\.2/);
    expect(result.targetStorage).toMatch(/^v2\./);
    expect(result.tables).toContainEqual({ name: "ps_listing", rows: 1_000 });
    expect(result.tables.map((table) => table.name)).toContain("rollup_state");

    db = await openDb(copy);
    expect(await storageVersion(db)).toMatch(/^v2\./);
    expect(
        await queryAll(
            db.conn,
            "SELECT index_name AS name FROM duckdb_indexes() WHERE table_name = 'ps_listing' ORDER BY 1",
        ),
    ).toEqual([{ name: "ps_listing_stash" }]);
    await expect(addListings(db, 1)).rejects.toThrow(/Duplicate key|PRIMARY KEY|primary key/i);
});

it("refuses to write over an existing file", async () => {
    db = await openDb(join(dir, "market.duckdb"));
    await db.close();
    db = undefined;
    const existing = join(dir, "existing.duckdb");
    (await openDb(existing)).close();
    await expect(compactDatabase(join(dir, "market.duckdb"), existing)).rejects.toThrow(
        /already exists/,
    );
});
