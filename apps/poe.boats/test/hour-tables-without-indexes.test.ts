// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { PublicStashChange } from "../../../packages/poe-api-client/src/types";
import {
    captureEquipment,
    type EquipmentClassifier,
} from "../../../packages/poe-stash-ingest/src/ps/equipment";
import { applyStashChanges } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { type DbHandle, openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

// The hour tables keep no indexes: their inserts must still keep one row per listing or item and
// hour, and an index left by an older version is dropped when the database opens.
const HOUR = Date.UTC(2026, 9, 28, 10) / 1000;
const at = (minute: number) => new Date((HOUR + minute * 60) * 1000);
type Item = PublicStashChange["items"][number];
const armour = (note: string) =>
    ({
        id: "armour-1",
        verified: true,
        w: 2,
        h: 3,
        icon: "",
        name: "",
        typeLine: "Necrotic Armour",
        baseType: "Necrotic Armour",
        ilvl: 85,
        identified: true,
        frameType: 2,
        explicitMods: ["+100 to maximum Life"],
        note,
    }) as Item;
const stash = (league: string, note: string) =>
    ({
        id: "stash-1",
        public: true,
        accountName: "seller",
        league,
        stashType: "TradeStash",
        items: [armour(note)],
    }) as PublicStashChange;
const classifier = {
    manifest: { revision: "revision-1", game: "poe1", cohorts: [] },
    definition: (id: string) => ({ id, revision: "revision-1" }),
    acceptsBase: () => true,
    classify: () => ({ matches: ["cohort-1"], unknown: [] as string[] }),
} as unknown as EquipmentClassifier;

let db: DbHandle;
let dir: string | undefined;
beforeEach(async () => {
    db = await openDb(":memory:");
});
afterEach(async () => {
    await db.close();
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
});

const hourRows = (table: string) =>
    queryAll(db.conn, `SELECT league, price_amount AS price FROM ${table} ORDER BY ALL`);

it("keeps one hour row per listing and item, and follows a change of league", async () => {
    for (const [minute, league, note] of [
        [5, "Standard", "~price 10 chaos"],
        [10, "Standard", "~price 12 chaos"],
        [15, "Hardcore", "~price 14 chaos"],
    ] as const) {
        await applyStashChanges(db.conn, [stash(league, note)], at(minute));
        await captureEquipment(db.conn, stash(league, note), classifier, at(minute));
    }
    for (const table of ["ps_listing_hour", "ps_equipment_hour"])
        expect(await hourRows(table)).toEqual([{ league: "Hardcore", price: 14 }]);
});

it("drops the hour tables' indexes from a database created with them", async () => {
    dir = await mkdtemp(join(tmpdir(), "hour-indexes-"));
    const path = join(dir, "old.duckdb");
    await db.close();
    db = await openDb(path);
    await db.conn.run(`CREATE UNIQUE INDEX ps_listing_hour_pk
        ON ps_listing_hour(account_name, stash_id, item_id, observed_hour)`);
    await db.conn.run(
        "CREATE INDEX ps_listing_hour_time ON ps_listing_hour(observed_hour, league)",
    );
    await db.conn.run(`CREATE UNIQUE INDEX ps_equipment_hour_pk
        ON ps_equipment_hour(account_name, item_id, revision, observed_hour)`);
    await db.conn.run(
        "CREATE INDEX ps_equipment_hour_time ON ps_equipment_hour(observed_hour, league)",
    );
    await db.close();

    db = await openDb(path);
    expect(
        await queryAll(
            db.conn,
            `SELECT index_name FROM duckdb_indexes()
            WHERE table_name IN ('ps_listing_hour', 'ps_equipment_hour')`,
        ),
    ).toEqual([]);
});
