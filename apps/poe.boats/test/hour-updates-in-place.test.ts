// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve upstream field names.
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { PublicStashChange } from "../../../packages/poe-api-client/src/types";
import {
    captureEquipment,
    type EquipmentClassifier,
} from "../../../packages/poe-stash-ingest/src/ps/equipment";
import { applyStashChanges } from "../../../packages/poe-stash-ingest/src/ps/ingest";
import { type DbHandle, openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

// DuckDB rewrites a row when an UPDATE sets one of its indexed columns, even to the same value,
// and keeps the old copy, so a row that keeps its row ID was updated in place.
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
const stash = (id: string, item: Item) =>
    ({
        id,
        public: true,
        accountName: "seller",
        league: "Standard",
        stashType: "TradeStash",
        items: [item],
    }) as PublicStashChange;
const classifier = {
    manifest: { revision: "revision-1", game: "poe1", cohorts: [] },
    definition: (id: string) => ({ id, revision: "revision-1" }),
    acceptsBase: () => true,
    classify: () => ({ matches: ["cohort-1"], unknown: [] as string[] }),
} as unknown as EquipmentClassifier;

let db: DbHandle;
beforeEach(async () => {
    db = await openDb(":memory:");
});
afterEach(async () => {
    await db.close();
});

const one = async <T>(sql: string) => (await queryAll<T>(db.conn, sql))[0];

it("refreshes a listing's hour row in place when it is seen again within the hour", async () => {
    await applyStashChanges(db.conn, [stash("stash-1", armour("~price 10 chaos"))], at(5));
    const before = await one<{ rowId: string }>(
        `SELECT rowid::VARCHAR AS "rowId" FROM ps_listing_hour WHERE item_id = 'armour-1'`,
    );
    await applyStashChanges(db.conn, [stash("stash-1", armour("~price 12 chaos"))], at(10));
    expect(
        await one(
            `SELECT rowid::VARCHAR AS "rowId", price_amount AS price FROM ps_listing_hour WHERE item_id = 'armour-1'`,
        ),
    ).toEqual({ ...before, price: 12 });
});

it("refreshes re-sent equipment and its hour row in place", async () => {
    await captureEquipment(db.conn, stash("stash-1", armour("~price 10 chaos")), classifier, at(5));
    const rows = () =>
        one<{ listing: string; hour: string; price: number }>(
            `SELECT l.rowid::VARCHAR AS listing, h.rowid::VARCHAR AS hour, h.price_amount AS price
            FROM ps_equipment_listing l JOIN ps_equipment_hour h USING (account_name, item_id)`,
        );
    const before = await rows();
    await captureEquipment(
        db.conn,
        stash("stash-1", armour("~price 12 chaos")),
        classifier,
        at(10),
    );
    expect(await rows()).toEqual({ ...before, price: 12 });
});

it("moves equipment that changed stash to its new stash", async () => {
    await captureEquipment(db.conn, stash("stash-1", armour("~price 10 chaos")), classifier, at(5));
    await captureEquipment(
        db.conn,
        stash("stash-2", armour("~price 10 chaos")),
        classifier,
        at(10),
    );
    expect(
        await queryAll(
            db.conn,
            `SELECT l.stash_id AS listing, h.stash_id AS hour
            FROM ps_equipment_listing l JOIN ps_equipment_hour h USING (account_name, item_id)`,
        ),
    ).toEqual([{ listing: "stash-2", hour: "stash-2" }]);
});
