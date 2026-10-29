import identities from "@poe-tools/market/yellow-beasts-poe1.json";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "~/db/client";
import { findCraftingRecipeListings } from "~/db/queries/crafting-recipes.queries";
import { RECIPE_BEASTS } from "~/lib/crafting-beasts";
import { bindCraftingSourcePrice, liveSourcePrices } from "~/lib/crafting-sources";
import { isYellowBeast, yellowBeastPool } from "~/lib/crafting-yellow-beasts";
import { refreshCraftingMarketPrices } from "~/operations/crafting-market.server";
import { findCraftingSourcePrices } from "~/services/crafting-sources.server";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { engine } from "./crafting-fixtures";

vi.mock("~/db/queries/crafting-recipes.queries", async (importOriginal) => ({
    ...(await importOriginal<typeof import("~/db/queries/crafting-recipes.queries")>()),
    findCraftingRecipeListings: vi.fn(),
}));

const id = "EinharMasterCraft27";
const options = { ids: [id], realm: "pc" as const };
const hour = Math.floor(Date.now() / 3_600_000) * 3600 - 3600;
const db = createDbConnection("mysql://test:test@localhost/poe_test");
const species = [
    { name: "Mountain Lynx", unitPrice: 3, listingCount: 1, hour },
    { name: "Cave Beast", unitPrice: 7, listingCount: 3, hour },
];
const captured: [string, number, number][] = [
    ["Craicic Croaker", 10, 100],
    ...species.map(({ name, unitPrice, listingCount }): [string, number, number] => [
        name,
        unitPrice,
        listingCount,
    ]),
    ["Wild Bristle Matron", 9999, 9999],
    ["Unknown Beast", 1, 9999],
];

function listings(entries = captured) {
    vi.mocked(findCraftingRecipeListings).mockResolvedValue(
        new Map(
            entries.map(([name, unitPrice, listingCount]) => [
                name,
                { unitPrice, listingCount, hour },
            ]),
        ),
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    listings();
});

describe("generic yellow-beast prices", () => {
    it("retains a pinned derived allowlist disjoint from its exclusions and the named beasts", () => {
        expect(identities.build).toBe("3.29.3.3");
        expect(identities.names).toHaveLength(169);
        expect(new Set(identities.names).size).toBe(identities.names.length);
        expect(identities.excludedNames.some(isYellowBeast)).toBe(false);
        expect(Object.values(RECIPE_BEASTS).some(isYellowBeast)).toBe(false);
    });
    it.each([
        "Mountain Lynx",
        "Cave Beast",
        "Chimeric Croaker",
        "Plummeting Ursa",
        "Crustacean Sniper",
    ])("accepts the reviewed generic species %s", (name) => {
        expect(isYellowBeast(name)).toBe(true);
    });
    it.each([
        "Craicic Croaker",
        "Farric Lynx Alpha",
        "Wild Bristle Matron",
        "Primal Crushclaw",
        "Black Morrigan",
        "Farrul, First of the Plains",
        "The Great White Beast",
        "Albino Rhoa",
        "Carrion Minion",
        "Unknown Beast",
    ])("excludes named, disabled or unknown species %s", (name) => {
        expect(isYellowBeast(name)).toBe(false);
    });
    it("uses a listing-count-weighted mean, not a median or a seller count", () => {
        expect(yellowBeastPool(species)).toEqual({ unitPrice: 6, listingCount: 4 });
        expect(() => yellowBeastPool([...species, species[0]!])).toThrow("unambiguous");
        expect(() => yellowBeastPool([{ ...species[0]!, listingCount: 0 }])).toThrow("unpriced");
        expect(() => yellowBeastPool([{ ...species[0]!, unitPrice: 0 }])).toThrow("unpriced");
    });
    it("prices three generic sacrifices from the pool while keeping the named imprint beast separate", async () => {
        const graph = exchangeGraph();
        const result = await findCraftingSourcePrices(graph, engine, options, db);
        expect(result.missing).toEqual({});
        const quote = result.quotes[id]!;
        expect(quote.amount).toBe(28);
        if (quote.source !== "stash-recipe") throw new Error("Expected beast source");
        expect(quote.components).toHaveLength(2);
        expect(quote.components[1]).toEqual({
            itemKey: "yellow-beast",
            quantity: 3,
            unitPrice: 6,
            listingCount: 4,
            hour,
            pool: {
                estimator: "listing-count-weighted-mean-v1",
                // The lookup returns species in the allowlist's order.
                species: species.toSorted((a, b) => a.name.localeCompare(b.name)),
            },
        });
        const bound = bindCraftingSourcePrice(graph, engine, id, quote);
        expect(bound.prices[id]?.amount).toBe(28);
        expect(bound.prices[id]?.samples).toBeUndefined();
        expect(liveSourcePrices(bound)[0]?.reference).toMatchObject({
            yellowBeasts: "listing-count-weighted-mean-v1",
        });
        expect(() =>
            bindCraftingSourcePrice(graph, engine, id, {
                ...quote,
                components: quote.components.map((entry) =>
                    entry.pool ? { ...entry, unitPrice: 2 } : entry,
                ),
            }),
        ).toThrow("weighted");
        expect(() =>
            bindCraftingSourcePrice(graph, engine, id, {
                ...quote,
                components: quote.components.map((entry) =>
                    entry.pool
                        ? {
                              ...entry,
                              pool: {
                                  ...entry.pool,
                                  species: [{ ...species[0]!, name: "Craicic Croaker" }],
                              },
                          }
                        : entry,
                ),
            }),
        ).toThrow("unsupported");
        expect(() =>
            bindCraftingSourcePrice(graph, engine, id, { ...quote, yellowBeasts: undefined }),
        ).toThrow("policy");
    });
    it("refuses an empty pool rather than using a named proxy", async () => {
        listings(captured.filter(([name]) => !isYellowBeast(name)));
        const result = await findCraftingSourcePrices(exchangeGraph(), engine, options, db);
        expect(result.quotes).toEqual({});
        expect(result.missing[id]).toContain("whole recipe remains unpriced");
    });
    it("preserves a saved species-specific value and reports that explicit rebinding is needed", async () => {
        const graph = exchangeGraph();
        graph.prices[id] = {
            amount: 369,
            currency: "chaos",
            source: "market",
            confidence: null,
            cohortId: `poeninja:v1:${encodeURIComponent(JSON.stringify({ source: "poe.ninja", game: "poe1", realm: "pc", league: graph.league, currency: "chaos", id, assumption: "rare-beast-mountain-lynx-v1" }))}`,
        };
        const result = await refreshCraftingMarketPrices(db, graph, engine);
        expect(result.graph).toEqual(graph);
        expect(result.issues.join(" ")).toContain("rebind");
        expect(findCraftingRecipeListings).not.toHaveBeenCalled();
    });
    it("reports an unpriced current pool on refresh and does not replace it with stale or manual prices", async () => {
        const graph = exchangeGraph();
        const first = await findCraftingSourcePrices(graph, engine, options, db);
        const bound = bindCraftingSourcePrice(graph, engine, id, first.quotes[id]!);
        listings(captured.filter(([name]) => !isYellowBeast(name)));
        const result = await refreshCraftingMarketPrices(db, bound, engine);
        expect(result.graph).toEqual(bound);
        expect(result.issues.join(" ")).toContain("Yellow Beast");
        const manual = {
            ...bound,
            prices: {
                ...bound.prices,
                [id]: {
                    amount: 123,
                    currency: "chaos",
                    source: "manual" as const,
                    confidence: null,
                },
            },
        };
        expect((await refreshCraftingMarketPrices(db, manual, engine)).graph).toEqual(manual);
    });
});
