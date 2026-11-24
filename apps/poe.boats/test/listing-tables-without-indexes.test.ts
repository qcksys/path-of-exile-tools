import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { type DbHandle, openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

// The worker finds listing, sale and equipment rows by its own IDs, through joins no index serves.
// On DuckDB 2.0 their indexes held most of its memory limit, so they are dropped, and the two
// primary keys DuckDB cannot drop are rebuilt away when an older database opens.
let dir: string;
let db: DbHandle | undefined;
beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "listing-indexes-"));
});
afterEach(async () => {
    await db?.close();
    db = undefined;
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
});

const TABLES = "('ps_listing', 'ps_sale', 'ps_equipment_listing', 'ps_capture_page')";

async function addListing(handle: DbHandle, id: string) {
    await handle.conn.run(
        `INSERT INTO ps_listing BY NAME SELECT 'seller' AS account_name, 'stash-1' AS stash_id,
            $1 AS item_id, 'Standard' AS league, 'key' AS item_key, TRUE AS identified,
            3 AS frame_type, 'Belt' AS type_line, 'Belt' AS base_type, '{}'::JSON AS raw_item,
            TIMESTAMP '2026-11-24 10:00:00' AS first_seen_at,
            TIMESTAMP '2026-11-24 10:00:00' AS last_seen_at, 1 AS listing_id`,
        [id],
    );
}

it("drops the listing tables' indexes and rebuilds their primary keys away, keeping every row", async () => {
    const path = join(dir, "market.duckdb");
    db = await openDb(path);
    // As a database written before: both primary keys and every index.
    await db.conn.run(`ALTER TABLE ps_listing ADD PRIMARY KEY (account_name, stash_id, item_id);
        CREATE INDEX ps_listing_stash ON ps_listing(stash_id);
        CREATE UNIQUE INDEX ps_sale_pk ON ps_sale(league, account_name, stash_id, item_id, removed_at);
        ALTER TABLE ps_equipment_listing ADD PRIMARY KEY (account_name, item_id);
        CREATE INDEX ps_equipment_stash ON ps_equipment_listing(stash_id);
        CREATE INDEX ps_equipment_item ON ps_equipment_listing(item_id);
        CREATE INDEX ps_capture_page_time ON ps_capture_page(captured_at)`);
    await addListing(db, "item-1");
    await db.conn.run(`INSERT INTO ps_equipment_listing BY NAME SELECT 'seller' AS account_name,
        'item-2' AS item_id, 'stash-1' AS stash_id, 'Standard' AS league, 'r1' AS revision,
        '["base"]'::JSON AS matches, '[]'::JSON AS unknown_matches, '{}'::JSON AS raw_item,
        TIMESTAMP '2026-11-24 10:00:00' AS last_seen_at, 7 AS equipment_id`);
    await db.close();

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    db = await openDb(path);
    expect(log.mock.calls.map(([line]) => String(line).replace(/ in [\d.]+ s$/, ""))).toEqual([
        "rebuilt ps_listing without its primary key",
        "rebuilt ps_equipment_listing without its primary key",
    ]);
    expect(
        await queryAll(
            db.conn,
            `SELECT index_name FROM duckdb_indexes() WHERE table_name IN ${TABLES}`,
        ),
    ).toEqual([]);
    expect(
        await queryAll(
            db.conn,
            `SELECT table_name AS "table", constraint_type AS "type" FROM duckdb_constraints()
            WHERE table_name IN ${TABLES} AND constraint_type IN ('PRIMARY KEY', 'UNIQUE') ORDER BY 1`,
        ),
    ).toEqual([{ table: "ps_capture_page", type: "PRIMARY KEY" }]);
    expect(
        await queryAll(
            db.conn,
            `SELECT (SELECT item_id FROM ps_listing) AS listing, (SELECT listing_id FROM ps_listing)::INTEGER AS "listingId",
                (SELECT equipment_id FROM ps_equipment_listing)::INTEGER AS equipment`,
        ),
    ).toEqual([{ listing: "item-1", listingId: 1, equipment: 7 }]);

    // The rebuilt table keeps its defaults and NOT NULLs.
    await addListing(db, "item-3");
    expect(
        await queryAll(db.conn, "SELECT corrupted, links FROM ps_listing WHERE item_id = 'item-3'"),
    ).toEqual([{ corrupted: false, links: 0 }]);
    await expect(addListing(db, null as unknown as string)).rejects.toThrow(/NOT NULL/);

    // Nothing is rebuilt again.
    await db.close();
    log.mockClear();
    db = await openDb(path);
    expect(log).not.toHaveBeenCalled();
});
