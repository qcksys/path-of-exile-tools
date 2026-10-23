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
import { ServerTiming } from "~/services/server-timing.server";
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
let elapsed: number;
let beforeRead: (() => Promise<void>) | undefined;
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    elapsed = 0;
    beforeRead = undefined;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
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
        if (beforeRead) await beforeRead();
        elapsed += 25;
        const statement = sqlite.prepare(sql.replace(" FORCE INDEX (`PRIMARY`)", ""));
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
    vi.restoreAllMocks();
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
    it("times an empty lookup without changing its response or exposing request values", async () => {
        const timing = new ServerTiming();
        const result = await findCraftingMarketPrices(db, input, undefined, timing);
        expect(result).toEqual(await findCraftingMarketPrices(db, input));
        const header = timing.toString();
        expect(header).toContain("equipment_db;dur=25.0");
        expect(header).toContain("equipment_parse;dur=0.0");
        expect(header).toContain("equipment_fx;dur=0.0");
        expect(header).toContain("equipment_total;dur=25.0");
        expect(header).toContain('equipment_counts;desc="queries=1 rows=0 exchange_rows=0"');
        expect(header).not.toMatch(/Standard|Plate Vest|SELECT|test-market|Metadata/);
        expect(new ServerTiming().toString()).toBe("");
    });

    it("counts every conversion read while separating cohort wait from exchange work", async () => {
        capture(completed, "divine");
        exchange(completed);
        const timing = new ServerTiming();
        const converted = { ...input, conversion: "exchange-v1" as const };
        const result = await findCraftingMarketPrices(db, converted, undefined, timing);
        expect(result).toEqual(await findCraftingMarketPrices(db, converted));
        expect(result.candidates[0]?.covered).toBe(true);
        const header = timing.toString();
        expect(header).toContain("equipment_db;dur=25.0");
        expect(header).toContain("equipment_parse;dur=0.0");
        expect(header).toContain("equipment_fx;dur=50.0");
        expect(header).toContain("equipment_total;dur=75.0");
        expect(header).toContain('equipment_counts;desc="queries=3 rows=1 exchange_rows=2"');
    });

    it("records a failed database wait and keeps the original rejection", async () => {
        sqlite.exec(`DROP TABLE ${DB_TABLE_PREFIX}stash_cohort_hourly`);
        const timing = new ServerTiming();
        await expect(findCraftingMarketPrices(db, input, undefined, timing)).rejects.toThrow();
        expect(timing.toString()).toContain("equipment_db;dur=25.0");
        expect(timing.toString()).toContain("equipment_total;dur=25.0");
        expect(timing.toString()).toContain(
            'equipment_counts;desc="queries=1 rows=0 exchange_rows=0"',
        );
    });

    it("publishes one coherent completed lookup when MCP batch calls overlap", async () => {
        let releaseFirst = () => {};
        let firstWaiting = () => {};
        const blocked = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const waiting = new Promise<void>((resolve) => {
            firstWaiting = resolve;
        });
        beforeRead = async () => {
            beforeRead = undefined;
            firstWaiting();
            await blocked;
        };
        const timing = new ServerTiming();
        const first = findCraftingMarketPrices(db, input, undefined, timing);
        await waiting;
        elapsed = 100;
        await findCraftingMarketPrices(db, input, undefined, timing);
        expect(timing.toString()).toContain("equipment_db;dur=25.0");
        releaseFirst();
        await first;
        expect(timing.toString()).toContain("equipment_db;dur=150.0");
        expect(timing.toString()).toContain("equipment_total;dur=150.0");
        expect(timing.toString()).toContain(
            'equipment_counts;desc="queries=1 rows=0 exchange_rows=0"',
        );
    });

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
