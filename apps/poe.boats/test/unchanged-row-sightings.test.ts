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

// A re-sent item whose content is unchanged only has its sighting recorded, so its stored JSON
// keeps the position it was first written with; a changed item is written in full.
const HOUR = Date.UTC(2026, 9, 28, 10) / 1000;
const at = (minute: number) => new Date((HOUR + minute * 60) * 1000);
type Item = PublicStashChange["items"][number];
const armour = (x: number, note: string) =>
    ({
        id: "armour-1",
        verified: true,
        w: 2,
        h: 3,
        x,
        y: 0,
        inventoryId: `Stash${x}`,
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
const stash = (item: Item) =>
    ({
        id: "stash-1",
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

const stored = async (table: string) =>
    (
        await queryAll<{ x: number; price: number; seen: string; digest: string }>(
            db.conn,
            `SELECT (raw_item->>'x')::INT AS x, price_amount AS price,
                strftime(last_seen_at, '%H:%M') AS seen, content_digest AS digest
            FROM ${table} WHERE item_id = 'armour-1'`,
        )
    )[0]!;

it("records only the sighting of a re-sent listing whose content is unchanged", async () => {
    await applyStashChanges(db.conn, [stash(armour(0, "~price 10 chaos"))], at(5));
    const first = await stored("ps_listing");
    expect(first).toMatchObject({ x: 0, price: 10, seen: "10:05" });
    expect(first.digest).toEqual(expect.any(String));

    await applyStashChanges(db.conn, [stash(armour(4, "~price 10 chaos"))], at(10));
    expect(await stored("ps_listing")).toEqual({ ...first, seen: "10:10" });
    // The hour row still follows the sighting.
    expect(
        await queryAll(
            db.conn,
            "SELECT strftime(last_seen_at, '%H:%M') AS seen FROM ps_listing_hour WHERE item_id = 'armour-1'",
        ),
    ).toEqual([{ seen: "10:10" }]);
});

it("writes a re-sent listing in full when a derived column changed", async () => {
    await applyStashChanges(db.conn, [stash(armour(0, "~price 10 chaos"))], at(5));
    const first = await stored("ps_listing");
    await applyStashChanges(db.conn, [stash(armour(4, "~price 12 chaos"))], at(10));
    const second = await stored("ps_listing");
    expect(second).toMatchObject({ x: 4, price: 12, seen: "10:10" });
    expect(second.digest).not.toEqual(first.digest);
});

it("writes a listing stored without a digest in full once", async () => {
    await applyStashChanges(db.conn, [stash(armour(0, "~price 10 chaos"))], at(5));
    await db.conn.run("UPDATE ps_listing SET content_digest = NULL");
    await applyStashChanges(db.conn, [stash(armour(4, "~price 10 chaos"))], at(10));
    const second = await stored("ps_listing");
    expect(second).toMatchObject({ x: 4, seen: "10:10" });
    expect(second.digest).toEqual(expect.any(String));
});

it("records only the sighting of re-sent equipment whose content is unchanged", async () => {
    await captureEquipment(db.conn, stash(armour(0, "~price 10 chaos")), classifier, at(5));
    const first = await stored("ps_equipment_listing");
    expect(first).toMatchObject({ x: 0, price: 10, seen: "10:05" });

    await captureEquipment(db.conn, stash(armour(4, "~price 10 chaos")), classifier, at(10));
    expect(await stored("ps_equipment_listing")).toEqual({ ...first, seen: "10:10" });

    await captureEquipment(db.conn, stash(armour(6, "~price 12 chaos")), classifier, at(15));
    const third = await stored("ps_equipment_listing");
    expect(third).toMatchObject({ x: 6, price: 12, seen: "10:15" });
    expect(third.digest).not.toEqual(first.digest);
    expect(
        await queryAll(
            db.conn,
            "SELECT price_amount AS price, strftime(last_seen_at, '%H:%M') AS seen FROM ps_equipment_hour",
        ),
    ).toEqual([{ price: 12, seen: "10:15" }]);
});
