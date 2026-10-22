import { DatabaseSync } from "node:sqlite";
import { exchangeCurrencyId } from "@poe-tools/market";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DB_TABLE_PREFIX } from "~/const";
import type { TDatabase } from "~/db/client";
import { findCraftingMarketPrices } from "~/db/queries/crafting-market.queries";
import { createCraftingItemQuery } from "~/lib/crafting-item-query";
import { selectCraftingMarketPrice } from "~/lib/crafting-market";
import type { CraftingMarketInput } from "~/schemas/crafting-market";
import { baseId, engine } from "./crafting-fixtures";
import { marketCandidate } from "./crafting-market-fixtures";

const now = Date.parse("2026-10-22T12:30:00Z") / 1000;
const completed = now - 5400;
const input: CraftingMarketInput = {
    item: createCraftingItemQuery(engine).record(engine.createItem(baseId, 86)),
    requirements: { format: 1, game: "poe1", groups: [] },
    realm: "pc",
    league: "Standard",
    currency: "chaos",
};
let sqlite: DatabaseSync;
let db: TDatabase;
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    sqlite = new DatabaseSync(":memory:");
    sqlite.function("JSON_CONTAINS", (values, value) =>
        Number(JSON.parse(String(values)).includes(JSON.parse(String(value)))),
    );
    sqlite.exec(`CREATE TABLE ${DB_TABLE_PREFIX}stash_cohort (
        id TEXT, revision TEXT, catalogHash TEXT, name TEXT, purpose TEXT, query TEXT, baseTypes TEXT);
        CREATE TABLE ${DB_TABLE_PREFIX}stash_cohort_hourly (
        realm TEXT, league TEXT, hour INTEGER, revision TEXT, cohortId TEXT, listingCount INTEGER,
        uniqueSellers INTEGER, unknownCount INTEGER, prices TEXT, confidenceMethod TEXT, firstSeenAt TEXT, lastSeenAt TEXT);
        CREATE TABLE ${DB_TABLE_PREFIX}stash_currency_hourly (
        realm TEXT, league TEXT, marketId TEXT, hour INTEGER, volumeTraded TEXT, lowestRatio TEXT, highestRatio TEXT);`);
    const definition = marketCandidate.definition;
    sqlite
        .prepare(`INSERT INTO ${DB_TABLE_PREFIX}stash_cohort VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(
            definition.id,
            definition.revision,
            definition.catalogHash,
            definition.name,
            definition.purpose,
            JSON.stringify(definition.query),
            JSON.stringify(["Plate Vest"]),
        );
    db = drizzle(async (sql, params) => {
        const statement = sqlite.prepare(sql);
        statement.setReturnArrays(true);
        return {
            rows: statement
                .all(...params)
                .map((row) =>
                    Object.values(row).map((value) =>
                        typeof value === "string" &&
                        (value.startsWith("{") || value.startsWith("["))
                            ? JSON.parse(value)
                            : value,
                    ),
                ),
        };
    }) as unknown as TDatabase;
});
afterEach(() => {
    sqlite.close();
    vi.useRealTimers();
});

function capture(hour: number, currency = "chaos", median = 20) {
    const row = marketCandidate.latest;
    sqlite
        .prepare(
            `INSERT INTO ${DB_TABLE_PREFIX}stash_cohort_hourly VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            row.realm,
            row.league,
            hour,
            row.revision,
            row.cohortId,
            10,
            10,
            0,
            JSON.stringify({
                [currency]: {
                    min: median,
                    median,
                    max: median,
                    count: 10,
                    sellers: 10,
                    confidence: 0.5,
                },
            }),
            row.confidenceMethod,
            row.firstSeenAt,
            row.lastSeenAt,
        );
}
function exchange(hour: number, realm = "pc", league = "Standard") {
    const divine = exchangeCurrencyId("divine")!;
    const chaos = exchangeCurrencyId("chaos")!;
    sqlite
        .prepare(`INSERT INTO ${DB_TABLE_PREFIX}stash_currency_hourly VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(
            realm,
            league,
            `${divine}|${chaos}`,
            hour,
            JSON.stringify({ [divine]: 10, [chaos]: 1000 }),
            null,
            null,
        );
}

describe("equipment market lookup", () => {
    it("requires canonical base evidence for shared-name variants while keeping legacy pools browsable", async () => {
        capture(completed);
        const configured = engine.createItem("Metadata/Items/Armours/Boots/BootsAtlas1", 86);
        const record = createCraftingItemQuery(engine).record(configured);
        const query = structuredClone(marketCandidate.definition.query);
        query.groups[0]!.filters[0] = {
            kind: "base",
            field: "baseType",
            values: ["Two-Toned Boots"],
        };
        const update = () =>
            sqlite
                .prepare(`UPDATE ${DB_TABLE_PREFIX}stash_cohort SET query = ?, baseTypes = ?`)
                .run(JSON.stringify(query), JSON.stringify(["Two-Toned Boots"]));
        update();
        const legacy = await findCraftingMarketPrices(db, { ...input, item: record });
        expect(legacy.candidates).toHaveLength(1);
        expect(legacy.candidates[0]?.covered).toBe(false);
        expect(legacy.candidates[0]?.reasons.join(" ")).toContain("canonical variants");
        query.groups[0]!.filters.push({
            kind: "base",
            field: "baseId",
            values: [configured.baseId],
        });
        update();
        expect(
            (await findCraftingMarketPrices(db, { ...input, item: record })).candidates[0]?.covered,
        ).toBe(true);
        const other = createCraftingItemQuery(engine).record(
            engine.createItem("Metadata/Items/Armours/Boots/BootsAtlas2", 86),
        );
        expect((await findCraftingMarketPrices(db, { ...input, item: other })).candidates).toEqual(
            [],
        );
    });
    it("rejects stale captures and the current incomplete hour", async () => {
        capture(completed - 14 * 86400);
        capture(completed + 3600);
        const result = await findCraftingMarketPrices(db, input);
        expect(result.candidates).toEqual([]);
        expect(result.message).toContain("24 completed hours");
    });
    it("preserves historical cutoffs and rejects captures older than that cutoff's window", async () => {
        const past = completed - 14 * 86400;
        capture(past);
        capture(completed, "chaos", 40);
        const result = await findCraftingMarketPrices(db, { ...input, at: past });
        expect(result.candidates[0]?.latest.hour).toBe(past);
        expect(
            (await findCraftingMarketPrices(db, { ...input, at: past + 86400 })).candidates,
        ).toEqual([]);
    });
    it("converts a divine-only pool only with explicit consent and matching exchange data", async () => {
        capture(completed, "divine");
        exchange(completed);
        expect((await findCraftingMarketPrices(db, input)).candidates[0]?.covered).toBe(false);
        const result = await findCraftingMarketPrices(db, { ...input, conversion: "exchange-v1" });
        expect(result.candidates[0]?.covered).toBe(true);
        expect(selectCraftingMarketPrice(result.candidates[0]!, "chaos")?.median).toBe(2000);
    });
    it("does not convert using another hour, realm or league", async () => {
        capture(completed, "divine");
        exchange(completed - 3600);
        exchange(completed, "sony");
        exchange(completed, "pc", "Other");
        const result = await findCraftingMarketPrices(db, { ...input, conversion: "exchange-v1" });
        expect(result.candidates[0]?.covered).toBe(false);
        expect(result.candidates[0]?.exchange).toBeUndefined();
        expect(result.candidates[0]?.reasons.join(" ")).toContain("matching-hour");
    });
});
