import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { PublicStashChange } from "../../../packages/poe-api-client/src/types";
import {
    captureEquipment,
    type EquipmentClassifier,
} from "../../../packages/poe-stash-ingest/src/ps/equipment";
import { type DbHandle, openDb } from "../../../packages/poe-stash-ingest/src/shared/db";

type Item = PublicStashChange["items"][number];
const armour = (overrides: Partial<Item> = {}) =>
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
        inventoryId: "Stash1",
        x: 0,
        y: 0,
        ...overrides,
    }) as Item;
const stash = (item: Item) =>
    ({
        id: "stash-1",
        public: true,
        accountName: "seller",
        league: "Standard",
        stash: "~price 1 chaos",
        stashType: "TradeStash",
        items: [item],
    }) as PublicStashChange;

let db: DbHandle;
beforeEach(async () => {
    db = await openDb(":memory:");
});
afterEach(async () => {
    await db.close();
});

it("classifies a re-sent unchanged item once and a changed item again", async () => {
    const classify = vi.fn(() => ({ matches: ["cohort-1"], unknown: [] as string[] }));
    const classifier = {
        manifest: { revision: "revision-1", game: "poe1", cohorts: [] },
        definition: (id: string) => ({ id, revision: "revision-1" }),
        acceptsBase: () => true,
        classify,
    } as unknown as EquipmentClassifier;

    await captureEquipment(db.conn, stash(armour()), classifier, new Date(3_600_000));
    // A re-sent stash moves its items to another inventory slot without changing them.
    await captureEquipment(
        db.conn,
        stash(armour({ inventoryId: "Stash9", x: 6 })),
        classifier,
        new Date(3_660_000),
    );
    expect(classify).toHaveBeenCalledOnce();

    await captureEquipment(
        db.conn,
        stash(armour({ explicitMods: ["+100 to maximum Life", "+30% to Cold Resistance"] })),
        classifier,
        new Date(3_720_000),
    );
    expect(classify).toHaveBeenCalledTimes(2);
});
