// biome-ignore-all lint/style/useNamingConvention: Archive results are keyed by DuckDB table names.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import {
    archiveBehindStream,
    archiveSettings,
} from "../../../packages/poe-stash-ingest/src/shared/archive";
import { type DbHandle, openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

// A worker reading a capture process's archive measures age from the hour it is reading, so a
// backlog keeps the same window as a worker on time, and the wall clock does not matter.
const HOUR = 3600;
const STREAM = Date.parse("2026-11-15T17:00:00Z") / 1000;
const OLD = STREAM - 30 * HOUR;
const RECENT = STREAM - 10 * HOUR;
const at = (seconds: number) => new Date(seconds * 1000).toISOString();

let db: DbHandle;
let dir: string;
beforeEach(async () => {
    db = await openDb(":memory:");
    dir = await mkdtemp(join(tmpdir(), "archive-stream-"));
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
        `INSERT INTO ps_listing_hour BY NAME
        SELECT * EXCLUDE (removed_at, raw_item, content_digest, listing_id), $2 AS observed_hour
        FROM ps_listing WHERE item_id = $1`,
        [item, hour],
    );
}

const delivered = (hour: number, pushedAt: number) =>
    db.conn.run("INSERT INTO rollup_state VALUES ('psapi', 'Season', $1, $2::TIMESTAMP, 1)", [
        hour,
        at(pushedAt),
    ]);

const remaining = async (table: string) =>
    (await queryAll<{ v: string }>(db.conn, `SELECT item_id AS v FROM ${table} ORDER BY 1`)).map(
        (row) => row.v,
    );

it("moves delivered hours older than the window behind the stream, hour by hour", async () => {
    await listing("old-sold", OLD, OLD + 600);
    await delivered(OLD, OLD + HOUR);
    // Changed after its delivery, so a later rollup still needs it.
    await listing("old-undelivered", OLD + HOUR, null);
    await delivered(OLD + HOUR, OLD + 600);
    await listing("recent", RECENT, null);
    await delivered(RECENT, RECENT + HOUR);

    const result = await archiveBehindStream(db.conn, {
        dir,
        keepHours: 26,
        streamHour: STREAM,
        maxHours: 5,
        // Days after the data: only the stream position decides what is old.
        now: new Date((STREAM + 40 * 24 * HOUR) * 1000),
    });

    const hour = at(OLD).slice(0, 13);
    expect(result.hours).toEqual([hour]);
    expect(result.rows).toEqual({ ps_listing_hour: 1, ps_listing: 1 });
    expect(await remaining("ps_listing_hour")).toEqual(["old-undelivered", "recent"]);
    expect(await remaining("ps_listing")).toEqual(["old-undelivered", "recent"]);
    expect((await readdir(join(dir, hour.slice(0, 10)))).sort()).toEqual([
        expect.stringMatching(
            new RegExp(`^ps_listing-\\d{8}T\\d{6}Z-${hour.slice(11)}\\.parquet$`),
        ),
        expect.stringMatching(
            new RegExp(`^ps_listing_hour-\\d{8}T\\d{6}Z-${hour.slice(11)}\\.parquet$`),
        ),
    ]);
});

it("keeps everything inside the window, however old by the clock", async () => {
    await listing("sold", RECENT, RECENT + 600);
    await delivered(RECENT, RECENT + HOUR);
    const result = await archiveBehindStream(db.conn, {
        dir,
        keepHours: 26,
        streamHour: STREAM,
        now: new Date((STREAM + 40 * 24 * HOUR) * 1000),
    });
    expect(result.hours).toEqual([]);
    expect(await remaining("ps_listing_hour")).toEqual(["sold"]);
});

it("reads the window from PS_ARCHIVE_KEEP_HOURS and refuses one shorter than a day's replay", () => {
    const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;
    expect(archiveSettings(env({ PS_ARCHIVE_DIR: "/a" }))?.keepHours).toBeUndefined();
    expect(
        archiveSettings(env({ PS_ARCHIVE_DIR: "/a", PS_ARCHIVE_KEEP_HOURS: "26" }))?.keepHours,
    ).toBe(26);
    expect(() =>
        archiveSettings(env({ PS_ARCHIVE_DIR: "/a", PS_ARCHIVE_KEEP_HOURS: "12" })),
    ).toThrow("PS_ARCHIVE_KEEP_HOURS");
});
