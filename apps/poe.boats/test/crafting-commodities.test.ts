import { DatabaseSync } from "node:sqlite";
import { exchangeCurrencyId, quoteExchangeSnapshot } from "@poe-tools/market";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DB_TABLE_PREFIX } from "~/const";
import type { TDatabase } from "~/db/client";
import { findCraftingCommodityPrices } from "~/db/queries/crafting-commodities.queries";
import { knownCraftingExchangeItems } from "~/db/queries/crafting-exchange-membership.queries";
import { craftingCommoditySignature, emptyResonator } from "~/lib/crafting-empty-resonator";
import { CraftingEngine } from "~/lib/crafting-engine";
import { bindExchangePrice } from "~/lib/crafting-exchange";
import {
    assertCraftingSourcePrices,
    bindCraftingSourcePrice,
    commodityExchangePriority,
    craftingCommodityIdentity,
    decodeCraftingSourceReference,
} from "~/lib/crafting-sources";
import {
    craftingMarketSnapshots,
    refreshCraftingMarketPrices,
} from "~/operations/crafting-market.server";
import {
    commoditySourceQuoteSchema,
    commoditySourceReferenceSchema,
} from "~/schemas/crafting-sources";
import { findCraftingSourcePrices } from "~/services/crafting-sources.server";
import {
    chaosId,
    commodityExchangeSnapshot,
    commodityQuote,
    convertedCommodityQuote,
    divineId,
    emptyResonatorQuote,
    essenceId,
    essenceName,
    unravellingId,
    unravellingName,
    unravellingQuote,
} from "./crafting-commodity-fixtures";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { catalog, engine, getCatalog } from "./crafting-fixtures";

const hour = commodityQuote.hour;
let sqlite: DatabaseSync;
let db: TDatabase;
let statements: string[];
const graph = exchangeGraph();
const identity = { id: essenceId, baseType: essenceName };
const fossilId = "Metadata/Items/Currency/CurrencyDelveCraftingSockets";
const fossilName = "Fundamental Fossil";
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
    signatureKind: "",
    signatureValue: "",
    listingCount: 25,
    uniqueSellers: 24,
    prices,
    tab: "merchant",
};
function capture(changes: Partial<typeof row> = {}) {
    const entry = { ...row, ...changes };
    sqlite
        .prepare(
            `INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_unique_hourly VALUES (${Object.keys(entry)
                .map(() => "?")
                .join(",")})`,
        )
        .run(
            ...Object.values(entry).map((value) =>
                typeof value === "object" ? JSON.stringify(value) : value,
            ),
        );
}
/** Records an exchange market's first hour, as ingest does beside each stored hour. */
function recordMarket(realm: string, league: string, marketId: string, firstHour: number) {
    sqlite
        .prepare(
            `INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_currency_market VALUES (?,?,?,?)
            ON CONFLICT (realm, league, marketId) DO UPDATE SET firstHour = min(firstHour, excluded.firstHour)`,
        )
        .run(realm, league, marketId, firstHour);
}
function captureExchange(changes: Partial<typeof commodityExchangeSnapshot> = {}) {
    const entry = { ...commodityExchangeSnapshot, ...changes };
    recordMarket(entry.realm, entry.league, entry.marketId, entry.hour);
    sqlite
        .prepare(`INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_currency_hourly VALUES (?,?,?,?,?,?,?)`)
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
    statements = [];
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE ${DB_TABLE_PREFIX}stash_poe1_unique_hourly (
        realm TEXT, league TEXT, hour INTEGER, itemKey TEXT, baseType TEXT, name TEXT,
        frameType INTEGER, identified INTEGER, corrupted INTEGER,
        signatureKind TEXT, signatureValue TEXT, listingCount INTEGER, uniqueSellers INTEGER, prices TEXT,
        tab TEXT)`);
    sqlite.exec(`CREATE TABLE ${DB_TABLE_PREFIX}stash_poe1_currency_hourly (
        realm TEXT, league TEXT, hour INTEGER, marketId TEXT, volumeTraded TEXT, lowestRatio TEXT, highestRatio TEXT)`);
    sqlite.exec(`CREATE TABLE ${DB_TABLE_PREFIX}stash_poe1_currency_market (
        realm TEXT, league TEXT, marketId TEXT, firstHour INTEGER, PRIMARY KEY (realm, league, marketId))`);
    db = drizzle(async (sql, params) => {
        statements.push(sql);
        const statement = sqlite.prepare(sql.replace(/ force index \(`PRIMARY`\)/i, ""));
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

it("uses exchange membership at each cutoff and preserves the original stash binding through missing prices and recovery", async () => {
    capture({ hour: hour - 3600 });
    capture();
    const manual = { amount: 42, currency: "chaos", source: "manual" as const, confidence: null };
    const bound = bindCraftingSourcePrice(
        { ...graph, prices: { [unravellingId]: manual } },
        engine,
        essenceId,
        commodityQuote,
    );
    const original = bound.prices[essenceId]!.cohortId;
    const marketId = `${essenceId}|${chaosId}`;
    captureExchange({ marketId, volumeTraded: { [essenceId]: 0, [chaosId]: 0 } });
    const historic = await findCraftingSourcePrices(
        graph,
        engine,
        { realm: "pc", ids: [essenceId], at: hour - 3600 },
        db,
    );
    expect(historic.quotes[essenceId]).toBeDefined();
    const current = await findCraftingSourcePrices(
        graph,
        engine,
        { realm: "pc", ids: [essenceId] },
        db,
    );
    expect(current.quotes[essenceId]).toBeUndefined();
    expect(current.missing[essenceId]).toMatch(/exchange market/);
    const missing = await refreshCraftingMarketPrices(db, bound, engine);
    expect(missing.issues).toHaveLength(1);
    expect(commodityExchangePriority(missing.graph.prices[essenceId]?.cohortId)).toMatchObject({
        original,
        unavailable: true,
    });
    expect(missing.graph.prices[unravellingId]).toEqual(manual);
    expect(() => assertCraftingSourcePrices(missing.graph)).toThrow(
        /exchange price is unavailable/,
    );
    const past = await craftingMarketSnapshots(db, missing.graph, engine, [hour - 3600]);
    expect(past.points[0]?.graph?.prices[essenceId]?.amount).toBe(16.5);
    sqlite
        .prepare(
            `UPDATE ${DB_TABLE_PREFIX}stash_poe1_currency_hourly SET volumeTraded=? WHERE marketId=?`,
        )
        .run(JSON.stringify({ [essenceId]: 10, [chaosId]: 50 }), marketId);
    const recovered = await refreshCraftingMarketPrices(db, missing.graph, engine);
    expect(recovered.issues).toEqual([]);
    expect(recovered.graph.prices[essenceId]?.amount).toBe(5);
    expect(commodityExchangePriority(recovered.graph.prices[essenceId]?.cohortId)).toMatchObject({
        original,
        unavailable: false,
    });
    expect(() => assertCraftingSourcePrices(recovered.graph)).not.toThrow();
    expect(recovered.graph.prices[unravellingId]).toEqual(manual);
    const unchanged = structuredClone(recovered.graph);
    statements.length = 0;
    const prior = await craftingMarketSnapshots(db, recovered.graph, engine, [hour - 3600, hour]);
    expect(prior.points[0]?.graph?.prices[essenceId]?.amount).toBe(16.5);
    expect(prior.points[1]?.graph?.prices[essenceId]?.amount).toBe(5);
    expect(recovered.graph).toEqual(unchanged);
    expect(statements.filter((sql) => sql.includes("currency_market"))).toHaveLength(1);
});

it("ignores future-only observations, keeps resonator IDs distinct, and fails closed above the market limit", async () => {
    captureExchange({ hour: hour + 3600, marketId: `${essenceId}|${chaosId}` });
    captureExchange({ marketId: `${emptyResonator.ids[0]}|${chaosId}` });
    const known = await knownCraftingExchangeItems(db, "Standard", hour);
    expect(known?.has(essenceId)).toBe(false);
    expect(known?.has(emptyResonator.ids[0])).toBe(true);
    expect(known?.has(emptyResonator.ids[1])).toBe(false);
    const insert = sqlite.prepare(
        `INSERT INTO ${DB_TABLE_PREFIX}stash_poe1_currency_hourly VALUES (?,?,?,?,?,?,?)`,
    );
    for (let i = 0; i < 5000; i++) {
        insert.run("pc", "Standard", hour, `item-${i}|${chaosId}`, "{}", null, null);
        recordMarket("pc", "Standard", `item-${i}|${chaosId}`, hour);
    }
    expect(await knownCraftingExchangeItems(db, "Standard", hour)).toBeNull();
    capture();
    const result = await findCraftingSourcePrices(
        graph,
        engine,
        { realm: "pc", ids: [essenceId] },
        db,
    );
    expect(result.quotes[essenceId]).toBeUndefined();
    expect(result.missing[essenceId]).toMatch(/safe lookup limit/);
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

it("verifies exact fossil catalog identities without accepting ambiguous or contradictory records", () => {
    expect(catalog.crafting.fossils.filter((entry) => entry.name)).toHaveLength(25);
    for (const fossil of catalog.crafting.fossils) {
        if (fossil.name)
            expect(craftingCommodityIdentity(engine, fossil.id)).toEqual({
                id: fossil.id,
                baseType: fossil.name,
            });
        else expect(craftingCommodityIdentity(engine, fossil.id)).toBeNull();
    }
    const fossil = catalog.crafting.fossils.find((entry) => entry.id === fossilId)!;
    const currency = catalog.crafting.currencies.find((entry) => entry.id === fossilId)!;
    for (const extra of [
        { ...fossil, id: "duplicate" },
        { ...fossil, name: "Other name" },
        fossil,
    ]) {
        const duplicate = structuredClone(catalog);
        duplicate.crafting.fossils.push(extra);
        expect(craftingCommodityIdentity(new CraftingEngine(duplicate), fossilId)).toBeNull();
    }
    for (const extra of [
        { ...currency, id: "duplicate" },
        { ...currency, name: "Other name" },
        currency,
    ]) {
        const duplicate = structuredClone(catalog);
        duplicate.crafting.currencies.push(extra);
        expect(craftingCommodityIdentity(new CraftingEngine(duplicate), fossilId)).toBeNull();
    }
    for (const collection of ["fossils", "currencies"] as const) {
        const contradictory = structuredClone(catalog);
        contradictory.crafting[collection].find((entry) => entry.id === fossilId)!.name =
            "Other name";
        expect(craftingCommodityIdentity(new CraftingEngine(contradictory), fossilId)).toBeNull();
    }
    expect(craftingCommodityIdentity(new CraftingEngine(getCatalog("poe2")), fossilId)).toBeNull();
});

it("allows only the two equivalent Prime Chaotic Resonator records with explicit empty provenance", () => {
    for (const id of emptyResonator.ids) {
        expect(craftingCommodityIdentity(engine, id)).toEqual({
            id,
            baseType: emptyResonator.baseType,
            variant: emptyResonator.variant,
        });
        expect(craftingCommodityIdentity(new CraftingEngine(getCatalog("poe2")), id)).toBeNull();
    }
    const member = catalog.crafting.currencies.find((entry) => entry.id === emptyResonator.ids[0])!;
    for (const change of [
        { name: "Other" },
        { action: "reroll" },
        { description: "Other" },
        { directions: "Other" },
        { id: "Metadata/Items/Delve/DelveSocketableCurrencyReroll3" },
    ]) {
        const altered = structuredClone(catalog);
        Object.assign(altered.crafting.currencies.find((entry) => entry.id === member.id)!, change);
        for (const id of emptyResonator.ids)
            expect(craftingCommodityIdentity(new CraftingEngine(altered), id)).toBeNull();
    }
    for (const extra of [member, { ...member, id: "unexpected-alias" }]) {
        const altered = structuredClone(catalog);
        altered.crafting.currencies.push(extra);
        expect(craftingCommodityIdentity(new CraftingEngine(altered), member.id)).toBeNull();
    }
    const absent = structuredClone(catalog);
    absent.crafting.currencies = absent.crafting.currencies.filter(
        (entry) => entry.id !== member.id,
    );
    expect(craftingCommodityIdentity(new CraftingEngine(absent), emptyResonator.ids[1])).toBeNull();
});

it("rejects old or mislabeled resonator quotes and references while preserving each selected family id", async () => {
    for (const changes of [
        { variant: undefined },
        { variant: "empty-resonator-v2" },
        { baseType: essenceName },
        { id: essenceId },
        { id: "unexpected-alias" },
    ]) {
        const invalid = { ...emptyResonatorQuote, ...changes };
        expect(commoditySourceQuoteSchema.safeParse(invalid).success).toBe(false);
        expect(() =>
            bindCraftingSourcePrice(
                graph,
                engine,
                invalid.id,
                invalid as typeof emptyResonatorQuote,
            ),
        ).toThrow();
    }
    expect(
        commoditySourceQuoteSchema.safeParse({ ...commodityQuote, variant: emptyResonator.variant })
            .success,
    ).toBe(false);
    for (const id of emptyResonator.ids) {
        const bound = bindCraftingSourcePrice(graph, engine, id, { ...emptyResonatorQuote, id });
        const reference = decodeCraftingSourceReference(bound.prices[id]?.cohortId)!;
        expect(reference).toMatchObject({
            id,
            baseType: emptyResonator.baseType,
            variant: emptyResonator.variant,
        });
        const legacy = { ...reference, variant: undefined };
        expect(commoditySourceReferenceSchema.safeParse(legacy).success).toBe(false);
        const legacyId = `stash-commodity:v1:${encodeURIComponent(JSON.stringify(legacy))}`;
        expect(decodeCraftingSourceReference(legacyId)).toBeNull();
        const legacyGraph = {
            ...bound,
            prices: { [id]: { ...bound.prices[id]!, cohortId: legacyId } },
        };
        const refreshed = await refreshCraftingMarketPrices(db, legacyGraph, engine);
        expect(refreshed.issues).toHaveLength(1);
        expect(refreshed.graph.prices[id]).toBeUndefined();
        expect(legacyGraph.prices[id]?.cohortId).toBe(legacyId);
        expect(() => assertCraftingSourcePrices(legacyGraph)).toThrow(
            "no verified empty provenance",
        );
        expect(() => assertCraftingSourcePrices(refreshed.graph)).not.toThrow();
        const manual = {
            ...legacyGraph,
            prices: { [id]: { ...legacyGraph.prices[id]!, source: "manual" as const } },
        };
        expect(() => assertCraftingSourcePrices(manual)).not.toThrow();
        expect((await refreshCraftingMarketPrices(db, manual, engine)).graph).toBe(manual);
        expect(
            (await craftingMarketSnapshots(db, legacyGraph, engine, [hour])).points[0]?.graph,
        ).toBeNull();
    }
});

const resonatorRow = {
    itemKey: emptyResonator.baseType,
    baseType: emptyResonator.baseType,
    ...craftingCommoditySignature(emptyResonatorQuote),
};
it("rejects syntactically valid references for a different input or graph scope without rejecting manual or exchange prices", async () => {
    const id = emptyResonator.ids[0];
    const valid = bindCraftingSourcePrice(graph, engine, id, emptyResonatorQuote);
    const reference = decodeCraftingSourceReference(valid.prices[id]?.cohortId)!;
    const ordinary = bindCraftingSourcePrice(graph, engine, essenceId, commodityQuote).prices[
        essenceId
    ]!;
    const wrongReferences = [
        decodeCraftingSourceReference(ordinary.cohortId)!,
        { ...reference, id: emptyResonator.ids[1] },
        { ...reference, league: "Other" },
        { ...reference, currency: "divine" },
    ];
    for (const wrong of wrongReferences) {
        const invalid = {
            ...valid,
            prices: {
                [id]: {
                    ...valid.prices[id]!,
                    cohortId: `stash-commodity:v1:${encodeURIComponent(JSON.stringify(wrong))}`,
                },
                [essenceId]: {
                    amount: 123,
                    currency: "chaos",
                    source: "manual" as const,
                    confidence: null,
                },
            },
        };
        expect(decodeCraftingSourceReference(invalid.prices[id]!.cohortId)).not.toBeNull();
        expect(() => assertCraftingSourcePrices(invalid)).toThrow("no verified empty provenance");
        const refreshed = await refreshCraftingMarketPrices(db, invalid, engine);
        expect(refreshed.issues).toHaveLength(1);
        expect(refreshed.graph.prices[id]).toBeUndefined();
        expect(refreshed.graph.prices[essenceId]?.amount).toBe(123);
    }
    expect(() => assertCraftingSourcePrices({ ...valid, game: "poe2" })).toThrow(
        "no verified empty provenance",
    );
    expect(() => assertCraftingSourcePrices(valid)).not.toThrow();
    expect(() =>
        assertCraftingSourcePrices({
            ...valid,
            prices: {
                [id]: { ...valid.prices[id]!, source: "manual", cohortId: ordinary.cohortId },
            },
        }),
    ).not.toThrow();
    const exchange = quoteExchangeSnapshot(
        {
            ...commodityExchangeSnapshot,
            marketId: `${id}|${chaosId}`,
            volumeTraded: { [id]: 10, [chaosId]: 165 },
        },
        id,
        chaosId,
    )!;
    expect(() => assertCraftingSourcePrices(bindExchangePrice(graph, id, exchange))).not.toThrow();
});
it.each([
    { signatureKind: "", signatureValue: "" },
    { signatureKind: "empty-resonator-v2" },
    { signatureValue: "reroll:3" },
    { signatureValue: "upgrade:4" },
    { baseType: "Other" },
    { name: "Named resonator" },
    { itemKey: "Other" },
    { realm: "poe2" },
    { league: "Other" },
    { corrupted: 1 },
    { identified: 0 },
    { frameType: 3 },
    { hour: hour + 3600 },
    { hour: hour - 24 * 3600 },
])("never prices an unproven resonator bucket %j", async (changes) => {
    capture({ ...resonatorRow, ...changes });
    const result = await findCraftingSourcePrices(
        graph,
        engine,
        { ids: [...emptyResonator.ids], realm: "pc" },
        db,
    );
    expect(result.quotes).toEqual({});
    expect(Object.keys(result.missing)).toEqual([...emptyResonator.ids]);
});

it.each([
    5, -1,
])("selects exact signature pairs with resonator frame %s and preserves newest-bucket refresh and historical cutoffs", async (frameType) => {
    const taggedRow = { ...resonatorRow, frameType };
    capture();
    capture({
        ...taggedRow,
        hour: hour - 3600,
        prices: { chaos: { count: 1, min: 8, median: 8, max: 8 } },
    });
    capture(taggedRow);
    capture({
        ...taggedRow,
        signatureKind: "",
        signatureValue: "",
        prices: { chaos: { count: 1, min: 1, median: 1, max: 1 } },
    });
    capture({
        signatureKind: emptyResonator.variant,
        signatureValue: emptyResonator.signatureValue,
        prices: { chaos: { count: 1, min: 99, median: 99, max: 99 } },
    });
    const options = { ids: [essenceId, ...emptyResonator.ids], realm: "pc" as const };
    const result = await findCraftingSourcePrices(graph, engine, options, db);
    expect(result.missing).toEqual({});
    const commodityQuery = statements.find((statement) => statement.includes("`signatureKind`"));
    expect(commodityQuery?.match(/`signatureKind` = \?/g)).toHaveLength(2);
    expect(commodityQuery?.match(/`itemKey` in \(/g)).toHaveLength(2);
    expect(result.quotes[essenceId]).toEqual(commodityQuote);
    for (const id of emptyResonator.ids)
        expect(result.quotes[id]).toEqual({ ...emptyResonatorQuote, id });
    const id = emptyResonator.ids[1];
    const manual = { amount: 123, currency: "chaos", source: "manual" as const, confidence: null };
    const bound = bindCraftingSourcePrice(
        { ...graph, prices: { [essenceId]: manual } },
        engine,
        id,
        { ...emptyResonatorQuote, id, hour: hour - 3600 },
    );
    const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph.prices[essenceId]).toEqual(manual);
    expect(decodeCraftingSourceReference(refreshed.graph.prices[id]?.cohortId)).toMatchObject({
        id,
        variant: emptyResonator.variant,
    });
    const snapshots = await craftingMarketSnapshots(db, refreshed.graph, engine, [
        hour - 3600,
        hour,
    ]);
    expect(snapshots.points.map((point) => point.graph?.prices[id]?.amount)).toEqual([8, 16.5]);
    sqlite
        .prepare(
            `DELETE FROM ${DB_TABLE_PREFIX}stash_poe1_unique_hourly WHERE hour=? AND itemKey=? AND signatureKind=?`,
        )
        .run(hour, emptyResonator.baseType, emptyResonator.variant);
    capture({ ...taggedRow, prices: {} });
    expect((await findCraftingSourcePrices(graph, engine, options, db)).quotes[id]).toBeUndefined();
    expect((await refreshCraftingMarketPrices(db, refreshed.graph, engine)).issues).toHaveLength(1);
    expect(
        (await craftingMarketSnapshots(db, refreshed.graph, engine, [hour])).points[0]?.graph,
    ).toBeNull();
});

it("requires explicit conversion and the resonator bucket's own exchange hour", async () => {
    capture({ ...resonatorRow, prices: { divine: { count: 1, min: 2, median: 2, max: 2 } } });
    const id = emptyResonator.ids[0];
    const options = { ids: [id], realm: "pc" as const };
    captureExchange({ hour: hour - 3600 });
    const convert = { ...options, conversion: "exchange-v1" as const };
    expect((await findCraftingSourcePrices(graph, engine, convert, db)).quotes).toEqual({});
    captureExchange();
    expect((await findCraftingSourcePrices(graph, engine, options, db)).quotes).toEqual({});
    const result = await findCraftingSourcePrices(graph, engine, convert, db);
    expect(result.quotes[id]).toEqual({
        ...convertedCommodityQuote,
        id,
        baseType: emptyResonator.baseType,
        variant: emptyResonator.variant,
    });
    const bound = bindCraftingSourcePrice(graph, engine, id, result.quotes[id]!);
    expect(decodeCraftingSourceReference(bound.prices[id]?.cohortId)).toMatchObject({
        variant: emptyResonator.variant,
        conversion: "exchange-v1",
        exchange: convertedCommodityQuote.exchange,
    });
});

it("selects and refreshes the latest Fundamental Fossil ask without using an older positive observation", async () => {
    const fossilRow = {
        itemKey: fossilName,
        baseType: fossilName,
        listingCount: 4,
        uniqueSellers: 4,
    };
    capture({
        ...fossilRow,
        hour: hour - 3600,
        prices: { chaos: { count: 1, min: 50, median: 50, max: 50 } },
    });
    capture({ ...fossilRow, prices: { chaos: { count: 1, min: 19, median: 19, max: 19 } } });
    const quote = commoditySourceQuoteSchema.parse({
        ...commodityQuote,
        id: fossilId,
        baseType: fossilName,
        amount: 19,
        low: 19,
        high: 19,
        samples: 1,
        listingCount: 4,
        uniqueSellers: 4,
    });
    const options = { ids: [fossilId], realm: "pc" as const };
    expect(await findCraftingSourcePrices(graph, engine, options, db)).toEqual({
        quotes: { [fossilId]: quote },
        missing: {},
    });
    const bound = bindCraftingSourcePrice(graph, engine, fossilId, quote);
    expect(bound.prices[fossilId]).toMatchObject({
        amount: 19,
        samples: 1,
        observedAt: new Date(hour * 1000).toISOString(),
    });
    expect(decodeCraftingSourceReference(bound.prices[fossilId]?.cohortId)).toMatchObject({
        source: "stash-commodity",
        id: fossilId,
        baseType: fossilName,
    });
    expect((await refreshCraftingMarketPrices(db, bound, engine)).issues).toEqual([]);
    expect(
        (await craftingMarketSnapshots(db, bound, engine, [hour - 3600, hour])).points.map(
            (point) => point.graph?.prices[fossilId]?.amount,
        ),
    ).toEqual([50, 19]);
    sqlite.prepare(`DELETE FROM ${DB_TABLE_PREFIX}stash_poe1_unique_hourly WHERE hour=?`).run(hour);
    capture({ ...fossilRow, prices: {} });
    expect((await findCraftingSourcePrices(graph, engine, options, db)).quotes).toEqual({});
});

it("supports uniquely named modeled currencies and refuses stateful, unknown, duplicate and PoE 2 identities", () => {
    expect(craftingCommodityIdentity(engine, unravellingId)).toEqual({
        id: unravellingId,
        baseType: unravellingName,
    });
    expect(craftingCommodityIdentity(engine, "Metadata/Items/Currency/Unknown")).toBeNull();
    expect(
        craftingCommodityIdentity(new CraftingEngine(getCatalog("poe2")), unravellingId),
    ).toBeNull();
    for (const suffix of [
        "CurrencyImprint",
        "CurrencyItemisedSextantModifier",
        "CurrencyItemisedNecropolisCorpse",
        "CurrencyItemisedCapturedMonster",
        "CurrencyAddGemExperience",
        "CurrencyAddCrucibleExperience",
        "CurrencyIncubationFaridunLowStackable",
        "CurrencyIncubationFaridunHighStackable",
        "CurrencyIncubationFaridunMapStackable",
    ]) {
        const id = `Metadata/Items/Currency/${suffix}`;
        expect(catalog.crafting.currencies.find((entry) => entry.id === id)).toBeDefined();
        expect(craftingCommodityIdentity(engine, id)).toBeNull();
        expect(() =>
            bindCraftingSourcePrice(graph, engine, id, {
                ...unravellingQuote,
                id,
                baseType: catalog.crafting.currencies.find((entry) => entry.id === id)!.name,
            }),
        ).toThrow("catalog currency");
    }
    const currency = catalog.crafting.currencies.find((entry) => entry.id === unravellingId)!;
    for (const action of ["", "unknown-action"]) {
        const unsupported = structuredClone(catalog);
        unsupported.crafting.currencies.find((entry) => entry.id === unravellingId)!.action =
            action;
        expect(
            craftingCommodityIdentity(new CraftingEngine(unsupported), unravellingId),
        ).toBeNull();
    }
    for (const extra of [
        { ...currency, id: "duplicate" },
        { ...currency, name: "Other name" },
        currency,
    ]) {
        const duplicate = structuredClone(catalog);
        duplicate.crafting.currencies.push(extra);
        expect(craftingCommodityIdentity(new CraftingEngine(duplicate), unravellingId)).toBeNull();
    }
});

it("selects and refreshes exact Unravelling asks without exchange fallback or manual replacement", async () => {
    const currencyRow = {
        itemKey: unravellingName,
        baseType: unravellingName,
        listingCount: 12,
        uniqueSellers: 11,
        prices: {
            chaos: { count: 1, min: 200, median: 200, max: 200 },
            divine: { count: 1, min: 1, median: 1, max: 1 },
        },
    };
    capture({ ...currencyRow, hour: hour - 3600 });
    capture(currencyRow);
    const options = { ids: [unravellingId], realm: "pc" as const };
    const result = await findCraftingSourcePrices(graph, engine, options, db);
    expect(result).toEqual({ quotes: { [unravellingId]: unravellingQuote }, missing: {} });
    const manual = {
        ...graph,
        prices: {
            [unravellingId]: {
                amount: 123,
                currency: "chaos",
                source: "manual" as const,
                confidence: null,
            },
        },
    };
    expect((await refreshCraftingMarketPrices(db, manual, engine)).graph).toBe(manual);
    const bound = bindCraftingSourcePrice(manual, engine, unravellingId, {
        ...unravellingQuote,
        hour: hour - 3600,
    });
    expect(decodeCraftingSourceReference(bound.prices[unravellingId]?.cohortId)).toMatchObject({
        source: "stash-commodity",
        id: unravellingId,
        baseType: unravellingName,
    });
    const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph.prices[unravellingId]).toMatchObject({
        amount: 200,
        samples: 1,
        observedAt: new Date(hour * 1000).toISOString(),
    });
    const snapshots = await craftingMarketSnapshots(db, refreshed.graph, engine, [
        hour - 3600,
        hour,
    ]);
    expect(snapshots.points.map((point) => point.graph?.prices[unravellingId]?.amount)).toEqual([
        200, 200,
    ]);
    expect(
        (await findCraftingSourcePrices(graph, engine, { ...options, realm: "poe2" }, db)).quotes,
    ).toEqual({});
    sqlite.prepare(`DELETE FROM ${DB_TABLE_PREFIX}stash_poe1_unique_hourly WHERE hour=?`).run(hour);
    capture({ ...currencyRow, prices: {} });
    captureExchange();
    expect((await findCraftingSourcePrices(graph, engine, options, db)).quotes).toEqual({});
    const missing = await refreshCraftingMarketPrices(db, refreshed.graph, engine);
    expect(missing.graph).toBe(refreshed.graph);
    expect(missing.issues).toHaveLength(1);
    expect(
        (await craftingMarketSnapshots(db, refreshed.graph, engine, [hour])).points[0]?.graph,
    ).toBeNull();
});

it.each([
    { realm: "poe2" },
    { league: "Other" },
    { itemKey: "Other" },
    { baseType: "Other" },
    { name: "Named variant" },
    { frameType: 3 },
    { frameType: -1 },
    { identified: 0 },
    { corrupted: 1 },
    { signatureKind: "variant" },
    { signatureValue: "variant" },
    { hour: hour + 3600 },
    { hour: hour - 24 * 3600 },
    { listingCount: 0 },
    { uniqueSellers: 0 },
    { tab: "other" },
    { tab: "" },
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
        sqlite
            .prepare(`DELETE FROM ${DB_TABLE_PREFIX}stash_poe1_unique_hourly WHERE hour=?`)
            .run(hour);
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
    sqlite.exec(`DELETE FROM ${DB_TABLE_PREFIX}stash_poe1_unique_hourly`);
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
    sqlite.exec(`DELETE FROM ${DB_TABLE_PREFIX}stash_poe1_currency_hourly`);
    sqlite.exec(`DELETE FROM ${DB_TABLE_PREFIX}stash_poe1_currency_market`);
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
    sqlite.prepare(`DELETE FROM ${DB_TABLE_PREFIX}stash_poe1_unique_hourly WHERE hour=?`).run(hour);
    capture({ prices: {} });
    expect((await findCraftingSourcePrices(graph, engine, convertedOptions, db)).quotes).toEqual(
        {},
    );
});
