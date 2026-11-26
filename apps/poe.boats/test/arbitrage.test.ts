import { describe, expect, it } from "vite-plus/test";
import { getVendorRecipes, VENDOR_RECIPES } from "~/data/vendor-recipes";
import { buildRecipeTradeUrl, findArbitrage } from "~/lib/arbitrage";
import {
    DEFAULT_ARBITRAGE_OPTIONS,
    type MarketSnapshot,
    VendorRecipeSchema,
} from "~/schemas/arbitrage";

const oil = getVendorRecipes("1")[0];
const secondOil = getVendorRecipes("1")[1];
const snapshot: MarketSnapshot = {
    game: "1",
    league: "Standard",
    fetchedAt: "2026-10-02T00:00:00.000Z",
    unavailableCategories: [],
    quotes: {
        "clear-oil": { value: 1, units24h: 50 },
        "sepia-oil": { value: 5, units24h: 10 },
        "amber-oil": { value: 18, units24h: 1 },
    },
};

describe("recipe catalogue", () => {
    it("contains valid, uniquely identified recipes for both games", () => {
        for (const recipe of VENDOR_RECIPES)
            expect(VendorRecipeSchema.safeParse(recipe).success).toBe(true);
        expect(new Set(VENDOR_RECIPES.map((recipe) => recipe.id)).size).toBe(VENDOR_RECIPES.length);
        expect(getVendorRecipes("1").length).toBeGreaterThan(0);
        expect(getVendorRecipes("2").length).toBeGreaterThan(0);
    });
    it("respects terminal tiers and excludes random and special recipes", () => {
        expect(
            VENDOR_RECIPES.some((recipe) =>
                /Golden Oil|Deafening|Greater|Perfect|Isolation|Ancient|Potent|Prismatic|Catalyst|Ward|Charging/.test(
                    recipe.input.name,
                ),
            ),
        ).toBe(false);
        expect(
            VENDOR_RECIPES.some((recipe) => recipe.input.name === "Whispering Essence of Dread"),
        ).toBe(false);
        expect(
            VENDOR_RECIPES.find((recipe) => recipe.input.name === "Azure Oil")?.output.name,
        ).toBe("Indigo Oil");
    });
});

describe("arbitrage calculations", () => {
    it.each([
        [2, 10],
        [30, 0],
        [30, undefined],
    ])(
        "excludes an essence upgrade without a traded batch on both sides (%s, %s)",
        (inputUnits, outputUnits) => {
            const recipe = getVendorRecipes("1").find((entry) => entry.category === "essences")!;
            const quotes = {
                [recipe.input.id]: { value: 1, units24h: inputUnits },
                [recipe.output.id]: { value: 10, units24h: outputUnits },
            };
            expect(
                findArbitrage([recipe], { ...snapshot, quotes }, DEFAULT_ARBITRAGE_OPTIONS)
                    .opportunities,
            ).toEqual([]);
        },
    );
    it("accounts for all three inputs and sorts by net profit", () => {
        const result = findArbitrage([oil, secondOil], snapshot, DEFAULT_ARBITRAGE_OPTIONS);
        expect(result.pricedCount).toBe(2);
        expect(result.opportunities.map(({ profit }) => profit)).toEqual([3, 2]);
        expect(result.opportunities[1]).toMatchObject({
            cost: 3,
            revenue: 5,
            inputUnits24h: 50,
            outputUnits24h: 10,
            batches24h: 10,
        });
        expect(result.opportunities[1].roi).toBeCloseTo(66.6667);
    });
    it("can sort by return on cost instead of absolute profit", () => {
        const { opportunities } = findArbitrage([oil, secondOil], snapshot, {
            ...DEFAULT_ARBITRAGE_OPTIONS,
            sort: "roi",
        });
        expect(opportunities[0].recipe.id).toBe(oil.id);
    });
    it.each([
        [50, 0, true],
        [51, 0, false],
        [0, 10, true],
        [0, 11, false],
        [50, 10, true],
        [51, 11, false],
    ])(
        "applies input and output unit minimums (%i, %i)",
        (minimumInputUnits24h, minimumOutputUnits24h, qualifies) => {
            const result = findArbitrage([oil], snapshot, {
                ...DEFAULT_ARBITRAGE_OPTIONS,
                minimumInputUnits24h,
                minimumOutputUnits24h,
            });
            expect(result.opportunities).toHaveLength(qualifies ? 1 : 0);
            expect(result.bestRoi !== null).toBe(qualifies);
            expect(result.lowVolumeCount).toBe(qualifies ? 0 : 1);
            expect(result.pricedCount).toBe(1);
        },
    );
    it("applies explicit minimums to all priced recipes, including unknown volumes", () => {
        const market = { ...snapshot, quotes: { ...snapshot.quotes, "clear-oil": { value: 1 } } };
        const options = {
            ...DEFAULT_ARBITRAGE_OPTIONS,
            showUnprofitable: true,
            minimumOutputUnits24h: 10,
        };
        expect(findArbitrage([oil], market, options).opportunities).toHaveLength(1);
        expect(
            findArbitrage([oil], market, { ...options, minimumInputUnits24h: 1 }).opportunities,
        ).toEqual([]);
    });
    it("keeps volume minimums optional for existing calculation requests", () => {
        expect(
            findArbitrage([oil], snapshot, {
                buffer: 0,
                category: "all",
                minimumProfit: 0,
                sort: "profit",
                showUnprofitable: false,
            }),
        ).toEqual(findArbitrage([oil], snapshot, DEFAULT_ARBITRAGE_OPTIONS));
    });
    it("applies the buffer to both sides before filtering", () => {
        const options = { ...DEFAULT_ARBITRAGE_OPTIONS, buffer: 10 };
        const result = findArbitrage([oil], snapshot, options);
        expect(result.opportunities[0].cost).toBeCloseTo(3.3);
        expect(result.opportunities[0].revenue).toBeCloseTo(4.5);
        expect(result.opportunities[0].profit).toBeCloseTo(1.2);
        expect(
            findArbitrage([oil], snapshot, { ...options, minimumProfit: 1.3 }).opportunities,
        ).toEqual([]);
    });
    it("excludes break-even and losses unless requested", () => {
        const market = {
            ...snapshot,
            quotes: {
                "clear-oil": { value: 1, units24h: 3 },
                "sepia-oil": { value: 3, units24h: 1 },
            },
        };
        expect(findArbitrage([oil], market, DEFAULT_ARBITRAGE_OPTIONS).opportunities).toEqual([]);
        const result = findArbitrage([oil], market, {
            ...DEFAULT_ARBITRAGE_OPTIONS,
            buffer: 10,
            showUnprofitable: true,
            minimumProfit: 50,
        });
        expect(result.opportunities[0].profit).toBeCloseTo(-0.6);
    });
    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined])(
        "excludes missing or invalid input prices (%s)",
        (value) => {
            const quotes = { ...snapshot.quotes };
            if (value === undefined) delete quotes[oil.input.id];
            else quotes[oil.input.id] = { value };
            const result = findArbitrage([oil], { ...snapshot, quotes }, DEFAULT_ARBITRAGE_OPTIONS);
            expect(result.opportunities).toEqual([]);
            expect(result.missingPrices).toEqual([oil]);
        },
    );
    it("excludes missing outputs and prices from other games or categories", () => {
        expect(
            findArbitrage([oil], { ...snapshot, quotes: {} }, DEFAULT_ARBITRAGE_OPTIONS)
                .missingPrices,
        ).toEqual([oil]);
        expect(
            findArbitrage([oil], { ...snapshot, game: "2" }, DEFAULT_ARBITRAGE_OPTIONS).pricedCount,
        ).toBe(0);
        expect(
            findArbitrage([oil], snapshot, { ...DEFAULT_ARBITRAGE_OPTIONS, category: "essences" })
                .pricedCount,
        ).toBe(0);
    });
    it.each([-1, 100, Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects an invalid buffer (%s)",
        (buffer) => {
            expect(() =>
                findArbitrage([oil], snapshot, { ...DEFAULT_ARBITRAGE_OPTIONS, buffer }),
            ).toThrow();
        },
    );
    it("prices PoE 2 emotion upgrades", () => {
        const recipe = getVendorRecipes("2")[0];
        const market = {
            ...snapshot,
            game: "2" as const,
            quotes: {
                [recipe.input.id]: { value: 2, units24h: 4 },
                [recipe.output.id]: { value: 9, units24h: 1 },
            },
        };
        expect(
            findArbitrage([recipe], market, DEFAULT_ARBITRAGE_OPTIONS).opportunities[0],
        ).toMatchObject({ cost: 6, revenue: 9, profit: 3, roi: 50 });
    });
    it("builds game-specific trade links and encodes league names", () => {
        const url = new URL(buildRecipeTradeUrl("2", "A League & More", "desert-rune"));
        expect(url.pathname).toBe("/trade2/exchange/poe2/A%20League%20%26%20More");
        expect(JSON.parse(url.searchParams.get("q") ?? "")).toEqual({
            exchange: { status: { option: "online" }, have: ["exalted"], want: ["desert-rune"] },
        });
        expect(buildRecipeTradeUrl("1", "Standard", "clear-oil")).toContain(
            "/trade/exchange/Standard?",
        );
    });
});
