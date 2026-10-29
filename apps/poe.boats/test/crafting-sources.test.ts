import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "~/db/client";
import {
    findCraftingRecipeListings,
    type RecipeListing,
} from "~/db/queries/crafting-recipes.queries";
import {
    bindCraftingSourcePrice,
    craftingSourceRecipe,
    liveSourcePrices,
} from "~/lib/crafting-sources";
import {
    craftingMarketSnapshots,
    refreshCraftingMarketPrices,
} from "~/operations/crafting-market.server";
import { findCraftingSourcePrices } from "~/services/crafting-sources.server";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { engine } from "./crafting-fixtures";

vi.mock("~/db/queries/crafting-recipes.queries", async (importOriginal) => ({
    ...(await importOriginal<typeof import("~/db/queries/crafting-recipes.queries")>()),
    findCraftingRecipeListings: vi.fn(),
}));

const id = "EinharMasterCraftMorrigan7";
const assumption = "rare-beast-mountain-lynx-v1" as const;
const options = { ids: [id], realm: "pc" as const };
const hour = Math.floor(Date.now() / 3_600_000) * 3600 - 3600;
const db = createDbConnection("mysql://test:test@localhost/poe_test");
const prices: [string, number][] = [
    ["Black Morrigan", 600],
    ["Craicic Sand Spitter", 1],
    ["Mountain Lynx", 3],
    ["Craicic Croaker", 360],
    ["Craicic Savage Crab", 1],
    ["Saqawine Cobra", 1],
    ["Chronicle of Atzoatl|Locus of Corruption", 1000],
];

/** Captured listings by market key, each with 100 listings in the latest completed hour. */
function listings(entries = prices, extra: Partial<RecipeListing> = {}) {
    vi.mocked(findCraftingRecipeListings).mockResolvedValue(
        new Map(
            entries.map(([key, unitPrice]) => [
                key,
                { unitPrice, listingCount: 100, hour, ...extra },
            ]),
        ),
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    listings();
});

describe("captured beast and temple prices", () => {
    it("prices all four beasts from one listing lookup and binds a complete recipe", async () => {
        const graph = exchangeGraph();
        const result = await findCraftingSourcePrices(
            graph,
            engine,
            { ...options, ids: [id, "EinharMasterCraft27", "EinharMasterCraft49"] },
            db,
        );
        expect(result.missing).toEqual({});
        const quote = result.quotes[id]!;
        if (quote.source !== "stash-recipe") throw new Error("Expected beast source");
        expect(quote.amount).toBe(607);
        expect(quote.hour).toBe(hour);
        expect(quote.components.map(({ itemKey, quantity }) => [itemKey, quantity])).toEqual([
            ["Craicic Sand Spitter", 1],
            ["Black Morrigan", 1],
            ["yellow-beast", 2],
        ]);
        expect(result.quotes.EinharMasterCraft27?.amount).toBe(369);
        expect(result.quotes.EinharMasterCraft49?.amount).toBe(8);
        expect(findCraftingRecipeListings).toHaveBeenCalledOnce();
        const [, league, currency, markets, at] = vi.mocked(findCraftingRecipeListings).mock
            .calls[0]!;
        expect([league, currency, at]).toEqual([graph.league, "chaos", undefined]);
        expect(markets).toEqual(
            expect.arrayContaining([{ itemKey: "Craicic Croaker" }, { itemKey: "Mountain Lynx" }]),
        );
        const bound = bindCraftingSourcePrice(graph, engine, id, quote);
        expect(bound.prices[id]).toMatchObject({
            amount: 607,
            source: "market",
            confidence: null,
            observedAt: new Date(hour * 1000).toISOString(),
        });
        expect(liveSourcePrices(bound)[0]?.reference).toMatchObject({
            source: "stash-recipe",
            yellowBeasts: "listing-count-weighted-mean-v1",
        });
        for (const wrong of [
            { league: "Other" },
            { currency: "divine" },
            { game: "poe2" as const },
        ])
            expect(() =>
                bindCraftingSourcePrice({ ...graph, ...wrong }, engine, id, quote),
            ).toThrow("does not match");
        expect(() =>
            bindCraftingSourcePrice(graph, engine, id, {
                ...quote,
                components: quote.components.slice(0, 2),
            }),
        ).toThrow("every component");
        expect(() =>
            bindCraftingSourcePrice(graph, engine, id, { ...quote, hour: hour + 3600 }),
        ).toThrow("completed hour");
    });
    it("refuses retired species assumptions, level-sensitive beasts, other platforms and non-tradeable services without a lookup", async () => {
        const graph = exchangeGraph();
        const result = await findCraftingSourcePrices(
            graph,
            engine,
            { ...options, assumption, ids: [id, "EinharMasterCraft30", "service:recombine"] },
            db,
        );
        expect(result.quotes).toEqual({});
        expect(result.missing[id]).toContain("rebind");
        expect(result.missing.EinharMasterCraft30).toContain("level");
        expect(result.missing["service:recombine"]).toContain("non-tradeable");
        expect(
            (await findCraftingSourcePrices(graph, engine, { ...options, realm: "xbox" }, db))
                .quotes,
        ).toEqual({});
        expect(findCraftingRecipeListings).not.toHaveBeenCalled();
    });
    it("keeps a converted ask's original currency and rate", async () => {
        listings(prices, { exchange: { currency: "chaos", unitPrice: 360, rate: 1 / 360 } });
        const graph = { ...exchangeGraph(), currency: "divine" };
        const result = await findCraftingSourcePrices(graph, engine, options, db);
        const quote = result.quotes[id]!;
        if (quote.source !== "stash-recipe") throw new Error("Expected beast source");
        expect(quote.components[0]?.exchange).toEqual({
            currency: "chaos",
            unitPrice: 360,
            rate: 1 / 360,
        });
        expect(vi.mocked(findCraftingRecipeListings).mock.calls[0]![2]).toBe("divine");
        expect(bindCraftingSourcePrice(graph, engine, id, quote).prices[id]?.currency).toBe(
            "divine",
        );
    });
    it("keeps the whole recipe unknown when any required component has no captured ask", async () => {
        listings(prices.filter(([key]) => key !== "Craicic Sand Spitter"));
        const result = await findCraftingSourcePrices(exchangeGraph(), engine, options, db);
        expect(result.quotes).toEqual({});
        expect(result.missing[id]).toContain("Craicic Sand Spitter");
        expect(result.missing[id]).toContain("whole recipe remains unpriced");
    });
    it("prices the exact Locus temple market, including at historical hours", async () => {
        const graph = exchangeGraph();
        const templeId = engine.catalog.crafting.locus!.id;
        expect(craftingSourceRecipe(engine, templeId).components).toEqual([
            { itemKey: "Chronicle of Atzoatl", rooms: "Locus of Corruption", quantity: 1 },
        ]);
        const result = await findCraftingSourcePrices(
            graph,
            engine,
            { ids: [templeId], realm: "pc" },
            db,
        );
        const bound = bindCraftingSourcePrice(graph, engine, templeId, result.quotes[templeId]!);
        expect(bound.prices[templeId]?.amount).toBe(1000);
        expect((await refreshCraftingMarketPrices(db, bound, engine)).issues).toEqual([]);
        const historical = await craftingMarketSnapshots(db, bound, engine, [1791428400]);
        expect(historical.points[0]?.issues).toEqual([]);
        expect(vi.mocked(findCraftingRecipeListings).mock.lastCall?.[4]).toBe(1791428400);
    });
    it("rebinds a price saved from poe.ninja to captured listings on refresh", async () => {
        const graph = exchangeGraph();
        graph.prices[id] = {
            amount: 500,
            currency: "chaos",
            source: "market",
            confidence: null,
            cohortId: `poeninja:v1:${encodeURIComponent(JSON.stringify({ source: "poe.ninja", game: "poe1", realm: "pc", league: graph.league, currency: "chaos", id, yellowBeasts: "listing-count-weighted-mean-v1" }))}`,
        };
        const refreshed = await refreshCraftingMarketPrices(db, graph, engine);
        expect(refreshed.issues).toEqual([]);
        expect(refreshed.graph.prices[id]?.amount).toBe(607);
        expect(liveSourcePrices(refreshed.graph)[0]?.reference.source).toBe("stash-recipe");
    });
    it("does not edit the graph when a later lookup has the same price", async () => {
        const graph = exchangeGraph();
        const result = await findCraftingSourcePrices(graph, engine, options, db);
        const bound = bindCraftingSourcePrice(graph, engine, id, result.quotes[id]!);
        const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
        expect(refreshed.issues).toEqual([]);
        expect(refreshed.graph).toEqual(bound);
    });
});
