// biome-ignore-all lint/style/useNamingConvention: Archive results are keyed by DuckDB table names.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { archiveOldData } from "../../../packages/poe-stash-ingest/src/shared/archive";
import { type DbHandle, openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

const DAY = 86400;
const NOW = new Date("2026-11-20T12:00:00Z");
const TODAY = Date.parse("2026-11-20T00:00:00Z") / 1000;
const OLD = TODAY - 40 * DAY;
const RECENT = TODAY - DAY;
const at = (seconds: number) => new Date(seconds * 1000).toISOString();

let db: DbHandle;
let dir: string;

beforeEach(async () => {
    db = await openDb(":memory:");
    dir = await mkdtemp(join(tmpdir(), "ingest-archive-"));
});
afterEach(async () => {
    await db.close();
    await rm(dir, { recursive: true, force: true });
});

async function listing(item: string, hour: number, removed: number | null) {
    await db.conn.run(
        `INSERT INTO ps_listing BY NAME SELECT 'seller' AS account_name, 'stash' AS stash_id,
            $1 AS item_id, 'Season' AS league, 'Headhunter' AS item_key, TRUE AS identified,
            3 AS frame_type, 'Leather Belt' AS type_line, 'Leather Belt' AS base_type,
            '{}'::JSON AS raw_item, '' AS signature_value, $2::TIMESTAMP AS first_seen_at,
            $2::TIMESTAMP AS last_seen_at, $3::TIMESTAMP AS removed_at`,
        [item, at(hour + 60), removed === null ? null : at(removed)],
    );
    await db.conn.run(
        `INSERT INTO ps_listing_hour BY NAME SELECT * EXCLUDE (removed_at, raw_item), $2 AS observed_hour
        FROM ps_listing WHERE item_id = $1`,
        [item, hour],
    );
}

async function delivered(stream: string, hour: number, pushedAt: number) {
    await db.conn.run("INSERT INTO rollup_state VALUES ($1, 'Season', $2, $3::TIMESTAMP, 1)", [
        stream,
        hour,
        at(pushedAt),
    ]);
}

async function page(id: string, capturedAt: number, hash: string, processed: boolean) {
    await db.conn.run(
        `INSERT INTO ps_capture_page VALUES ($1, 'pc', 'Season', NULL, 'next', $2, $3,
            ${processed ? "current_timestamp" : "NULL"}, NULL)`,
        [id, capturedAt * 1000, hash],
    );
}

async function payload(hash: string) {
    await db.conn.run("INSERT INTO ps_capture_payload_meta VALUES ($1, 10, 4, 1)", [hash]);
    await db.conn.run("INSERT INTO ps_capture_payload_chunk VALUES ($1, 0, 'gzip'::BLOB)", [hash]);
}

const remaining = async (table: string, column: string) =>
    (
        await queryAll<Record<string, string>>(
            db.conn,
            `SELECT ${column} AS v FROM ${table} ORDER BY 1`,
        )
    ).map((row) => row.v);

const archived = async (day: string, table: string, column: string) =>
    (
        await queryAll<Record<string, string>>(
            db.conn,
            `SELECT ${column} AS v FROM read_parquet('${join(dir, day, `${table}-*.parquet`).replaceAll("\\", "/")}') ORDER BY 1`,
        )
    ).map((row) => row.v);

it("moves old delivered rows to daily Parquet files and keeps what the pipeline still needs", async () => {
    const day = at(OLD).slice(0, 10);
    await listing("sold", OLD, OLD + 600);
    await db.conn.run(
        `INSERT INTO ps_sale BY NAME SELECT * EXCLUDE (raw_item), 'likely-sold' AS status,
            NULL::TIMESTAMP AS eligible_since, 10.0 AS market_price, 3 AS market_sellers,
            $1::TIMESTAMP AS updated_at FROM ps_listing WHERE item_id = 'sold'`,
        [at(OLD + 900)],
    );
    await delivered("psapi", OLD, OLD + 3600);
    // Changed after its delivery, so a later rollup still needs it.
    await listing("undelivered", OLD + 3600, null);
    await delivered("psapi", OLD + 3600, OLD + 3000);
    await listing("active", RECENT, null);
    await delivered("psapi", RECENT, RECENT + 3600);

    await payload("only-old");
    await payload("shared");
    await page("old-page", OLD + 10, "only-old", true);
    await page("old-shared", OLD + 20, "shared", true);
    await page("recent-shared", RECENT, "shared", true);
    await page("unprocessed", OLD + 30, "shared", false);

    await db.conn.run(
        "INSERT INTO cx_market_hour VALUES ('Season', 'chaos|divine', $1, '{}', '{}', '{}', '{}', '{}')",
        [OLD],
    );
    await delivered("cxapi", OLD, OLD + 3600);

    const result = await archiveOldData(db.conn, {
        dir,
        keepDays: 30,
        maxBytes: Number.MAX_SAFE_INTEGER,
        maxDays: 5,
        now: NOW,
    });

    expect(result.days).toEqual([day]);
    expect(result.rows).toEqual({
        ps_capture_page: 2,
        ps_listing_hour: 1,
        ps_sale: 1,
        ps_listing: 1,
        cx_market_hour: 1,
        ps_capture_payload_meta: 1,
        ps_capture_payload_chunk: 1,
    });
    expect(await archived(day, "ps_sale", "status")).toEqual(["likely-sold"]);
    expect(await archived(day, "ps_listing_hour", "item_id")).toEqual(["sold"]);
    expect(await archived(day, "ps_capture_payload_meta", "response_hash")).toEqual(["only-old"]);
    expect(await remaining("ps_listing", "item_id")).toEqual(["active", "undelivered"]);
    expect(await remaining("ps_listing_hour", "item_id")).toEqual(["active", "undelivered"]);
    expect(await remaining("ps_capture_page", "id")).toEqual(["recent-shared", "unprocessed"]);
    expect(await remaining("ps_capture_payload_meta", "response_hash")).toEqual(["shared"]);
    expect(await remaining("ps_sale", "item_id")).toEqual([]);

    const again = await archiveOldData(db.conn, {
        dir,
        keepDays: 30,
        maxBytes: Number.MAX_SAFE_INTEGER,
        now: NOW,
    });
    expect(again.days).toEqual([]);
});

it("archives younger days only while the database is over its size cap", async () => {
    // An in-memory database reports no used blocks.
    await db.close();
    db = await openDb(join(dir, "size.duckdb"));
    const archive = join(dir, "archive");
    await listing("five-days", TODAY - 5 * DAY, TODAY - 5 * DAY + 60);
    await listing("two-days", TODAY - 2 * DAY, TODAY - 2 * DAY + 60);
    await db.conn.run("CHECKPOINT");
    const options = { dir: archive, keepDays: 30, maxDays: 5, now: NOW };

    expect(
        (await archiveOldData(db.conn, { ...options, maxBytes: Number.MAX_SAFE_INTEGER })).days,
    ).toEqual([]);
    const result = await archiveOldData(db.conn, { ...options, maxBytes: 0 });

    expect(result.days).toEqual([at(TODAY - 5 * DAY).slice(0, 10)]);
    expect(await remaining("ps_listing", "item_id")).toEqual(["two-days"]);
    expect(await readdir(archive)).toEqual([at(TODAY - 5 * DAY).slice(0, 10)]);
});
