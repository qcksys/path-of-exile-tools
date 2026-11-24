// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the public-stash wire format.
import { expect, it, vi } from "vite-plus/test";
import type { PublicStashChange } from "../../../packages/poe-api-client/src/types";
import { defaultEquipmentClassifier } from "../../../packages/poe-stash-ingest/src/ps/equipment";
import { EquipmentBatch } from "../../../packages/poe-stash-ingest/src/ps/equipment-batch";
import { loadEquipmentState } from "../../../packages/poe-stash-ingest/src/ps/equipment-state";
import { ListingBatch } from "../../../packages/poe-stash-ingest/src/ps/listing-batch";
import { loadListingState } from "../../../packages/poe-stash-ingest/src/ps/listing-state";
import { openDb, queryAll } from "../../../packages/poe-stash-ingest/src/shared/db";
import { assertUniqueKeys } from "../../../packages/poe-stash-ingest/src/shared/unique-keys";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth", () => ({ REALM: undefined }));

// The listing, sale and equipment tables keep no keys, so a batch refuses, before it commits, to
// store a key twice. The worker's state only falls out of step with a table when something else
// writes it, as these rows written behind its back do.
type Item = PublicStashChange["items"][number];
const AT = Date.UTC(2026, 10, 24, 10, 20) * 1000;
const HOUR = Math.floor(AT / 3_600_000_000) * 3_600_000_000;
const stash = (id: string, account: string, items: Item[]) =>
    ({
        id,
        public: true,
        accountName: account,
        league: "Standard",
        stash: "Sales",
        stashType: "TradeStash",
        items,
    }) as PublicStashChange;

it("refuses a batch that would store a listing's key twice", async () => {
    const db = await openDb(":memory:");
    try {
        const state = await loadListingState(db.conn);
        await db.conn.run(`INSERT INTO ps_listing BY NAME SELECT 'seller' AS account_name,
            'stash-1' AS stash_id, 'belt-1' AS item_id, 'Standard' AS league, 'Headhunter' AS item_key,
            TRUE AS identified, 3 AS frame_type, 'Leather Belt' AS type_line,
            'Leather Belt' AS base_type, '{}'::JSON AS raw_item,
            TIMESTAMP '2026-11-24 09:00:00' AS first_seen_at,
            TIMESTAMP '2026-11-24 09:00:00' AS last_seen_at, 999 AS listing_id`);
        await db.conn.run("BEGIN TRANSACTION");
        const batch = await ListingBatch.open(db.conn, state, HOUR);
        batch.applyPage(
            [
                stash("stash-1", "seller", [
                    {
                        id: "belt-1",
                        verified: true,
                        w: 1,
                        h: 1,
                        icon: "",
                        name: "Headhunter",
                        typeLine: "Leather Belt",
                        baseType: "Leather Belt",
                        identified: true,
                        rarity: "Unique",
                        frameType: 3,
                        note: "~price 5 chaos",
                    } as Item,
                ]),
            ],
            AT,
        );
        await expect(batch.flush(db.conn)).rejects.toThrow(
            'ps_listing would hold a duplicate key (account_name, stash_id, item_id): {"account_name":"seller","stash_id":"stash-1","item_id":"belt-1","copies":2}',
        );
        await db.conn.run("ROLLBACK");
        expect(await queryAll(db.conn, "SELECT listing_id::INTEGER AS id FROM ps_listing")).toEqual(
            [{ id: 999 }],
        );
    } finally {
        await db.close();
    }
});

it("refuses a batch that would store an equipment row's key twice", async () => {
    const classifier = await defaultEquipmentClassifier();
    const db = await openDb(":memory:");
    try {
        const state = await loadEquipmentState(db.conn);
        await db.conn.run(`INSERT INTO ps_equipment_listing BY NAME SELECT 'seller' AS account_name,
            'vest-1' AS item_id, 'stash-1' AS stash_id, 'Standard' AS league, 'r1' AS revision,
            '[]'::JSON AS matches, '[]'::JSON AS unknown_matches, '{}'::JSON AS raw_item,
            TIMESTAMP '2026-11-24 09:00:00' AS last_seen_at, 999 AS equipment_id`);
        await db.conn.run("BEGIN TRANSACTION");
        const batch = new EquipmentBatch(state, HOUR / 1e6);
        const captured = batch.applyPage(
            [
                stash("stash-1", "seller", [
                    {
                        id: "vest-1",
                        verified: true,
                        w: 2,
                        h: 2,
                        icon: "",
                        name: "Doom Shell",
                        typeLine: "Plate Vest",
                        baseType: "Plate Vest",
                        ilvl: 84,
                        identified: true,
                        frameType: 2,
                        explicitMods: ["+80 to maximum Life", "+40% to Fire Resistance"],
                        note: "~price 5 chaos",
                    } as Item,
                ]),
            ],
            classifier,
            new Date(AT / 1000),
        );
        expect(captured).toBe(1);
        await expect(batch.flush(db.conn)).rejects.toThrow(
            'ps_equipment_listing would hold a duplicate key (account_name, item_id): {"account_name":"seller","item_id":"vest-1","copies":2}',
        );
        await db.conn.run("ROLLBACK");
        expect(
            await queryAll(db.conn, "SELECT equipment_id::INTEGER AS id FROM ps_equipment_listing"),
        ).toEqual([{ id: 999 }]);
    } finally {
        await db.close();
    }
}, 60_000);

it("finds a sale recorded twice by the key ps_sale_pk held", async () => {
    const db = await openDb(":memory:");
    try {
        const sale = (item: string) =>
            db.conn.run(`INSERT INTO ps_sale BY NAME SELECT 'Standard' AS league, 'seller' AS account_name,
                'stash-1' AS stash_id, '${item}' AS item_id, 'key' AS item_key, TRUE AS identified,
                3 AS frame_type, 'Belt' AS type_line, 'Belt' AS base_type,
                TIMESTAMP '2026-11-24 09:00:00' AS first_seen_at, TIMESTAMP '2026-11-24 09:30:00' AS last_seen_at,
                TIMESTAMP '2026-11-24 10:00:00' AS removed_at, 'pending' AS status,
                current_timestamp::TIMESTAMP AS updated_at`);
        const check = () =>
            assertUniqueKeys(
                db.conn,
                "ps_sale",
                ["league", "account_name", "stash_id", "item_id", "removed_at"],
                "SELECT league, account_name, stash_id, item_id, removed_at FROM ps_sale",
            );
        await sale("belt-1");
        await sale("belt-2");
        await check();
        await sale("belt-1");
        await expect(check()).rejects.toThrow(
            'ps_sale would hold a duplicate key (league, account_name, stash_id, item_id, removed_at): {"league":"Standard","account_name":"seller","stash_id":"stash-1","item_id":"belt-1","removed_at":"2026-11-24 10:00:00","copies":2}',
        );
    } finally {
        await db.close();
    }
});
