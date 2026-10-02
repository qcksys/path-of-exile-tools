import { describe, expect, it } from "vite-plus/test";
import { CURRENCY_VENDOR_RECIPES } from "~/data/currency-vendor-recipes";
import { MANUAL_VENDOR_RECIPES } from "~/data/manual-vendor-recipes";
import { getVendorRecipes } from "~/data/vendor-recipes";
import { buildRecipeTradeUrl, calculateRecipeScenario, findArbitrage } from "~/lib/arbitrage";
import { DEFAULT_ARBITRAGE_OPTIONS, ManualVendorRecipeSchema } from "~/schemas/arbitrage";

describe("PoE 1 currency exchanges", () => {
    it("prices every output scroll and separates selling from NPC purchases", () => {
        const recipes = CURRENCY_VENDOR_RECIPES.filter((recipe) =>
            ["1:sell:transmute:wisdom", "1:purchase:wisdom:portal"].includes(recipe.id),
        );
        const result = findArbitrage(
            recipes,
            {
                game: "1",
                league: "Standard",
                fetchedAt: "2026-10-02T00:00:00Z",
                unavailableCategories: [],
                quotes: { transmute: { value: 1 }, wisdom: { value: 0.5 }, portal: { value: 3 } },
            },
            DEFAULT_ARBITRAGE_OPTIONS,
        );
        expect(result.opportunities).toHaveLength(2);
        expect(result.opportunities.find((entry) => entry.recipe.method === "sell")).toMatchObject({
            cost: 1,
            revenue: 2,
            profit: 1,
            roi: 100,
        });
        expect(
            result.opportunities.find((entry) => entry.recipe.method === "purchase"),
        ).toMatchObject({ cost: 1.5, revenue: 3, profit: 1.5, roi: 100 });
    });
    it("includes the requested currencies using exchange identifiers, only in PoE 1", () => {
        for (const id of ["wisdom", "portal", "alch", "chance", "scour", "transmute"])
            expect(CURRENCY_VENDOR_RECIPES.some((recipe) => recipe.output.id === id)).toBe(true);
        expect(
            CURRENCY_VENDOR_RECIPES.filter((recipe) => recipe.method === "purchase"),
        ).toHaveLength(12);
        expect(getVendorRecipes("2").some((recipe) => recipe.category === "currency")).toBe(false);
        const url = new URL(buildRecipeTradeUrl("1", "Standard", "transmute"));
        expect(JSON.parse(url.searchParams.get("q")!).exchange.want).toEqual(["transmute"]);
    });
    it("never invents a price for missing low-value currencies", () => {
        const result = findArbitrage(
            CURRENCY_VENDOR_RECIPES,
            {
                game: "1",
                league: "Standard",
                fetchedAt: "2026-10-02T00:00:00Z",
                unavailableCategories: [],
                quotes: { portal: { value: 1 } },
            },
            DEFAULT_ARBITRAGE_OPTIONS,
        );
        expect(result.opportunities).toEqual([]);
        expect(result.missingPrices).toHaveLength(CURRENCY_VENDOR_RECIPES.length);
    });
});

describe("item-specific recipe scenarios", () => {
    it("applies the buffer to the whole input batch and computes the break-even sale price", () => {
        const result = calculateRecipeScenario({ inputCost: 5, outputValue: 10, buffer: 20 });
        expect(result).toMatchObject({
            cost: 6,
            revenue: 8,
            profit: 2,
            breakEven: 7.5,
        });
        expect(result?.roi).toBeCloseTo(100 / 3);
    });
    it("accepts a worthless output as a loss and rejects unpriced or invalid inputs", () => {
        expect(calculateRecipeScenario({ inputCost: 5, outputValue: 0, buffer: 0 })?.profit).toBe(
            -5,
        );
        expect(() =>
            calculateRecipeScenario({ inputCost: 0, outputValue: 1, buffer: 0 }),
        ).toThrow();
        expect(() =>
            calculateRecipeScenario({ inputCost: 5, outputValue: -1, buffer: 0 }),
        ).toThrow();
        expect(() =>
            calculateRecipeScenario({ inputCost: 5, outputValue: 1, buffer: 100 }),
        ).toThrow();
        expect(
            calculateRecipeScenario({ inputCost: Number.MAX_VALUE, outputValue: 1, buffer: 99 }),
        ).toBeNull();
    });
    it("keeps random and item-specific recipes out of automatic profit rankings", () => {
        for (const recipe of MANUAL_VENDOR_RECIPES) {
            expect(ManualVendorRecipeSchema.safeParse(recipe).success).toBe(true);
            expect(getVendorRecipes("1").some((item) => item.id === recipe.id)).toBe(false);
        }
        expect(MANUAL_VENDOR_RECIPES.some((recipe) => recipe.input.quantity === 5)).toBe(true);
        expect(MANUAL_VENDOR_RECIPES.some((recipe) => recipe.input.quantity === 3)).toBe(true);
        expect(
            MANUAL_VENDOR_RECIPES.find((recipe) => recipe.id === "1:manual:unique"),
        ).toMatchObject({ outcome: "random", conditions: expect.stringContaining("Foulborn") });
    });
});
