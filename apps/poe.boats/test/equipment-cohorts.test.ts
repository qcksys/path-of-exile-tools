// biome-ignore-all lint/style/useNamingConvention: Fixtures preserve the public-stash wire format.

import { readFileSync } from "node:fs";
import {
    compileMarketCohorts,
    marketCohortManifestSchema,
    selectCohortPrice,
} from "@poe-tools/market";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { PublicStashChange } from "../../../packages/poe-api-client/src/types";
import {
    captureEquipment,
    defaultEquipmentClassifier,
} from "../../../packages/poe-stash-ingest/src/ps/equipment";
import { pruneEquipment } from "../../../packages/poe-stash-ingest/src/ps/equipment-prune";
import { equipmentHourly } from "../../../packages/poe-stash-ingest/src/ps/equipment-rollup";
import {
    type DbHandle,
    openDb,
    queryAll,
    withTransaction,
} from "../../../packages/poe-stash-ingest/src/shared/db";

vi.mock("../../../packages/poe-stash-ingest/src/shared/auth.ts", () => ({ REALM: undefined }));
const HOUR = 1_790_899_200;
const classifier = compileMarketCohorts(
    marketCohortManifestSchema.parse({
        format: 1,
        game: "poe1",
        revision: "test-v1",
        catalogHash: "a".repeat(64),
        cohorts: [
            {
                id: "base",
                name: "Base",
                purpose: "base",
                query: {
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: ["Necrotic Armour"] },
                                { kind: "range", field: "ilvl", value: { min: 84 } },
                                { kind: "flag", field: "corrupted", value: false },
                            ],
                        },
                    ],
                },
            },
            {
                id: "links",
                name: "Links",
                purpose: "base",
                query: {
                    game: "poe1",
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: ["Necrotic Armour"] },
                                { kind: "range", field: "links", value: { min: 6 } },
                            ],
                        },
                    ],
                },
            },
        ],
    }),
);
const item = {
    id: "one",
    verified: true,
    w: 2,
    h: 3,
    icon: "",
    name: "",
    typeLine: "Necrotic Armour",
    baseType: "Necrotic Armour",
    ilvl: 86,
    identified: true,
    frameType: 0,
    note: "~price 20 chaos",
    sockets: Array.from({ length: 6 }, () => ({ group: 0 })),
};
const stash: PublicStashChange = {
    id: "stash",
    public: true,
    accountName: "Seller",
    league: "Standard",
    stashType: "PremiumStash",
    items: [item],
};
let db: DbHandle;
beforeEach(async () => {
    db = await openDb(":memory:");
});
afterEach(async () => {
    await db.close();
});

describe("equipment observation windows", () => {
    it("deduplicates before cohort matching and keeps the exact listing median, distinct sellers and unknowns", async () => {
        for (let offset = 0; offset < 24; offset++) {
            await capture({ ...stash, items: [item] }, HOUR + offset * 3600);
            await capture(
                {
                    ...stash,
                    accountName: `other-${offset}`,
                    id: `stash-${offset}`,
                    items: [{ ...item, id: `other-${offset}`, note: "~price 21 chaos" }],
                },
                HOUR + offset * 3600,
            );
        }
        // The repeat seller's older 23 listings must not outvote the other sellers.
        const row = (await equipmentHourly(db.conn, HOUR + 23 * 3600, "Standard"))[0]!;
        expect(row.prices.chaos).toMatchObject({
            count: 2,
            sellers: 2,
            median: 20.5,
            windows: {
                "6": {
                    count: 7,
                    sellers: 7,
                    median: 21,
                    hourlyMedianMin: 20.5,
                    hourlyMedianMax: 20.5,
                },
                "24": { count: 25, sellers: 25, median: 21 },
            },
        });
        expect(selectCohortPrice(row, "chaos", "adaptive-v1")?.hours).toBe(24);
        await capture({ ...stash, items: [{ ...item, sockets: undefined }] }, HOUR + 23 * 3600);
        const links = (await equipmentHourly(db.conn, HOUR + 23 * 3600, "Standard"))[1]!;
        expect(links.prices.chaos!.windows![24]).toMatchObject({
            count: 24,
            sellers: 24,
            unknownCount: 1,
        });
        await capture(
            { ...stash, items: [{ ...item, corrupted: true, sockets: [] }] },
            HOUR + 23 * 3600,
        );
        const base = (await equipmentHourly(db.conn, HOUR + 23 * 3600, "Standard"))[0]!;
        expect(base.prices.chaos!.windows![24]).toMatchObject({
            count: 24,
            sellers: 24,
            median: 21,
        });
    });
    it("requires all source hours, isolates leagues, preserves old hours, and invalidates dependent rollups", async () => {
        for (let offset = 0; offset < 6; offset++) await capture(stash, HOUR + offset * 3600);
        const latest = HOUR + 5 * 3600;
        const original = await equipmentHourly(db.conn, latest, "Standard");
        expect(original[0]!.prices.chaos!.windows![6]).toMatchObject({
            count: 1,
            sellers: 1,
            median: 20,
        });
        expect(original[0]!.prices.chaos!.windows![24]).toBeUndefined();
        await db.conn.run(
            "UPDATE ps_equipment_cohort_hour SET changed_at = TIMESTAMP '2020-01-01'",
        );
        await capture({ ...stash, items: [{ ...item, note: "~price 40 chaos" }] }, HOUR);
        const updated = await equipmentHourly(db.conn, latest, "Standard");
        expect(selectCohortPrice(updated[0]!, "chaos", "adaptive-v1")?.hours).toBe(1);
        expect((await equipmentHourly(db.conn, HOUR, "Standard"))[0]!.prices.chaos!.median).toBe(
            40,
        );
        expect(
            await queryAll(
                db.conn,
                `SELECT count(*)::INTEGER AS n FROM ps_equipment_cohort_hour
            WHERE hour = $1 AND changed_at > TIMESTAMP '2020-01-01'`,
                [latest],
            ),
        ).toEqual([{ n: 2 }]);
        await db.conn.run("DELETE FROM ps_equipment_hour WHERE observed_hour = $1", [HOUR + 3600]);
        await capture({ ...stash, league: "Other" }, HOUR + 3600);
        expect(
            (await equipmentHourly(db.conn, latest, "Standard"))[0]!.prices.chaos!.windows,
        ).toBeUndefined();
    });
    it("retains source hours until dependent wider summaries are acknowledged", async () => {
        const old = Math.floor(Date.now() / 3_600_000) * 3600 - 3 * 86400;
        for (let offset = 0; offset < 6; offset++) {
            await capture(stash, old + offset * 3600);
            if (offset < 5)
                await db.conn.run(
                    "INSERT INTO rollup_state VALUES ('equipment', 'Standard', $1, current_timestamp + INTERVAL 1 SECOND, 2)",
                    [old + offset * 3600],
                );
        }
        expect((await pruneEquipment(db.conn, { keepDays: 1, maxRows: 0 })).hourlyRows).toBe(0);
        await db.conn.run(
            "INSERT INTO rollup_state VALUES ('equipment', 'Standard', $1, current_timestamp + INTERVAL 1 SECOND, 2)",
            [old + 5 * 3600],
        );
        expect((await pruneEquipment(db.conn, { keepDays: 1, maxRows: 0 })).hourlyRows).toBe(6);
        expect(await equipmentHourly(db.conn, old + 5 * 3600, "Standard")).toEqual([]);
    });
});
const capture = (change: PublicStashChange, hour = HOUR) =>
    withTransaction(db.conn, () =>
        captureEquipment(db.conn, change, classifier, new Date(hour * 1000)),
    );

describe("equipment capture and hourly history", () => {
    it("prices an indistinguishable Temple family without attributing its listing to an exact ID", async () => {
        const curated = await defaultEquipmentClassifier();
        const label =
            "Slink Gloves, of Puhuarte: +(46-48)% to Cold Resistance; (30-50)% increased Damage with Hits against Chilled Enemies, 1 suffix";
        const exact = curated.manifest.cohorts.find((cohort) => cohort.name === label)!;
        const family = curated.manifest.cohorts.find(
            (cohort) => cohort.name === `${label}, display-equivalent family`,
        )!;
        const donor = {
            ...item,
            baseType: "Slink Gloves",
            typeLine: "Slink Gloves",
            frameType: 2,
            sockets: [],
            extended: { prefixes: 0, suffixes: 1 },
            explicitMods: [
                "+47% to Cold Resistance",
                "40% increased Damage with Hits against Chilled Enemies",
            ].map((description) => ({ description })),
        };
        await withTransaction(db.conn, () =>
            captureEquipment(db.conn, { ...stash, items: [donor] }, curated, new Date(HOUR * 1000)),
        );
        const rows = await equipmentHourly(db.conn, HOUR, "Standard");
        expect(rows.find((row) => row.cohortId === family.id)).toMatchObject({
            listingCount: 1,
            unknownCount: 0,
            prices: { chaos: { median: 20, count: 1 } },
        });
        expect(rows.find((row) => row.cohortId === exact.id)).toMatchObject({
            listingCount: 0,
            unknownCount: 1,
            prices: {},
        });
    });

    it("prices a catalyst-scaled fracture without including an unscaled interpretation or malformed quality", async () => {
        const curated = await defaultEquipmentClassifier();
        const definition = curated.manifest.cohorts.find(
            (cohort) => cohort.name === "Two-Stone Ring, T1 of Haast, fractured, ilvl 84–85",
        )!;
        const known: PublicStashChange["items"][number] = {
            ...item,
            baseType: "Two-Stone Ring",
            typeLine: "Two-Stone Ring",
            frameType: 2,
            sockets: [],
            ilvl: 85,
            extended: { prefixes: 0, suffixes: 1 },
            explicitMods: [{ description: "+57% to Cold Resistance", flags: { fractured: true } }],
            properties: [
                { name: "Quality (Resistance Modifiers)", type: 6, values: [["+20%", 1]] },
            ],
        };
        const unknown: PublicStashChange["items"][number] = {
            ...known,
            id: "unknown-quality",
            note: "~price 1 chaos",
            properties: [{ name: "Future quality", type: 6, values: [["+20%", 1]] }],
        };
        await withTransaction(db.conn, () =>
            captureEquipment(
                db.conn,
                { ...stash, items: [known, unknown] },
                curated,
                new Date(HOUR * 1000),
            ),
        );
        const rows = await equipmentHourly(db.conn, HOUR, "Standard");
        expect(rows.find((row) => row.cohortId === definition.id)).toMatchObject({
            listingCount: 1,
            unknownCount: 1,
            prices: { chaos: { median: 20, count: 1 } },
        });
    });

    it("rolls up a captured description-only fracture and excludes an unresolved cheaper listing", async () => {
        const fixture = JSON.parse(
            readFileSync(
                new URL(
                    "../../../packages/poe-item-query/test/fixtures/poe1-public-stash-2026-10-07.json",
                    import.meta.url,
                ),
                "utf8",
            ),
        );
        const sample: Partial<PublicStashChange["items"][number]> = fixture.items.find(
            (entry: { baseType: string }) => entry.baseType === "Conqueror's Helmet",
        );
        const curated = await defaultEquipmentClassifier();
        const definition = curated.manifest.cohorts.find(
            (cohort) =>
                cohort.name === "Conqueror's Helmet, T1 of the Polymath, fractured, ilvl 84–85",
        )!;
        // Only the item attributes are observed data; sellers and asking prices are replay inputs.
        const known = {
            ...item,
            ...sample,
            sockets: [],
            frameType: undefined,
            typeLine: "Conqueror's Helmet",
            note: "~price 20 chaos",
        };
        const unknown = {
            ...known,
            id: "unknown-counts",
            extended: undefined,
            note: "~price 1 chaos",
        };
        const ingest = (hour: number, price: number) =>
            withTransaction(db.conn, () =>
                captureEquipment(
                    db.conn,
                    { ...stash, items: [{ ...known, note: `~price ${price} chaos` }, unknown] },
                    curated,
                    new Date(hour * 1000),
                ),
            );
        await ingest(HOUR, 20);
        const early = (await equipmentHourly(db.conn, HOUR, "Standard")).find(
            (row) => row.cohortId === definition.id,
        )!;
        expect(early).toMatchObject({
            revision: curated.manifest.revision,
            listingCount: 1,
            unknownCount: 1,
            prices: { chaos: { count: 1, median: 20 } },
        });
        await ingest(HOUR + 21 * 86400, 5);
        expect(
            (await equipmentHourly(db.conn, HOUR + 21 * 86400, "Standard")).find(
                (row) => row.cohortId === definition.id,
            ),
        ).toMatchObject({ prices: { chaos: { count: 1, median: 5 } } });
        expect(
            (await equipmentHourly(db.conn, HOUR, "Standard")).find(
                (row) => row.cohortId === definition.id,
            ),
        ).toEqual(early);
    });

    it("prices resolved fractures while retaining ambiguous listings only as unknown evidence", async () => {
        const curated = await defaultEquipmentClassifier();
        const definition = curated.manifest.cohorts.find(
            (cohort) => cohort.name === "Exquisite Blade, T1 Merciless, fractured, ilvl 86–100",
        )!;
        const base = {
            ...item,
            baseType: "Exquisite Blade",
            typeLine: "Exquisite Blade",
            frameType: 2,
            sockets: [],
        };
        const known = {
            ...base,
            explicitMods: [
                {
                    description: "179% increased Physical Damage",
                    flags: { fractured: true },
                    mods: [{ name: "Merciless", tier: "P1", level: 83 }],
                },
            ],
        };
        const unknown = {
            ...base,
            id: "unresolved",
            fracturedMods: ["179% increased Physical Damage"],
            note: "~price 1 chaos",
        };
        const ingest = (items: PublicStashChange["items"], hour: number) =>
            withTransaction(db.conn, () =>
                captureEquipment(db.conn, { ...stash, items }, curated, new Date(hour * 1000)),
            );
        await ingest([known, unknown], HOUR);
        const early = (await equipmentHourly(db.conn, HOUR, "Standard")).find(
            (row) => row.cohortId === definition.id,
        )!;
        expect(early).toMatchObject({
            listingCount: 1,
            unknownCount: 1,
            prices: { chaos: { count: 1, median: 20 } },
        });
        await ingest([{ ...known, note: "~price 5 chaos" }, unknown], HOUR + 21 * 86400);
        expect(
            (await equipmentHourly(db.conn, HOUR + 21 * 86400, "Standard")).find(
                (row) => row.cohortId === definition.id,
            ),
        ).toMatchObject({ prices: { chaos: { median: 5 } } });
        expect(
            (await equipmentHourly(db.conn, HOUR, "Standard")).find(
                (row) => row.cohortId === definition.id,
            ),
        ).toEqual(early);
        await ingest([unknown], HOUR + 21 * 86400);
        // Unlisting is not proof of a sale and does not retract this hour's observation.
        expect(
            (await equipmentHourly(db.conn, HOUR + 21 * 86400, "Standard")).find(
                (row) => row.cohortId === definition.id,
            ),
        ).toMatchObject({ prices: { chaos: { median: 5 } } });
    });
    it("prunes only delivered historical observations and keeps active inventory", async () => {
        const old = Math.floor((Date.now() - 60 * 24 * 3_600_000) / 3_600_000) * 3600;
        await capture(stash, old);
        expect(await pruneEquipment(db.conn, { keepDays: 30, maxRows: 0 })).toEqual({
            listings: 0,
            hourlyRows: 0,
        });
        await db.conn.run(
            "INSERT INTO rollup_state VALUES ('equipment', 'Standard', $1, current_timestamp, 2)",
            [old],
        );
        expect(await pruneEquipment(db.conn, { keepDays: 30, maxRows: 0, dryRun: true })).toEqual({
            listings: 0,
            hourlyRows: 1,
        });
        expect(await pruneEquipment(db.conn, { keepDays: 30, maxRows: 0 })).toEqual({
            listings: 0,
            hourlyRows: 1,
        });
        expect(await equipmentHourly(db.conn, old, "Standard")).toEqual([]);
        await capture({ ...stash, public: false, items: [] }, old);
        expect(await pruneEquipment(db.conn, { keepDays: 30, maxRows: 0 })).toEqual({
            listings: 1,
            hourlyRows: 0,
        });
        expect(
            await queryAll(db.conn, "SELECT count(*)::INTEGER AS n FROM ps_equipment_cohort"),
        ).toEqual([{ n: 2 }]);
    });
    it("replaces same-hour cohort membership, emits cleared groups, and preserves previous-hour prices", async () => {
        await capture(stash);
        await capture(stash);
        expect((await equipmentHourly(db.conn, HOUR, "Standard"))[0]).toMatchObject({
            listingCount: 1,
            uniqueSellers: 1,
            prices: { chaos: { median: 20, count: 1 } },
        });
        await capture(
            { ...stash, items: [{ ...item, sockets: [], note: "~price 10 chaos" }] },
            HOUR + 3600,
        );
        expect((await equipmentHourly(db.conn, HOUR, "Standard"))[1]).toMatchObject({
            cohortId: "links",
            prices: { chaos: { median: 20 } },
        });
        await capture({ ...stash, items: [{ ...item, sockets: [], note: "~price 5 chaos" }] });
        expect(await equipmentHourly(db.conn, HOUR, "Standard")).toMatchObject([
            { cohortId: "base", listingCount: 1, prices: { chaos: { median: 5 } } },
            { cohortId: "links", listingCount: 0, prices: {} },
        ]);
        expect(await queryAll(db.conn, "SELECT count(*)::INTEGER AS n FROM ps_listing")).toEqual([
            { n: 0 },
        ]);
    });
    it("does not price unknown facts or capture irrelevant items, but clears formerly eligible items", async () => {
        await capture({
            ...stash,
            items: [
                { ...item, sockets: undefined },
                { ...item, id: "trash", baseType: "Rusted Sword" },
            ],
        });
        expect((await equipmentHourly(db.conn, HOUR, "Standard"))[1]).toMatchObject({
            cohortId: "links",
            unknownCount: 1,
            listingCount: 0,
            prices: {},
        });
        expect(
            await queryAll(db.conn, "SELECT count(*)::INTEGER AS n FROM ps_equipment_listing"),
        ).toEqual([{ n: 1 }]);
        await capture({ ...stash, items: [{ ...item, baseType: "Rusted Sword" }] });
        expect(await equipmentHourly(db.conn, HOUR, "Standard")).toMatchObject([
            { listingCount: 0, prices: {} },
            { listingCount: 0, unknownCount: 0, prices: {} },
        ]);
    });
    it("tracks moves without duplicating an item and removes private stashes without inventing sales", async () => {
        await capture(stash);
        await capture({ ...stash, id: "moved", accountName: "SELLER" });
        await capture({ ...stash, items: [] });
        expect((await equipmentHourly(db.conn, HOUR, "Standard"))[0]?.listingCount).toBe(1);
        expect(
            await queryAll(
                db.conn,
                "SELECT stash_id AS stash FROM ps_equipment_listing WHERE removed_at IS NULL",
            ),
        ).toEqual([{ stash: "moved" }]);
        await capture({ ...stash, id: "moved", public: false, items: [] });
        expect(
            await queryAll(
                db.conn,
                "SELECT count(*)::INTEGER AS n FROM ps_equipment_listing WHERE removed_at IS NULL",
            ),
        ).toEqual([{ n: 0 }]);
        expect((await equipmentHourly(db.conn, HOUR, "Standard"))[0]).toMatchObject({
            listingCount: 1,
        });
        expect(await equipmentHourly(db.conn, HOUR, "Other League")).toEqual([]);
    });
    it("replays thousands of early and middle league updates deterministically with seller counts", async () => {
        for (const [phase, offset, price] of [
            ["early", 0, 20],
            ["middle", 3600 * 24 * 21, 5],
        ] as const) {
            for (let seller = 0; seller < 20; seller++) {
                await capture(
                    {
                        ...stash,
                        id: `stash-${seller}`,
                        accountName: `seller-${seller}`,
                        items: Array.from({ length: 100 }, (_, index) => ({
                            ...item,
                            id: `item-${seller}-${index}`,
                            note: `~price ${price} chaos`,
                        })),
                    },
                    HOUR + offset,
                );
            }
            const rows = await equipmentHourly(db.conn, HOUR + offset, "Standard");
            expect(rows, phase).toHaveLength(2);
            expect(rows[0]).toMatchObject({
                listingCount: 2000,
                uniqueSellers: 20,
                prices: { chaos: { count: 2000, sellers: 20, median: price } },
            });
        }
        expect((await equipmentHourly(db.conn, HOUR, "Standard"))[0]).toMatchObject({
            prices: { chaos: { median: 20 } },
        });
        expect(
            await queryAll(db.conn, "SELECT count(*)::INTEGER AS n FROM ps_equipment_hour"),
        ).toEqual([{ n: 4000 }]);
    }, 30_000);
});
