// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the upstream API field names.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createClient } from "../../../packages/poe-api-client/src/client.ts";
import { ingestCx } from "../../../packages/poe-stash-ingest/src/cx/ingest.ts";
import { getCursor } from "../../../packages/poe-stash-ingest/src/shared/cursor.ts";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db.ts";
import { prune } from "../../../packages/poe-stash-ingest/src/shared/prune.ts";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: undefined }));

let db;
let directory;
beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "poe-ingest-test-"));
    db = await openDb(join(directory, "data.duckdb"));
});
afterEach(async () => {
    await db?.close();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllGlobals();
});

async function seedListing() {
    await db.conn.run(`INSERT INTO ps_listing (
        account_name, stash_id, item_id, league, item_key, identified, frame_type,
        type_line, base_type, raw_item, first_seen_at, last_seen_at
    ) VALUES ('seller', 'stash', 'item', 'Standard', 'Headhunter', TRUE, 3,
        'Leather Belt', 'Leather Belt', '{}', current_timestamp, current_timestamp)`);
}

it("bootstraps hourly observations from an existing database once", async () => {
    await seedListing();
    await db.conn.run("DROP TABLE ps_listing_hour");
    await db.close();
    db = await openDb(join(directory, "data.duckdb"));
    expect(await queryAll(db.conn, "SELECT item_id FROM ps_listing_hour")).toEqual([
        { item_id: "item" },
    ]);
    await db.close();
    db = await openDb(join(directory, "data.duckdb"));
    expect(await queryAll(db.conn, "SELECT item_id FROM ps_listing_hour")).toHaveLength(1);
});

it("prunes old delivered observations while retaining pending, unmapped and recent ones", async () => {
    await seedListing();
    await db.conn.run(`INSERT INTO ps_listing_hour
        SELECT * EXCLUDE (removed_at, raw_item),
               epoch(date_trunc('hour', last_seen_at))::BIGINT AS observed_hour
        FROM ps_listing`);
    await db.conn.run(`INSERT INTO ps_listing_hour
        SELECT * REPLACE ('delivered' AS item_id, observed_hour - 40 * 86400 AS observed_hour,
            last_seen_at - INTERVAL 40 DAY AS last_seen_at) FROM ps_listing_hour WHERE item_id = 'item'`);
    await db.conn.run(`INSERT INTO ps_listing_hour
        SELECT * REPLACE ('pending' AS item_id, 'Other' AS league) FROM ps_listing_hour WHERE item_id = 'delivered'`);
    await db.conn.run(`INSERT INTO ps_listing_hour
        SELECT * REPLACE ('unmapped' AS item_id, FALSE AS identified) FROM ps_listing_hour WHERE item_id = 'delivered'`);
    await db.conn.run(`INSERT INTO rollup_state
        SELECT 'psapi', league, observed_hour, current_timestamp, 1 FROM ps_listing_hour WHERE item_id = 'delivered'`);
    expect(await prune(db.conn, { keepDays: 30, maxRows: 100, dryRun: true })).toMatchObject({
        droppedHourlyRows: 1,
    });
    expect(await queryAll(db.conn, "SELECT * FROM ps_listing_hour")).toHaveLength(4);
    expect(await prune(db.conn, { keepDays: 30, maxRows: 100 })).toMatchObject({
        droppedHourlyRows: 1,
    });
    expect(await queryAll(db.conn, "SELECT item_id FROM ps_listing_hour ORDER BY item_id")).toEqual(
        [{ item_id: "item" }, { item_id: "pending" }, { item_id: "unmapped" }],
    );
});

it("rolls back currency rows and the cursor when a later market fails", async () => {
    const market = {
        league: "Standard",
        market_id: "chaos|divine",
        lowest_ratio: {},
        highest_ratio: {},
        volume_traded: {},
        lowest_stock: {},
        highest_stock: {},
    };
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
            Response.json({
                next_change_id: 7200,
                markets: [market, { ...market, league: null }],
            }),
        ),
    );
    const client = createClient({ token: "inert-token", userAgent: "ingest-test" });
    await expect(ingestCx(db.conn, client, { fromHour: 3600, catchUp: false })).rejects.toThrow();
    expect(await queryAll(db.conn, "SELECT * FROM cx_market_hour")).toEqual([]);
    expect(await getCursor(db.conn, "cxapi")).toBeUndefined();
});
