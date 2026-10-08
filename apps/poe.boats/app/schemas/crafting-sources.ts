import { z } from "zod";

export const craftingSourceReferenceSchema = z.strictObject({
    source: z.literal("poe.ninja"),
    game: z.literal("poe1"),
    realm: z.literal("pc"),
    league: z.string().min(1).max(100),
    currency: z.enum(["chaos", "divine", "exalted"]),
    id: z.string().min(1).max(500),
    assumption: z.literal("rare-beast-mountain-lynx-v1").optional(),
});
export const craftingSourceQuoteSchema = craftingSourceReferenceSchema.extend({
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
export const craftingSourceOptionsSchema = z.strictObject({
    ids: z.array(z.string().min(1).max(500)).min(1).max(500),
    realm: z.enum(["pc", "xbox", "sony", "poe2"]),
    assumption: craftingSourceReferenceSchema.shape.assumption,
});
export const craftingSourceResultSchema = z.strictObject({
    quotes: z.record(z.string(), craftingSourceQuoteSchema),
    missing: z.record(z.string(), z.string()),
});
export type CraftingSourceReference = z.infer<typeof craftingSourceReferenceSchema>;
export type CraftingSourceQuote = z.infer<typeof craftingSourceQuoteSchema>;
export type CraftingSourceOptions = z.infer<typeof craftingSourceOptionsSchema>;
export type CraftingSourceResult = z.infer<typeof craftingSourceResultSchema>;
