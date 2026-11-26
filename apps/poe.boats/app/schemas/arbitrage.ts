import { z } from "zod";

export const ArbitrageGameSchema = z.enum(["1", "2"]);
export type ArbitrageGame = z.infer<typeof ArbitrageGameSchema>;

export const RecipeCategorySchema = z.enum(["oils", "essences", "emotions", "runes", "currency"]);
export type RecipeCategory = z.infer<typeof RecipeCategorySchema>;

const RecipeItemSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
});

export const VendorRecipeSchema = z.object({
    id: z.string().min(1),
    game: ArbitrageGameSchema,
    category: RecipeCategorySchema,
    input: RecipeItemSchema,
    output: RecipeItemSchema,
    source: z.url(),
    method: z.enum(["purchase", "sell"]).optional(),
    notes: z.string().optional(),
});
export type VendorRecipe = z.infer<typeof VendorRecipeSchema>;

const minimumTradedUnits = z.number().int().nonnegative().default(0);

export const ArbitrageOptionsSchema = z.object({
    buffer: z.number().min(0).max(99),
    minimumProfit: z.number().nonnegative(),
    minimumInputUnits24h: minimumTradedUnits,
    minimumOutputUnits24h: minimumTradedUnits,
    category: z.union([z.literal("all"), RecipeCategorySchema]),
    sort: z.enum(["profit", "roi"]),
    showUnprofitable: z.boolean(),
});
export type ArbitrageOptions = z.input<typeof ArbitrageOptionsSchema>;

export const ManualVendorRecipeSchema = VendorRecipeSchema.pick({
    id: true,
    input: true,
    output: true,
    source: true,
}).extend({
    name: z.string().min(1),
    conditions: z.string().min(1),
    outcome: z.enum(["random", "item-dependent"]),
});
export type ManualVendorRecipe = z.infer<typeof ManualVendorRecipeSchema>;

export const RecipeScenarioSchema = ArbitrageOptionsSchema.pick({ buffer: true }).extend({
    inputCost: z.number().positive(),
    outputValue: z.number().nonnegative(),
});

export const DEFAULT_ARBITRAGE_OPTIONS: ArbitrageOptions = {
    buffer: 0,
    minimumProfit: 0,
    minimumInputUnits24h: 0,
    minimumOutputUnits24h: 0,
    category: "all",
    sort: "profit",
    showUnprofitable: false,
};

export const MarketQuoteSchema = z.object({
    value: z.number().positive(),
    units24h: z.number().int().nonnegative().optional(),
});
export type MarketQuote = z.infer<typeof MarketQuoteSchema>;

export const MarketSnapshotSchema = z.object({
    game: ArbitrageGameSchema,
    league: z.string().min(1),
    fetchedAt: z.iso.datetime(),
    quotes: z.record(z.string(), MarketQuoteSchema),
    unavailableCategories: z.array(RecipeCategorySchema),
});
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;

export const ClusterJewelSizeSchema = z.enum([
    "Small Cluster Jewel",
    "Medium Cluster Jewel",
    "Large Cluster Jewel",
]);
export type ClusterJewelSize = z.infer<typeof ClusterJewelSizeSchema>;

/** The lowest input item level, which the 5-for-1 recipe's output keeps; coerced from a query. */
export const ClusterRecipeItemLevelSchema = z.coerce.number().int().min(1).max(100);

const ClusterRecipeQuoteSchema = z.object({
    /** Median merchant-tab ask in chaos. */
    value: z.number().positive(),
    listingCount: z.number().int().positive(),
});

export const ClusterRecipeSnapshotSchema = z.object({
    league: z.string().min(1),
    /** The market item level band holding the requested item level. */
    band: z.object({ min: z.number().int(), max: z.number().int() }),
    /** The newest hour any quote comes from, or null when none is priced. */
    fetchedAt: z.iso.datetime().nullable(),
    /** Priced outcomes by `<skill id>:<passive count>`; missing outcomes are unpriced. */
    quotes: z.record(z.string(), ClusterRecipeQuoteSchema),
});
export type ClusterRecipeSnapshot = z.infer<typeof ClusterRecipeSnapshotSchema>;

export const ClusterRecipeOptionsSchema = ArbitrageOptionsSchema.pick({ buffer: true });
export type ClusterRecipeOptions = z.infer<typeof ClusterRecipeOptionsSchema>;

export const ClusterRecipeOutcomeResultSchema = z.object({
    id: z.string(),
    label: z.string(),
    passives: z.number().int(),
    /** Median chaos ask, or null when unpriced (counted as 0). */
    value: z.number().nullable(),
    listingCount: z.number().int(),
    /** Share of the size's expected value. */
    share: z.number(),
});

export const ClusterRecipeSizeResultSchema = z.object({
    baseType: ClusterJewelSizeSchema,
    outcomeCount: z.number().int(),
    pricedCount: z.number().int(),
    /** Average sale value per craft after the buffer, unpriced outcomes counting as 0. */
    expectedValue: z.number(),
    expectedValueWithoutTop: z.number(),
    medianValue: z.number(),
    /** Highest price per input that breaks even, inputs costing the buffer more. */
    breakEvenInput: z.number(),
    /** The lowest priced outcome market's ask, as the cheapest input on offer. */
    cheapestInput: z.number().nullable(),
    cost: z.number().nullable(),
    profit: z.number().nullable(),
    roi: z.number().nullable(),
    /** Fraction of outcomes worth at least the cost after the buffer. */
    chanceAboveCost: z.number().nullable(),
    /** Break-even input price when outcomes asking under `below` go back into the recipe. */
    recycled: z.object({ below: z.number(), breakEvenInput: z.number() }),
    outcomes: z.array(ClusterRecipeOutcomeResultSchema),
});
export type ClusterRecipeSizeResult = z.infer<typeof ClusterRecipeSizeResultSchema>;

export const MARKET_CURRENCIES = {
    "1": { id: "chaos", name: "Chaos Orb", short: "chaos" },
    "2": { id: "exalted", name: "Exalted Orb", short: "exalted" },
} as const;
