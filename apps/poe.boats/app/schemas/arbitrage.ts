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

export const ArbitrageOptionsSchema = z.object({
    buffer: z.number().min(0).max(99),
    minimumProfit: z.number().nonnegative(),
    category: z.union([z.literal("all"), RecipeCategorySchema]),
    sort: z.enum(["profit", "roi"]),
    showUnprofitable: z.boolean(),
});
export type ArbitrageOptions = z.infer<typeof ArbitrageOptionsSchema>;

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
    category: "all",
    sort: "profit",
    showUnprofitable: false,
};

export const MarketQuoteSchema = z.object({ value: z.number().positive() });
export type MarketQuote = z.infer<typeof MarketQuoteSchema>;

export const MarketSnapshotSchema = z.object({
    game: ArbitrageGameSchema,
    league: z.string().min(1),
    fetchedAt: z.iso.datetime(),
    quotes: z.record(z.string(), MarketQuoteSchema),
    unavailableCategories: z.array(RecipeCategorySchema),
});
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;

export const MARKET_CURRENCIES = {
    "1": { id: "chaos", name: "Chaos Orb", short: "chaos" },
    "2": { id: "exalted", name: "Exalted Orb", short: "exalted" },
} as const;
