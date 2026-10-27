import { DatabaseSync } from "node:sqlite";
import { convertExchangeQuote, quoteExchangeSnapshot } from "@poe-tools/market";
import { drizzle } from "drizzle-orm/mysql-proxy";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DB_TABLE_PREFIX } from "~/const";
import type { TDatabase } from "~/db/client";
import { CraftingEngine } from "~/lib/crafting-engine";
import {
    assertCraftingSourcePrices,
    bindCraftingSourcePrice,
    decodeCraftingSourceReference,
} from "~/lib/crafting-sources";
import { craftingVendorUpgrade, craftingVendorUpgradePaths } from "~/lib/crafting-vendor-upgrades";
import {
    craftingMarketSnapshots,
    refreshCraftingMarketPrices,
} from "~/operations/crafting-market.server";
import { craftingSourceQuoteSchema, vendorUpgradePathSchema } from "~/schemas/crafting-sources";
import { findCraftingSourcePrices } from "~/services/crafting-sources.server";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { catalog, engine } from "./crafting-fixtures";
import {
    vendorCurrencyInputId,
    vendorCurrencyOutputId,
    vendorCurrencyQuote,
    vendorCurrencySnapshot,
    vendorHour,
    vendorInputId,
    vendorMiddleId,
    vendorOutputId,
    vendorQuote,
    vendorSnapshot,
} from "./crafting-vendor-upgrade-fixtures";

let sqlite: DatabaseSync;
let db: TDatabase;
const options = {
    realm: "pc" as const,
    ids: [vendorOutputId],
    vendorUpgrade: { inputId: vendorInputId },
};
function capture(
    changes: Partial<Omit<typeof vendorSnapshot, "volumeTraded">> & {
        volumeTraded?: Record<string, number>;
    } = {},
) {
    const entry = { ...vendorSnapshot, ...changes };
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
    vi.setSystemTime((vendorHour + 9000) * 1000);
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec(
        `CREATE TABLE ${DB_TABLE_PREFIX}stash_currency_hourly (realm TEXT, league TEXT, hour INTEGER, marketId TEXT, volumeTraded TEXT, lowestRatio TEXT, highestRatio TEXT)`,
    );
    sqlite.exec(`CREATE TABLE ${DB_TABLE_PREFIX}stash_unique_hourly (
        realm TEXT, league TEXT, hour INTEGER, itemKey TEXT, baseType TEXT, name TEXT,
        frameType INTEGER, identified INTEGER, corrupted INTEGER, foilVariation INTEGER,
        signatureKind TEXT, signatureValue TEXT, listingCount INTEGER, uniqueSellers INTEGER, prices TEXT)`);
    db = drizzle(async (sql, params) => {
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

it("resolves the verified 9-Weeping route and refuses backwards, cross-family, unknown and other-game paths", () => {
    expect(
        craftingVendorUpgradePaths(engine, vendorOutputId).map((path) => [
            path.inputId,
            path.quantity,
        ]),
    ).toEqual([
        [vendorMiddleId, 3],
        [vendorInputId, 9],
    ]);
    expect(vendorQuote.path.steps.map((step) => step.recipeId)).toEqual([
        "1:weeping-essence-of-rage",
        "1:wailing-essence-of-rage",
    ]);
    for (const input of [
        vendorOutputId,
        "Metadata/Items/Currency/CurrencyEssenceRage4",
        "Metadata/Items/Currency/CurrencyEssenceGreed1",
        "missing",
    ])
        expect(() => craftingVendorUpgrade(engine, vendorOutputId, input)).toThrow(
            "verified forward",
        );
    expect(
        craftingVendorUpgradePaths(
            new CraftingEngine({ ...catalog, game: "poe2" }),
            vendorOutputId,
        ),
    ).toEqual([]);
});

it("prices the selected exact ingredient, retains its low volume and replaces a manual amount only on binding", async () => {
    vi.setSystemTime((vendorHour + 5400) * 1000);
    capture();
    const graph = {
        ...exchangeGraph(),
        prices: {
            [vendorOutputId]: {
                amount: 91,
                currency: "chaos",
                source: "manual" as const,
                confidence: null,
            },
        },
    };
    const result = await findCraftingSourcePrices(graph, engine, options, db);
    expect(result).toEqual({ quotes: { [vendorOutputId]: vendorQuote }, missing: {} });
    expect(graph.prices[vendorOutputId]?.amount).toBe(91);
    const bound = bindCraftingSourcePrice(
        graph,
        engine,
        vendorOutputId,
        result.quotes[vendorOutputId]!,
    );
    expect(bound.prices[vendorOutputId]).toMatchObject({
        amount: 18,
        confidence: null,
        observedAt: new Date(vendorHour * 1000).toISOString(),
    });
    expect(bound.prices[vendorOutputId]).not.toHaveProperty("samples");
    expect(decodeCraftingSourceReference(bound.prices[vendorOutputId]?.cohortId)).toMatchObject({
        path: vendorQuote.path,
        ingredient: { itemVolume: 3, quoteVolume: 6 },
    });
});

it("refuses forged paths, quantities, arithmetic, input quotes, scope, and incomplete hours", () => {
    const graph = exchangeGraph();
    for (const bad of [
        { ...vendorQuote, path: { ...vendorQuote.path, quantity: 3 } },
        {
            ...vendorQuote,
            path: { ...vendorQuote.path, steps: [...vendorQuote.path.steps].reverse() },
        },
        { ...vendorQuote, amount: 17 },
        { ...vendorQuote, ingredient: { ...vendorQuote.ingredient, amount: 3 } },
        { ...vendorQuote, ingredient: { ...vendorQuote.ingredient, itemId: vendorMiddleId } },
        { ...vendorQuote, ingredient: { ...vendorQuote.ingredient, itemVolume: 0 } },
        { ...vendorQuote, ingredient: { ...vendorQuote.ingredient, marketId: "wrong|pair" } },
        {
            ...vendorQuote,
            ingredient: { ...vendorQuote.ingredient, windowStart: vendorHour - 3600 },
        },
        { ...vendorQuote, ingredient: { ...vendorQuote.ingredient, league: "Other" } },
        { ...vendorQuote, ingredient: { ...vendorQuote.ingredient, hour: vendorHour + 7200 } },
    ])
        expect(() => bindCraftingSourcePrice(graph, engine, vendorOutputId, bad)).toThrow();
    expect(() =>
        bindCraftingSourcePrice({ ...graph, game: "poe2" }, engine, vendorOutputId, vendorQuote),
    ).toThrow("does not match");
});

it("retains explicit conversion even with a direct quote, and verifies every matching-hour conversion leg", async () => {
    vi.setSystemTime((vendorHour + 5400) * 1000);
    capture();
    const result = await findCraftingSourcePrices(
        exchangeGraph(),
        engine,
        {
            ...options,
            vendorUpgrade: { inputId: vendorInputId, conversion: "reference-currency-v1" },
        },
        db,
    );
    const direct = result.quotes[vendorOutputId]!;
    expect(direct).toMatchObject({
        source: "vendor-upgrade",
        conversion: "reference-currency-v1",
        ingredient: { conversion: "reference-currency-v1" },
    });
    expect(() =>
        bindCraftingSourcePrice(exchangeGraph(), engine, vendorOutputId, direct),
    ).not.toThrow();
    const divine = "Metadata/Items/Currency/CurrencyModValues";
    const chaos = "Metadata/Items/Currency/CurrencyRerollRare";
    const first = quoteExchangeSnapshot(
        {
            ...vendorSnapshot,
            marketId: `${vendorInputId}|${divine}`,
            volumeTraded: { [vendorInputId]: 3, [divine]: 1 },
        },
        vendorInputId,
        divine,
    )!;
    const second = quoteExchangeSnapshot(
        {
            ...vendorSnapshot,
            marketId: `${divine}|${chaos}`,
            volumeTraded: { [divine]: 1, [chaos]: 300 },
        },
        divine,
        chaos,
    )!;
    const ingredient = convertExchangeQuote(first, second)!;
    const converted = {
        ...vendorQuote,
        conversion: "reference-currency-v1" as const,
        ingredient,
        amount: 900,
    };
    expect(
        bindCraftingSourcePrice(exchangeGraph(), engine, vendorOutputId, converted).prices[
            vendorOutputId
        ]?.amount,
    ).toBe(900);
    for (const bad of [
        { ...converted, conversion: undefined },
        {
            ...converted,
            conversion: undefined,
            ingredient: { ...ingredient, conversion: undefined },
        },
        { ...converted, ingredient: { ...ingredient, windowStart: vendorHour - 3600 } },
        {
            ...converted,
            ingredient: {
                ...ingredient,
                legs: [first, { ...second, hour: vendorHour - 3600 }],
            },
        },
        {
            ...converted,
            ingredient: {
                ...ingredient,
                legs: [{ ...first, amount: 1 }, second],
            },
        },
    ])
        expect(() =>
            bindCraftingSourcePrice(
                exchangeGraph(),
                engine,
                vendorOutputId,
                craftingSourceQuoteSchema.parse(bad),
            ),
        ).toThrow();
});

it("prices an explicitly selected vendor ingredient through a same-hour non-reference exchange item", async () => {
    vi.setSystemTime((vendorHour + 5400) * 1000);
    const bridge = "Metadata/Items/Currency/CurrencyHellscapeAddModToRare";
    const chaos = "Metadata/Items/Currency/CurrencyRerollRare";
    capture({
        marketId: `${vendorInputId}|${bridge}`,
        volumeTraded: { [vendorInputId]: 3, [bridge]: 2 },
    });
    capture({
        marketId: `${bridge}|${chaos}`,
        volumeTraded: { [bridge]: 4, [chaos]: 40 },
    });
    const prior = await findCraftingSourcePrices(
        exchangeGraph(),
        engine,
        {
            ...options,
            vendorUpgrade: { inputId: vendorInputId, conversion: "reference-currency-v1" },
        },
        db,
    );
    expect(prior.quotes).toEqual({});
    const result = await findCraftingSourcePrices(
        exchangeGraph(),
        engine,
        {
            ...options,
            vendorUpgrade: { inputId: vendorInputId, conversion: "two-leg-exchange-v1" },
        },
        db,
    );
    const quote = result.quotes[vendorOutputId]!;
    expect(quote).toMatchObject({
        source: "vendor-upgrade",
        conversion: "two-leg-exchange-v1",
        ingredient: {
            conversion: "two-leg-exchange-v1",
            hour: vendorHour,
            estimator: "cross-rate-v1",
            legs: [
                { itemId: vendorInputId, quoteId: bridge, hour: vendorHour },
                { itemId: bridge, quoteId: chaos, hour: vendorHour },
            ],
        },
    });
    expect(quote.amount).toBeCloseTo(60);
    const bound = bindCraftingSourcePrice(exchangeGraph(), engine, vendorOutputId, quote);
    expect(decodeCraftingSourceReference(bound.prices[vendorOutputId]?.cohortId)).toMatchObject({
        conversion: "two-leg-exchange-v1",
        path: vendorQuote.path,
    });
    vi.setSystemTime((vendorHour + 9000) * 1000);
    const history = await craftingMarketSnapshots(db, bound, engine, [
        vendorHour,
        vendorHour + 3600,
    ]);
    expect(history.points[0]?.graph?.prices[vendorOutputId]?.amount).toBeCloseTo(60);
    expect(history.points[1]?.graph).toBeNull();
    expect((await refreshCraftingMarketPrices(db, bound, engine)).issues).toHaveLength(1);
    vi.setSystemTime((vendorHour + 5400) * 1000);
    const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph.prices[vendorOutputId]?.amount).toBeCloseTo(60);
    const vendor = craftingSourceQuoteSchema.parse(quote);
    if (vendor.source !== "vendor-upgrade") throw new Error("Expected vendor-upgrade quote");
    for (const bad of [
        {
            ...vendor,
            conversion: "reference-currency-v1",
            ingredient: { ...vendor.ingredient, conversion: "reference-currency-v1" },
        },
        {
            ...vendor,
            ingredient: {
                ...vendor.ingredient,
                legs: [
                    vendor.ingredient.legs![0],
                    { ...vendor.ingredient.legs![1], hour: vendorHour - 3600 },
                ],
            },
        },
        {
            ...vendor,
            ingredient: {
                ...vendor.ingredient,
                legs: [{ ...vendor.ingredient.legs![0], amount: 5 }, vendor.ingredient.legs![1]],
            },
        },
    ])
        expect(() =>
            bindCraftingSourcePrice(
                exchangeGraph(),
                engine,
                vendorOutputId,
                craftingSourceQuoteSchema.parse(bad),
            ),
        ).toThrow();
});

it("keeps the fixed input and path when a closer-tier quote appears, and refreshes unchanged amounts with new provenance", async () => {
    capture();
    const bound = bindCraftingSourcePrice(exchangeGraph(), engine, vendorOutputId, vendorQuote);
    capture({ hour: vendorHour + 3600 });
    capture({
        marketId: `${vendorMiddleId}|Metadata/Items/Currency/CurrencyRerollRare`,
        volumeTraded: { [vendorMiddleId]: 10, "Metadata/Items/Currency/CurrencyRerollRare": 1 },
    });
    const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph.prices[vendorOutputId]).toMatchObject({
        amount: 18,
        observedAt: new Date((vendorHour + 3600) * 1000).toISOString(),
    });
    expect(
        decodeCraftingSourceReference(refreshed.graph.prices[vendorOutputId]?.cohortId),
    ).toMatchObject({ path: vendorQuote.path });
    const history = await craftingMarketSnapshots(db, refreshed.graph, engine, [vendorHour]);
    expect(history.points[0]?.issues).toEqual([]);
    expect(history.points[0]?.graph?.prices[vendorOutputId]?.observedAt).toBe(
        new Date(vendorHour * 1000).toISOString(),
    );
});

it.each([
    "missing",
    "zero",
])("marks a %s latest ingredient hour unavailable and restores it after a later quote", async (latest) => {
    capture();
    if (latest === "zero")
        capture({
            hour: vendorHour + 3600,
            volumeTraded: { [vendorInputId]: 0, "Metadata/Items/Currency/CurrencyRerollRare": 0 },
        });
    const bound = bindCraftingSourcePrice(exchangeGraph(), engine, vendorOutputId, vendorQuote);
    const result = await findCraftingSourcePrices(bound, engine, options, db);
    expect(result.quotes).toEqual({});
    expect(result.missing[vendorOutputId]).toBeTruthy();
    const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
    expect(refreshed.graph.prices[vendorOutputId]?.amount).toBe(
        bound.prices[vendorOutputId]?.amount,
    );
    expect(refreshed.graph.prices[vendorOutputId]?.cohortId).not.toBe(
        bound.prices[vendorOutputId]?.cohortId,
    );
    expect(
        decodeCraftingSourceReference(refreshed.graph.prices[vendorOutputId]?.cohortId),
    ).toMatchObject({ source: "vendor-upgrade", path: vendorQuote.path });
    expect(() => assertCraftingSourcePrices(refreshed.graph)).toThrow(
        "vendor ingredient exchange price is unavailable",
    );
    expect(refreshed.issues).toHaveLength(1);
    const history = await craftingMarketSnapshots(db, bound, engine, [
        vendorHour,
        vendorHour + 3600,
    ]);
    expect(history.points[0]?.graph?.prices[vendorOutputId]?.amount).toBe(18);
    expect(history.points[1]?.graph).toBeNull();
    sqlite
        .prepare(`DELETE FROM ${DB_TABLE_PREFIX}stash_currency_hourly WHERE hour = ?`)
        .run(vendorHour + 3600);
    capture({ hour: vendorHour + 3600 });
    const restored = await refreshCraftingMarketPrices(db, refreshed.graph, engine);
    expect(restored.issues).toEqual([]);
    expect(restored.graph.prices[vendorOutputId]?.amount).toBe(18);
    expect(restored.graph.prices[vendorOutputId]?.cohortId).not.toContain("unavailable");
    expect(() => assertCraftingSourcePrices(restored.graph)).not.toThrow();
});

it("returns explicit refusal for unsupported requests without using a different source", async () => {
    for (const request of [
        { ...options, realm: "poe2" as const },
        { ...options, vendorUpgrade: { inputId: vendorOutputId } },
    ]) {
        const result = await findCraftingSourcePrices(exchangeGraph(), engine, request, db);
        expect(result.quotes).toEqual({});
        expect(result.missing[vendorOutputId]).toBeTruthy();
    }
});

it("exposes only the exact one-hop NPC purchase, excluding sell, reverse and multi-hop currency paths", () => {
    expect(craftingVendorUpgradePaths(engine, vendorCurrencyOutputId)).toEqual([
        vendorCurrencyQuote.path,
    ]);
    const alteration = "Metadata/Items/Currency/CurrencyRerollMagic";
    expect(craftingVendorUpgradePaths(engine, alteration).map((path) => path.inputId)).toEqual([
        vendorCurrencyOutputId,
    ]);
    expect(
        craftingVendorUpgradePaths(engine, "Metadata/Items/Currency/CurrencyIdentification"),
    ).toEqual([]);
    for (const [output, input] of [
        [vendorCurrencyInputId, vendorCurrencyOutputId],
        [alteration, vendorCurrencyInputId],
        [vendorCurrencyOutputId, "missing"],
    ])
        expect(() => craftingVendorUpgrade(engine, output!, input!)).toThrow("verified forward");
    expect(
        craftingVendorUpgradePaths(
            new CraftingEngine({ ...catalog, game: "poe2" }),
            vendorCurrencyOutputId,
        ),
    ).toEqual([]);
    expect(
        vendorQuote.path.steps.every(
            (step) =>
                step.inputQuantity === 3 && !step.method && !step.instructions && !step.sourceUrl,
        ),
    ).toBe(true);
    expect(vendorUpgradePathSchema.parse(vendorQuote.path)).toEqual(vendorQuote.path);
});

it("refuses missing or ambiguous canonical currency names and IDs", () => {
    const input = catalog.crafting.currencies.find((entry) => entry.id === vendorCurrencyInputId)!;
    const output = catalog.crafting.currencies.find(
        (entry) => entry.id === vendorCurrencyOutputId,
    )!;
    for (const currencies of [
        catalog.crafting.currencies.filter((entry) => entry.id !== input.id),
        [...catalog.crafting.currencies, { ...input, id: `${input.id}Other` }],
        [...catalog.crafting.currencies, { ...output, id: `${output.id}Other` }],
        [...catalog.crafting.currencies, { ...input, name: "Other currency" }],
        catalog.crafting.currencies.map((entry) =>
            entry.id === input.id ? { ...entry, id: "transmute" } : entry,
        ),
    ]) {
        const ambiguous = new CraftingEngine({
            ...catalog,
            crafting: { ...catalog.crafting, currencies },
        });
        expect(craftingVendorUpgradePaths(ambiguous, vendorCurrencyOutputId)).toEqual([]);
    }
});

it("quotes four fresh Transmutations only on explicit selection and preserves manual amounts until binding", async () => {
    vi.setSystemTime((vendorHour + 5400) * 1000);
    capture(vendorCurrencySnapshot);
    const graph = {
        ...exchangeGraph(),
        prices: {
            [vendorCurrencyOutputId]: {
                amount: 7,
                currency: "chaos",
                source: "manual" as const,
                confidence: null,
            },
        },
    };
    const ordinary = await findCraftingSourcePrices(
        graph,
        engine,
        { realm: "pc", ids: [vendorCurrencyOutputId] },
        db,
    );
    expect(ordinary.quotes).toEqual({});
    expect(ordinary.missing[vendorCurrencyOutputId]).toBeTruthy();
    const result = await findCraftingSourcePrices(
        graph,
        engine,
        {
            realm: "pc",
            ids: [vendorCurrencyOutputId],
            vendorUpgrade: { inputId: vendorCurrencyInputId },
        },
        db,
    );
    expect(result).toEqual({
        quotes: { [vendorCurrencyOutputId]: vendorCurrencyQuote },
        missing: {},
    });
    expect(graph.prices[vendorCurrencyOutputId]?.amount).toBe(7);
    const bound = bindCraftingSourcePrice(
        graph,
        engine,
        vendorCurrencyOutputId,
        vendorCurrencyQuote,
    );
    expect(bound.prices[vendorCurrencyOutputId]).toMatchObject({
        amount: 4 * (7 / 3150),
        confidence: null,
        observedAt: new Date(vendorHour * 1000).toISOString(),
    });
    expect(bound.prices[vendorCurrencyOutputId]).not.toHaveProperty("samples");
    expect(
        decodeCraftingSourceReference(bound.prices[vendorCurrencyOutputId]?.cohortId),
    ).toMatchObject({
        path: vendorCurrencyQuote.path,
        ingredient: { itemId: vendorCurrencyInputId, itemVolume: 3150, quoteVolume: 7 },
    });
});

it("refuses forged NPC quantities, methods and provenance, and other-game binding", () => {
    const graph = exchangeGraph();
    const step = vendorCurrencyQuote.path.steps[0]!;
    for (const changes of [
        { inputQuantity: 3 },
        { inputQuantity: 729 },
        { recipeId: "1:sell:transmute:wisdom" },
        { method: undefined },
        { instructions: "Use the sell window." },
        { sourceUrl: "https://example.com/forged" },
        { inputName: "Orb of Alteration" },
    ]) {
        const bad = {
            ...vendorCurrencyQuote,
            path: { ...vendorCurrencyQuote.path, steps: [{ ...step, ...changes }] },
        };
        expect(() => bindCraftingSourcePrice(graph, engine, vendorCurrencyOutputId, bad)).toThrow(
            "exact verified recipe",
        );
    }
    for (const inputQuantity of [0, -1, 1.5, 730])
        expect(
            vendorUpgradePathSchema.safeParse({
                ...vendorCurrencyQuote.path,
                steps: [{ ...step, inputQuantity }],
            }).success,
        ).toBe(false);
    expect(() =>
        bindCraftingSourcePrice(graph, engine, vendorCurrencyOutputId, {
            ...vendorCurrencyQuote,
            amount: 4,
        }),
    ).toThrow("quantity times");
    expect(() =>
        bindCraftingSourcePrice(
            { ...graph, game: "poe2" },
            engine,
            vendorCurrencyOutputId,
            vendorCurrencyQuote,
        ),
    ).toThrow("does not match");
});

it("refreshes the selected NPC ingredient and historical path even when a direct output quote appears", async () => {
    capture(vendorCurrencySnapshot);
    const bound = bindCraftingSourcePrice(
        exchangeGraph(),
        engine,
        vendorCurrencyOutputId,
        vendorCurrencyQuote,
    );
    capture({
        ...vendorCurrencySnapshot,
        hour: vendorHour + 3600,
        volumeTraded: {
            [vendorCurrencyInputId]: 100,
            "Metadata/Items/Currency/CurrencyRerollRare": 1,
        },
    });
    capture({
        hour: vendorHour + 3600,
        marketId: `${vendorCurrencyOutputId}|Metadata/Items/Currency/CurrencyRerollRare`,
        volumeTraded: {
            [vendorCurrencyOutputId]: 1000,
            "Metadata/Items/Currency/CurrencyRerollRare": 1,
        },
    });
    const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
    expect(refreshed.issues).toEqual([]);
    expect(refreshed.graph.prices[vendorCurrencyOutputId]?.amount).toBe(0.04);
    expect(
        decodeCraftingSourceReference(refreshed.graph.prices[vendorCurrencyOutputId]?.cohortId),
    ).toMatchObject({
        path: vendorCurrencyQuote.path,
        ingredient: {
            itemId: vendorCurrencyInputId,
            hour: vendorHour + 3600,
            itemVolume: 100,
            quoteVolume: 1,
        },
    });
    const history = await craftingMarketSnapshots(db, refreshed.graph, engine, [
        vendorHour,
        vendorHour + 3600,
    ]);
    expect(
        history.points.map((point) => point.graph?.prices[vendorCurrencyOutputId]?.amount),
    ).toEqual([4 * (7 / 3150), 0.04]);
});

it("keeps an NPC estimate unresolved after newer zero-volume ingredients without falling back to the output market", async () => {
    capture(vendorCurrencySnapshot);
    capture({
        ...vendorCurrencySnapshot,
        hour: vendorHour + 3600,
        volumeTraded: {
            [vendorCurrencyInputId]: 0,
            "Metadata/Items/Currency/CurrencyRerollRare": 0,
        },
    });
    capture({
        hour: vendorHour + 3600,
        marketId: `${vendorCurrencyOutputId}|Metadata/Items/Currency/CurrencyRerollRare`,
        volumeTraded: {
            [vendorCurrencyOutputId]: 100,
            "Metadata/Items/Currency/CurrencyRerollRare": 1,
        },
    });
    const bound = bindCraftingSourcePrice(
        exchangeGraph(),
        engine,
        vendorCurrencyOutputId,
        vendorCurrencyQuote,
    );
    const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
    expect(refreshed.issues).toHaveLength(1);
    expect(refreshed.graph.prices[vendorCurrencyOutputId]?.amount).toBe(
        bound.prices[vendorCurrencyOutputId]?.amount,
    );
    expect(() => assertCraftingSourcePrices(refreshed.graph)).toThrow(
        "vendor ingredient exchange price is unavailable",
    );
    const history = await craftingMarketSnapshots(db, bound, engine, [vendorHour + 3600]);
    expect(history.points[0]?.graph).toBeNull();
});
