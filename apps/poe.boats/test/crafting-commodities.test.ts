import { DatabaseSync } from "node:sqlite";
import { exchangeCurrencyId } from "@poe-tools/market";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DB_TABLE_PREFIX } from "~/const";
import type { TDatabase } from "~/db/client";
import { findCraftingCommodityPrices } from "~/db/queries/crafting-commodities.queries";
import { CraftingEngine } from "~/lib/crafting-engine";
import {
    bindCraftingSourcePrice,
    craftingCommodityIdentity,
    decodeCraftingSourceReference,
} from "~/lib/crafting-sources";
import {
    craftingMarketSnapshots,
    refreshCraftingMarketPrices,
} from "~/operations/crafting-market.server";
import { commoditySourceQuoteSchema } from "~/schemas/crafting-sources";
import { findCraftingSourcePrices } from "~/services/crafting-sources.server";
import {
    chaosId,
    commodityExchangeSnapshot,
    commodityQuote,
    convertedCommodityQuote,
    divineId,
    essenceId,
    essenceName,
} from "./crafting-commodity-fixtures";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { catalog, engine } from "./crafting-fixtures";

const hour = commodityQuote.hour;
let sqlite: DatabaseSync;
let db: TDatabase;
const graph = exchangeGraph();
const identity = { id: essenceId, baseType: essenceName };
const prices: Record<string, { count: number; min: number; median: number; max: number }> = {
    chaos: { count: 2, min: 3, median: 16.5, max: 30 },
};
const row = {
    realm: "pc",
    league: "Standard",
    hour,
    itemKey: essenceName,
    baseType: essenceName,
    name: "",
    frameType: 5,
    identified: 1,
    corrupted: 0,
    foilVariation: -1,
    signatureKind: "",
    signatureValue: "",
    listingCount: 25,
    uniqueSellers: 24,
    prices,
};
function capture(changes: Partial<typeof row> = {}) {
    const entry = { ...row, ...changes };
    sqlite
        .prepare(
            `INSERT INTO ${DB_TABLE_PREFIX}stash_unique_hourly VALUES (${Object.keys(entry)
                .map(() => "?")
                .join(",")})`,
        )
        .run(
            ...Object.values(entry).map((value) =>
                typeof value === "object" ? JSON.stringify(value) : value,
            ),
        );
}
function captureExchange(changes: Partial<typeof commodityExchangeSnapshot> = {}) {
    const entry = { ...commodityExchangeSnapshot, ...changes };
    sqlite
        .prepare(`INSERT INTO ${DB_TABLE_PREFIX}stash_currency_hourly VALUES (?,?,?,?,?,?,?)`)
        .run(
            entry.realm,
            entry.league,
            entry.hour,
            entry.marketId,
            JSON.stringify(entry.volumeTraded),
            null,
            null,
        );
}
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime((hour + 5400) * 1000);
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE ${DB_TABLE_PREFIX}stash_unique_hourly (
        realm TEXT, league TEXT, hour INTEGER, itemKey TEXT, baseType TEXT, name TEXT,
        frameType INTEGER, identified INTEGER, corrupted INTEGER, foilVariation INTEGER,
        signatureKind TEXT, signatureValue TEXT, listingCount INTEGER, uniqueSellers INTEGER, prices TEXT)`);
    sqlite.exec(`CREATE TABLE ${DB_TABLE_PREFIX}stash_currency_hourly (
        realm TEXT, league TEXT, hour INTEGER, marketId TEXT, volumeTraded TEXT, lowestRatio TEXT, highestRatio TEXT)`);
    db = drizzle(async (sql, params) => {
        const statement = sqlite.prepare(sql);
        statement.setReturnArrays(true);
        return {
            rows: statement
                .all(...params.map((value) => (typeof value === "boolean" ? Number(value) : value)))
                .map((row) =>
                    Object.values(row).map((value) =>
                        typeof value === "string" && value.startsWith("{")
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

it("verifies all 106 essence identities and refuses duplicated names and other currency variants", () => {
    expect(catalog.crafting.essences).toHaveLength(106);
    for (const essence of catalog.crafting.essences)
        expect(craftingCommodityIdentity(engine, essence.id)).toEqual({
            id: essence.id,
            baseType: essence.name,
        });
    expect(
        craftingCommodityIdentity(engine, "Metadata/Items/Delve/DelveSocketableCurrencyReroll1"),
    ).toBeNull();
    const duplicate = structuredClone(catalog);
    duplicate.crafting.currencies.push({
        ...duplicate.crafting.currencies.find((entry) => entry.id === essenceId)!,
        id: "duplicate",
    });
    expect(craftingCommodityIdentity(new CraftingEngine(duplicate), essenceId)).toBeNull();
});

it("returns an exact captured unit asking quote and preserves the source separately from exchange", async () => {
    capture();
    const result = await findCraftingSourcePrices(
        graph,
        engine,
        { ids: [essenceId], realm: "pc" },
        db,
    );
    expect(result).toEqual({ quotes: { [essenceId]: commodityQuote }, missing: {} });
    const bound = bindCraftingSourcePrice(graph, engine, essenceId, commodityQuote);
    expect(bound.prices[essenceId]).toMatchObject({
        amount: 16.5,
        confidence: null,
        samples: 2,
        observedAt: new Date(hour * 1000).toISOString(),
    });
    expect(decodeCraftingSourceReference(bound.prices[essenceId]!.cohortId)).toEqual({
        ...identity,
        source: "stash-commodity",
        game: "poe1",
        realm: "pc",
        league: "Standard",
        currency: "chaos",
    });
    expect(
        decodeCraftingSourceReference(
            bound.prices[essenceId]!.cohortId!.replace("stash-commodity:v1:", "poeninja:v1:"),
        ),
    ).toBeNull();
});

it.each([
    { realm: "poe2" },
    { league: "Other" },
    { itemKey: "Other" },
    { baseType: "Other" },
    { name: "Named variant" },
    { frameType: 3 },
    { identified: 0 },
    { corrupted: 1 },
    { foilVariation: 0 },
    { signatureKind: "variant" },
    { signatureValue: "variant" },
    { hour: hour + 3600 },
    { hour: hour - 24 * 3600 },
    { listingCount: 0 },
    { uniqueSellers: 0 },
])("rejects incompatible commodity observation %j", async (changes) => {
    capture(changes);
    const result = await findCraftingCommodityPrices(db, graph, [identity]);
    expect(result.quotes).toEqual({});
    expect(result.missing[essenceId]).toContain("No positive");
});

it("does not hide a newer empty or malformed price behind an older positive quote", async () => {
    capture({ hour: hour - 3600 });
    const distributions: (typeof row.prices)[] = [
        {},
        { chaos: { count: 0, min: 0, median: 0, max: 0 } },
        { chaos: { count: 2, min: 30, median: 16.5, max: 3 } },
    ];
    for (const prices of distributions) {
        sqlite.prepare(`DELETE FROM ${DB_TABLE_PREFIX}stash_unique_hourly WHERE hour=?`).run(hour);
        capture({ prices });
        expect((await findCraftingCommodityPrices(db, graph, [identity])).quotes).toEqual({});
    }
});

it("refreshes a new observation hour with the same amount and prices historical snapshots from their cutoff", async () => {
    capture({ hour: hour - 3600, prices: { chaos: { count: 2, min: 5, median: 5.5, max: 6 } } });
    capture();
    const bound = bindCraftingSourcePrice(graph, engine, essenceId, {
        ...commodityQuote,
        hour: hour - 3600,
    });
    const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph.prices[essenceId]!.observedAt).toBe(new Date(hour * 1000).toISOString());
    expect((await refreshCraftingMarketPrices(db, refreshed.graph, engine)).graph).toBe(
        refreshed.graph,
    );
    const snapshots = await craftingMarketSnapshots(db, bound, engine, [
        hour - 3600,
        hour,
        hour - 25 * 3600,
    ]);
    expect(snapshots.points.map((point) => point.graph?.prices[essenceId]?.amount ?? null)).toEqual(
        [null, 5.5, 16.5],
    );
    sqlite.exec(`DELETE FROM ${DB_TABLE_PREFIX}stash_unique_hourly`);
    const missing = await refreshCraftingMarketPrices(db, refreshed.graph, engine);
    expect(missing.graph).toBe(refreshed.graph);
    expect(missing.issues).toHaveLength(1);
    expect(
        (await craftingMarketSnapshots(db, refreshed.graph, engine, [hour])).points[0]!.graph,
    ).toBeNull();
});

it("refuses mismatched bindings and malformed ranges while preserving unrelated manual prices", async () => {
    for (const changes of [
        { id: "wrong" },
        { league: "Other" },
        { currency: "divine" as const },
        { baseType: "Other" },
    ])
        expect(() =>
            bindCraftingSourcePrice(graph, engine, essenceId, { ...commodityQuote, ...changes }),
        ).toThrow();
    expect(commoditySourceQuoteSchema.safeParse({ ...commodityQuote, samples: 26 }).success).toBe(
        false,
    );
    for (const offset of [3600, 7200])
        expect(() =>
            bindCraftingSourcePrice(graph, engine, essenceId, {
                ...commodityQuote,
                hour: hour + offset,
            }),
        ).toThrow("completed hour");
    const manual = {
        ...graph,
        prices: {
            [essenceId]: {
                amount: 123,
                currency: "chaos",
                source: "manual" as const,
                confidence: null,
            },
        },
    };
    capture();
    expect((await refreshCraftingMarketPrices(db, manual, engine)).graph).toBe(manual);
});

const divineAsks = { divine: { count: 1, min: 2, median: 2, max: 2 } };
const convertedOptions = {
    ids: [essenceId],
    realm: "pc" as const,
    conversion: "exchange-v1" as const,
};
it("requires conversion opt-in, keeps native policy, and refreshes using the new bucket's matching-hour rate", async () => {
    capture({ prices: divineAsks });
    capture({ hour: hour - 3600 });
    captureExchange();
    expect(
        (await findCraftingSourcePrices(graph, engine, { ids: [essenceId], realm: "pc" }, db))
            .quotes,
    ).toEqual({});
    const result = await findCraftingSourcePrices(graph, engine, convertedOptions, db);
    expect(result.quotes[essenceId]).toEqual(convertedCommodityQuote);
    const older = (
        await findCraftingSourcePrices(graph, engine, { ...convertedOptions, at: hour - 3600 }, db)
    ).quotes[essenceId]!;
    expect(older).toMatchObject({ amount: 16.5, conversion: "exchange-v1" });
    expect(older).not.toHaveProperty("exchange");
    const bound = bindCraftingSourcePrice(graph, engine, essenceId, older);
    const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph.prices[essenceId]?.amount).toBe(600);
    expect(
        decodeCraftingSourceReference(refreshed.graph.prices[essenceId]?.cohortId),
    ).toMatchObject({
        conversion: "exchange-v1",
        exchange: convertedCommodityQuote.exchange,
    });
    const history = await craftingMarketSnapshots(db, refreshed.graph, engine, [hour - 3600, hour]);
    expect(history.points.map((point) => point.graph?.prices[essenceId]?.amount)).toEqual([
        16.5, 600,
    ]);
    sqlite.exec(`DELETE FROM ${DB_TABLE_PREFIX}stash_currency_hourly`);
    const missing = await refreshCraftingMarketPrices(db, refreshed.graph, engine);
    expect(missing.graph).toBe(refreshed.graph);
    expect(missing.issues).toHaveLength(1);
    expect(
        (await craftingMarketSnapshots(db, refreshed.graph, engine, [hour])).points[0]?.graph,
    ).toBeNull();
});

it.each([
    { hour: hour - 3600 },
    { hour: hour + 3600 },
    { league: "Other" },
    { realm: "poe2" },
    { volumeTraded: { [divineId]: 0, [chaosId]: 0 } },
])("refuses mismatched or zero exchange evidence %j", async (changes) => {
    capture({ prices: divineAsks });
    captureExchange(changes as Partial<typeof commodityExchangeSnapshot>);
    expect((await findCraftingSourcePrices(graph, engine, convertedOptions, db)).quotes).toEqual(
        {},
    );
});

it("supports a verified two-leg rate and refuses mismatched leg hours", async () => {
    capture({ prices: divineAsks });
    const exaltedId = exchangeCurrencyId("exalted")!;
    captureExchange({
        marketId: `${divineId}|${exaltedId}`,
        volumeTraded: { [divineId]: 1, [exaltedId]: 100 },
    });
    captureExchange({
        marketId: `${exaltedId}|${chaosId}`,
        volumeTraded: { [exaltedId]: 1, [chaosId]: 3 },
    });
    const quote = (await findCraftingSourcePrices(graph, engine, convertedOptions, db)).quotes[
        essenceId
    ]!;
    expect(quote).toMatchObject({
        amount: 600,
        exchange: { quote: { estimator: "cross-rate-v1", legs: expect.any(Array) } },
    });
    if (quote.source !== "stash-commodity" || !quote.exchange?.quote.legs)
        throw new Error("Expected conversion legs");
    const wrong = structuredClone(quote);
    wrong.exchange!.quote.legs![1].hour = hour - 3600;
    expect(() => bindCraftingSourcePrice(graph, engine, essenceId, wrong)).toThrow("matching-hour");
});

it("rejects forged conversion scope, policy, direction and arithmetic", () => {
    const exchange = convertedCommodityQuote.exchange!;
    for (const quote of [
        { ...convertedCommodityQuote, conversion: undefined },
        { ...convertedCommodityQuote, amount: 601, high: 601 },
        ...[
            { realm: "poe2" as const },
            { league: "Other" },
            { hour: hour - 3600 },
            { itemId: chaosId },
            { quoteId: divineId },
            { amount: 301 },
            { window: "adaptive-v1" as const },
            { windowStart: hour - 3600 },
        ].map((change) => ({
            ...convertedCommodityQuote,
            exchange: { ...exchange, quote: { ...exchange.quote, ...change } },
        })),
    ])
        expect(() => bindCraftingSourcePrice(graph, engine, essenceId, quote)).toThrow(
            "matching-hour",
        );
});

it("does not convert a malformed requested-currency bucket or fall back beyond the newest bucket", async () => {
    captureExchange();
    capture({ hour: hour - 3600, prices: divineAsks });
    capture({ prices: { ...divineAsks, chaos: { count: 0, min: 0, median: 0, max: 0 } } });
    expect((await findCraftingSourcePrices(graph, engine, convertedOptions, db)).quotes).toEqual(
        {},
    );
    sqlite.prepare(`DELETE FROM ${DB_TABLE_PREFIX}stash_unique_hourly WHERE hour=?`).run(hour);
    capture({ prices: {} });
    expect((await findCraftingSourcePrices(graph, engine, convertedOptions, db)).quotes).toEqual(
        {},
    );
});
