import { z } from "zod";

const scope = {
    game: z.literal("poe1"),
    realm: z.literal("pc"),
    league: z.string().min(1).max(100),
    currency: z.enum(["chaos", "divine", "exalted"]),
    id: z.string().min(1).max(500),
};
const assumption = z.literal("rare-beast-mountain-lynx-v1").optional();
const ninjaReference = z.strictObject({
    ...scope,
    source: z.literal("poe.ninja"),
    assumption,
});
export const commoditySourceReferenceSchema = z.strictObject({
    ...scope,
    source: z.literal("stash-commodity"),
    baseType: z.string().min(1).max(100),
});
export const craftingSourceReferenceSchema = z.discriminatedUnion("source", [
    ninjaReference,
    commoditySourceReferenceSchema,
]);
const ninjaQuote = ninjaReference.extend({
    amount: z.number().positive(),
    fetchedAt: z.iso.datetime(),
    components: z
        .array(
            z.strictObject({
                detailsId: z.string().min(1).max(150),
                name: z.string().min(1).max(200),
                quantity: z.number().int().positive().max(4),
                unitPrice: z.number().positive(),
                listingCount: z.number().int().positive(),
                sourceUrl: z.url().startsWith("https://poe.ninja/poe1/api/economy/"),
            }),
        )
        .min(1)
        .max(4),
});
export const commoditySourceQuoteSchema = commoditySourceReferenceSchema
    .extend({
        amount: z.number().positive(),
        hour: z.number().int().nonnegative().multipleOf(3600),
        low: z.number().positive(),
        high: z.number().positive(),
        samples: z.number().int().positive(),
        listingCount: z.number().int().positive(),
        uniqueSellers: z.number().int().positive(),
    })
    .refine(
        (quote) =>
            quote.low <= quote.amount &&
            quote.amount <= quote.high &&
            quote.samples <= quote.listingCount &&
            quote.uniqueSellers <= quote.listingCount,
        "Commodity price range or sample counts are inconsistent.",
    );
export const craftingSourceQuoteSchema = z.discriminatedUnion("source", [
    ninjaQuote,
    commoditySourceQuoteSchema,
]);
export const craftingSourceOptionsSchema = z.strictObject({
    ids: z.array(z.string().min(1).max(500)).min(1).max(500),
    realm: z.enum(["pc", "xbox", "sony", "poe2"]),
    assumption,
    at: z.number().int().nonnegative().optional(),
});
export const craftingSourceResultSchema = z.strictObject({
    quotes: z.record(z.string(), craftingSourceQuoteSchema),
    missing: z.record(z.string(), z.string()),
});
export type CraftingSourceReference = z.infer<typeof craftingSourceReferenceSchema>;
export type CraftingSourceQuote = z.infer<typeof craftingSourceQuoteSchema>;
export type CraftingSourceOptions = z.infer<typeof craftingSourceOptionsSchema>;
export type CraftingSourceResult = z.infer<typeof craftingSourceResultSchema>;
export type CommoditySourceQuote = z.infer<typeof commoditySourceQuoteSchema>;
