import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import {
    findCraftingRecipeListings,
    type RecipeListing,
    recipeMarketKey,
} from "~/db/queries/crafting-recipes.queries";
import { getMarketExchangeLeagues } from "~/db/queries/market.queries";
import { loadClusterRecipeMarket } from "~/services/cluster-recipe.server";

vi.mock("~/db/queries/market.queries", () => ({ getMarketExchangeLeagues: vi.fn() }));
vi.mock("~/db/queries/crafting-recipes.queries", async (importOriginal) => ({
    ...(await importOriginal<typeof import("~/db/queries/crafting-recipes.queries")>()),
    findCraftingRecipeListings: vi.fn(),
}));

const db = {} as TDatabase;
const hour = Date.parse("2026-11-17T03:00:00Z") / 1000;
const minion12 = {
    itemKey: "Large Cluster Jewel",
    base: "Minions deal 10% increased Damage · 12 passives · ilvl 84+",
};
const reservation3 = {
    itemKey: "Small Cluster Jewel",
    base: "6% increased Mana Reservation Efficiency of Skills · 3 passives · ilvl 84+",
};

function mockListings(entries: [{ itemKey: string; base: string }, RecipeListing][]) {
    vi.mocked(findCraftingRecipeListings).mockResolvedValue(
        new Map(entries.map(([market, listing]) => [recipeMarketKey(market), listing])),
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMarketExchangeLeagues).mockResolvedValue(["Current League", "Standard"]);
    mockListings([
        [minion12, { unitPrice: 2945, listingCount: 41, hour }],
        [reservation3, { unitPrice: 1395, listingCount: 71, hour: hour - 3600 }],
    ]);
});

describe("cluster jewel recipe market", () => {
    it("prices every outcome from chaos asks in the band of the requested item level", async () => {
        const result = await loadClusterRecipeMarket(db, null, 84);
        expect(result).toMatchObject({ league: "Current League", itemLevel: 84, error: null });
        expect(getMarketExchangeLeagues).toHaveBeenCalledWith(db, "pc");
        const [, league, currency, markets, at] = vi.mocked(findCraftingRecipeListings).mock
            .calls[0]!;
        expect([league, currency, at]).toEqual(["Current League", "chaos", undefined]);
        expect(markets).toHaveLength(28 + 57 + 85);
        expect(markets).toContainEqual(minion12);
        expect(markets.every((market) => market.base?.endsWith(" · ilvl 84+"))).toBe(true);
        expect(result.snapshot).toEqual({
            league: "Current League",
            band: { min: 84, max: 100 },
            fetchedAt: "2026-11-17T03:00:00.000Z",
            quotes: {
                "affliction_minion_damage:12": { value: 2945, listingCount: 41 },
                "affliction_reservation_efficiency_small:3": { value: 1395, listingCount: 71 },
            },
        });
    });

    it("reads the band that holds a lower item level", async () => {
        await loadClusterRecipeMarket(db, "Standard", 80);
        const [, league, , markets] = vi.mocked(findCraftingRecipeListings).mock.calls[0]!;
        expect(league).toBe("Standard");
        expect(markets.every((market) => market.base?.endsWith(" · ilvl 75–83"))).toBe(true);
    });

    it("does not query prices for an unsupported league", async () => {
        const result = await loadClusterRecipeMarket(db, "not-a-league", 84);
        expect(result).toMatchObject({ league: "", snapshot: null });
        expect(result.error).toContain("not available");
        expect(findCraftingRecipeListings).not.toHaveBeenCalled();
    });

    it("explains when no Cluster Jewel ask was captured", async () => {
        mockListings([]);
        const result = await loadClusterRecipeMarket(db, null, 84);
        expect(result.snapshot).toMatchObject({ fetchedAt: null, quotes: {} });
        expect(result.error).toContain("No Cluster Jewel asks");
    });
});
