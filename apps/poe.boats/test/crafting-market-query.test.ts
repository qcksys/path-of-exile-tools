import { DatabaseSync, type SQLInputValue } from "node:sqlite";
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
import { sourceMarketFixture, sourceMarketPurchase } from "./crafting-source-market-fixtures";

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
let reads: Array<{ sql: string; params: SQLInputValue[] }>;
let beforeRead: (() => Promise<void>) | undefined;
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    elapsed = 0;
    reads = [];
    beforeRead = undefined;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    sqlite = new DatabaseSync(":memory:");
    sqlite.function("JSON_CONTAINS", (values, value) =>
        Number(JSON.parse(String(values)).includes(JSON.parse(String(value)))),
    );
    sqlite.exec(`CREATE TABLE ${DB_TABLE_PREFIX}stash_poe1_cohort (
        id TEXT, revision TEXT, catalogHash TEXT, name TEXT, purpose TEXT, query TEXT, baseTypes TEXT,
        baseTypeKey TEXT GENERATED ALWAYS AS (
            CASE WHEN json_array_length(baseTypes) = 1 THEN json_extract(baseTypes, '$[0]') ELSE '' END));
        CREATE TABLE ${DB_TABLE_PREFIX}stash_poe1_cohort_hourly (
        realm TEXT, league TEXT, hour INTEGER, cohortId TEXT, revisionSeq INTEGER, listingCount INTEGER,
        uniqueSellers INTEGER, unknownCount INTEGER, prices TEXT, confidenceMethod TEXT, firstSeenAt TEXT, lastSeenAt TEXT);
        CREATE TABLE ${DB_TABLE_PREFIX}stash_poe1_cohort_revision (seq INTEGER PRIMARY KEY, revision TEXT);
        CREATE TABLE ${DB_TABLE_PREFIX}stash_poe1_cohort_window (
        realm TEXT, league TEXT, hour INTEGER, cohortId TEXT, revisionSeq INTEGER, windows TEXT);
        CREATE TABLE ${DB_TABLE_PREFIX}stash_poe1_currency_hourly (
        realm TEXT, league TEXT, marketId TEXT, hour INTEGER, volumeTraded TEXT, lowestRatio TEXT, highestRatio TEXT);`);
    sqlite
        .prepare(`INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_cohort_revision VALUES (1, ?)`)
        .run(marketCandidate.latest.revision);
    const definition = marketCandidate.definition;
    sqlite
        .prepare(`INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_cohort VALUES (?, ?, ?, ?, ?, ?, ?)`)
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
        sql = sql.replace(/ force index \([^)]+\)/gi, "");
        reads.push({ sql, params });
        if (beforeRead) await beforeRead();
        elapsed += 25;
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
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function capture(hour: number, currency = "chaos", median = 20) {
    const row = marketCandidate.latest;
    sqlite
        .prepare(
            `INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_cohort_hourly VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            row.realm,
            row.league,
            hour,
            row.cohortId,
            1,
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

it("returns source quotes only for their matching paid preparation profile", async () => {
    const { graph, candidate, profile } = sourceMarketFixture();
    const { node, alternative } = sourceMarketPurchase(graph);
    sqlite
        .prepare(
            `UPDATE ${DB_TABLE_PREFIX}stash_poe1_cohort SET query = ?, baseTypes = ?, purpose = ?`,
        )
        .run(
            JSON.stringify(candidate.definition.query),
            JSON.stringify(["Conquest Lamellar"]),
            "fracture",
        );
    capture(completed, "chaos", 220);
    const lookup: CraftingMarketInput = {
        ...input,
        item: createCraftingItemQuery(engine).record(alternative.item),
        requirements: node.output,
        sourcePreparation: profile,
    };
    const result = await findCraftingMarketPrices(db, lookup);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
        covered: true,
        reasons: [],
        sourcePreparation: profile,
        definition: { query: { sourcePreparation: profile } },
        latest: { prices: { chaos: { median: 220 } } },
    });
    for (const sourcePreparation of [
        undefined,
        { ...profile, crafted: false },
        { ...profile, enchanted: false },
    ])
        expect(
            (await findCraftingMarketPrices(db, { ...lookup, sourcePreparation })).candidates,
        ).toEqual([]);
});
function exchange(hour: number, realm = "pc", league = "Standard", currency = "divine") {
    const itemId =
        currency === "chrome"
            ? "Metadata/Items/Currency/CurrencyRerollSocketColours"
            : exchangeCurrencyId(currency)!;
    const chaos = exchangeCurrencyId("chaos")!;
    sqlite
        .prepare(
            `INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_currency_hourly VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            realm,
            league,
            `${itemId}|${chaos}`,
            hour,
            JSON.stringify({ [itemId]: 10, [chaos]: 1000 }),
            null,
            null,
        );
}

describe("equipment market lookup", () => {
    it("pages definitions in base/index order without sorting the full definition table", async () => {
        sqlite.exec(
            `CREATE INDEX definition_base ON ${DB_TABLE_PREFIX}stash_poe1_cohort(baseTypeKey,id)`,
        );
        capture(completed);
        const result = await findCraftingMarketPrices(db, input);
        expect(result.candidates).toHaveLength(1);
        const definitionReads = reads.filter(
            (read) => read.sql.includes("catalogHash") && !read.sql.includes("cohort_hourly"),
        );
        expect(definitionReads).toHaveLength(1);
        for (const read of definitionReads) {
            const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${read.sql}`).all(...read.params);
            expect(JSON.stringify(plan)).not.toContain("TEMP B-TREE");
            expect(JSON.stringify(plan)).toContain("definition_base");
        }
    });
    it("merges retained price windows of the hourly row's revision only", async () => {
        capture(completed);
        const windows = (listingCount: number) =>
            JSON.stringify({
                chaos: {
                    "24": {
                        count: 30,
                        sellers: 12,
                        min: 18,
                        median: 21,
                        max: 25,
                        confidence: 0.6,
                        listingCount,
                        unknownCount: 0,
                        hourlyMedianMin: 20,
                        hourlyMedianMax: 21,
                    },
                },
            });
        const window = sqlite.prepare(
            `INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_cohort_window VALUES (?, ?, ?, ?, ?, ?)`,
        );
        const { realm, league, cohortId } = marketCandidate.latest;
        window.run(realm, league, completed, cohortId, 1, windows(30));
        const merged = await findCraftingMarketPrices(db, input);
        expect(merged.candidates[0]?.latest.prices.chaos?.windows?.["24"]).toMatchObject({
            median: 21,
            listingCount: 30,
        });
        sqlite.exec(`UPDATE ${DB_TABLE_PREFIX}stash_poe1_cohort_window SET revisionSeq = 2`);
        const outdated = await findCraftingMarketPrices(db, input);
        expect(outdated.candidates[0]?.latest.prices.chaos).not.toHaveProperty("windows");
    });
    it("finds a relevant observation after more than 2000 incompatible same-base definitions", async () => {
        capture(completed - 3600, "chaos", 30);
        capture(completed);
        const wrongRarity = structuredClone(marketCandidate.definition.query);
        const rarity = wrongRarity.groups[0]!.filters.find((filter) => filter.kind === "rarity")!;
        if (rarity.kind !== "rarity") throw new Error("Expected rarity filter");
        rarity.values = ["Rare"];
        const definition = sqlite.prepare(
            `INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_cohort
            SELECT ?, revision, catalogHash, name, purpose, ?, baseTypes
            FROM ${DB_TABLE_PREFIX}stash_poe1_cohort WHERE id = ?`,
        );
        const observation = sqlite.prepare(
            `INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_cohort_hourly
            SELECT realm, league, hour, ?, revisionSeq, listingCount, uniqueSellers, unknownCount,
            prices, confidenceMethod, firstSeenAt, lastSeenAt
            FROM ${DB_TABLE_PREFIX}stash_poe1_cohort_hourly WHERE cohortId = ? AND hour = ?`,
        );
        for (let index = 0; index < 2000; index++) {
            const id = `a:${String(index).padStart(4, "0")}`;
            definition.run(id, JSON.stringify(wrongRarity), marketCandidate.definition.id);
            observation.run(id, marketCandidate.definition.id, completed);
        }
        const result = await findCraftingMarketPrices(db, input);
        expect(result.truncated).toBe(false);
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toMatchObject({
            covered: true,
            definition: { id: marketCandidate.definition.id },
            latest: { hour: completed, prices: { chaos: { median: 20 } } },
        });
        sqlite
            .prepare(
                `UPDATE ${DB_TABLE_PREFIX}stash_poe1_cohort_hourly SET prices = '{}'
                WHERE cohortId = ? AND hour = ?`,
            )
            .run(marketCandidate.definition.id, completed);
        const correction = await findCraftingMarketPrices(db, input);
        expect(correction.truncated).toBe(false);
        expect(correction.candidates).toHaveLength(1);
        expect(correction.candidates[0]).toMatchObject({
            covered: false,
            latest: { hour: completed, prices: {} },
        });
        expect(selectCraftingMarketPrice(correction.candidates[0]!, "chaos")).toBeNull();
    });

    it("keeps matching uncovered generic definitions", async () => {
        capture(completed - 3600);
        const broad = structuredClone(marketCandidate.definition.query);
        broad.groups[0]!.filters = broad.groups[0]!.filters.filter(
            (filter) => !(filter.kind === "range" && filter.field === "prefixes"),
        );
        sqlite
            .prepare(`UPDATE ${DB_TABLE_PREFIX}stash_poe1_cohort SET query = ?, baseTypes = NULL`)
            .run(JSON.stringify(broad));
        for (const cohortId of [undefined, marketCandidate.definition.id]) {
            const result = await findCraftingMarketPrices(db, input, cohortId);
            expect(result.truncated).toBe(false);
            expect(result.candidates).toHaveLength(1);
            expect(result.candidates[0]).toMatchObject({
                covered: false,
                definition: { id: marketCandidate.definition.id },
                latest: { hour: completed - 3600 },
            });
            expect(result.candidates[0]?.reasons).toContain(
                "The cohort does not guarantee the configured prefixes.",
            );
        }
    });

    it("times an empty lookup without changing its response or exposing request values", async () => {
        const timing = new ServerTiming();
        const result = await findCraftingMarketPrices(db, input, undefined, timing);
        expect(result).toEqual(await findCraftingMarketPrices(db, input));
        const header = timing.toString();
        // Without observations in the window the lookup ends before reading any definitions.
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
        expect(header).toContain("equipment_db;dur=75.0");
        expect(header).toContain("equipment_parse;dur=0.0");
        expect(header).toContain("equipment_fx;dur=25.0");
        expect(header).toContain("equipment_total;dur=100.0");
        expect(header).toContain('equipment_counts;desc="queries=4 rows=3 exchange_rows=1"');
    });

    it("records a failed database wait and keeps the original rejection", async () => {
        capture(completed);
        // The observation and definition reads succeed; the latest-row read joins revisions.
        sqlite.exec(`DROP TABLE ${DB_TABLE_PREFIX}stash_poe1_cohort_revision`);
        const timing = new ServerTiming();
        await expect(findCraftingMarketPrices(db, input, undefined, timing)).rejects.toThrow();
        expect(timing.toString()).toContain("equipment_db;dur=75.0");
        expect(timing.toString()).toContain("equipment_total;dur=75.0");
        expect(timing.toString()).toContain(
            'equipment_counts;desc="queries=3 rows=2 exchange_rows=0"',
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
                .prepare(`UPDATE ${DB_TABLE_PREFIX}stash_poe1_cohort SET query = ?, baseTypes = ?`)
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
    it("converts retained chrome buckets without changing their source currency", async () => {
        capture(completed, "chrome", 6);
        exchange(completed, "pc", "Standard", "chrome");
        expect((await findCraftingMarketPrices(db, input)).candidates[0]?.covered).toBe(false);
        const result = await findCraftingMarketPrices(db, { ...input, conversion: "exchange-v1" });
        expect(result.candidates[0]).toMatchObject({
            covered: true,
            latest: { hour: completed, prices: { chrome: { median: 6 } } },
            exchange: {
                currency: "chrome",
                quote: {
                    itemId: "Metadata/Items/Currency/CurrencyRerollSocketColours",
                    hour: completed,
                },
            },
        });
        expect(selectCraftingMarketPrice(result.candidates[0]!, "chaos")?.median).toBe(600);
    });
    it("shares rates for every supported asking currency observed in the same hour", async () => {
        capture(completed, "divine");
        exchange(completed);
        exchange(completed, "pc", "Standard", "chrome");
        const other = "z:chrome";
        sqlite
            .prepare(`INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_cohort
            SELECT ?, revision, catalogHash, name, purpose, query, baseTypes
            FROM ${DB_TABLE_PREFIX}stash_poe1_cohort`)
            .run(other);
        sqlite
            .prepare(`INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_cohort_hourly
            SELECT realm, league, hour, ?, revisionSeq, listingCount, uniqueSellers, unknownCount,
                ?, confidenceMethod, firstSeenAt, lastSeenAt FROM ${DB_TABLE_PREFIX}stash_poe1_cohort_hourly`)
            .run(other, JSON.stringify({ chrome: marketCandidate.latest.prices.chaos }));
        const result = await findCraftingMarketPrices(db, { ...input, conversion: "exchange-v1" });
        expect(result.candidates.map((candidate) => candidate.exchange?.currency)).toEqual([
            "divine",
            "chrome",
        ]);
        expect(
            result.candidates.map(
                (candidate) => selectCraftingMarketPrice(candidate, "chaos")?.median,
            ),
        ).toEqual([2000, 2000]);
    });
    it("does not convert unknown tokens or replace a newest unpriced correction", async () => {
        capture(completed - 3600, "chrome");
        capture(completed, "unsupported-token");
        exchange(completed, "pc", "Standard", "chrome");
        const result = await findCraftingMarketPrices(db, { ...input, conversion: "exchange-v1" });
        expect(result.candidates[0]).toMatchObject({ covered: false, latest: { hour: completed } });
        expect(result.candidates[0]?.exchange).toBeUndefined();
        sqlite
            .prepare(
                `UPDATE ${DB_TABLE_PREFIX}stash_poe1_cohort_hourly SET prices = '{}' WHERE hour = ?`,
            )
            .run(completed);
        const correction = await findCraftingMarketPrices(db, {
            ...input,
            conversion: "exchange-v1",
        });
        expect(correction.candidates[0]).toMatchObject({
            covered: false,
            latest: { hour: completed, prices: {} },
        });
        expect(correction.candidates[0]?.exchange).toBeUndefined();
    });
    it.each([
        "divine",
        "chrome",
    ])("does not convert %s using another hour, realm or league", async (currency) => {
        capture(completed, currency);
        exchange(completed - 3600, "pc", "Standard", currency);
        exchange(completed, "sony", "Standard", currency);
        exchange(completed, "pc", "Other", currency);
        const result = await findCraftingMarketPrices(db, { ...input, conversion: "exchange-v1" });
        expect(result.candidates[0]?.covered).toBe(false);
        expect(result.candidates[0]?.exchange).toBeUndefined();
        expect(result.candidates[0]?.reasons.join(" ")).toContain("matching-hour");
    });
    it("does not replace a current zero-volume chrome pair with the older positive rate", async () => {
        capture(completed, "chrome");
        exchange(completed - 3600, "pc", "Standard", "chrome");
        exchange(completed, "pc", "Standard", "chrome");
        sqlite
            .prepare(
                `UPDATE ${DB_TABLE_PREFIX}stash_poe1_currency_hourly SET volumeTraded = ? WHERE hour = ?`,
            )
            .run(
                JSON.stringify({
                    [exchangeCurrencyId("chrome")!]: 0,
                    [exchangeCurrencyId("chaos")!]: 0,
                }),
                completed,
            );
        const result = await findCraftingMarketPrices(db, { ...input, conversion: "exchange-v1" });
        expect(result.candidates[0]?.covered).toBe(false);
        expect(result.candidates[0]?.exchange).toBeUndefined();
    });
});
