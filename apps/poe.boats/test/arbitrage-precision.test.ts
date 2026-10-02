import { expect, it } from "vite-plus/test";
import { getVendorRecipes } from "~/data/vendor-recipes";
import { findArbitrage } from "~/lib/arbitrage";
import { DEFAULT_ARBITRAGE_OPTIONS } from "~/schemas/arbitrage";

it("does not treat floating-point rounding as arbitrage profit", () => {
    const recipe = getVendorRecipes("1")[0];
    const result = findArbitrage(
        [recipe],
        {
            game: "1",
            league: "Standard",
            fetchedAt: "2026-10-02T00:00:00.000Z",
            unavailableCategories: [],
            quotes: { [recipe.input.id]: { value: 0.3 }, [recipe.output.id]: { value: 0.9 } },
        },
        DEFAULT_ARBITRAGE_OPTIONS,
    );
    expect(result.pricedCount).toBe(1);
    expect(result.opportunities).toEqual([]);
});
