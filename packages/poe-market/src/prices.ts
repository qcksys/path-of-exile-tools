import { z } from "zod";

const priceSummarySchema = z.strictObject({
    count: z.number().int().positive(),
    sellers: z.number().int().positive(),
    min: z.number().positive(),
    median: z.number().positive(),
    max: z.number().positive(),
    confidence: z.number().min(0).max(1),
});
export const cohortWindowSchema = priceSummarySchema.extend({
    listingCount: z.number().int().nonnegative(),
    unknownCount: z.number().int().nonnegative(),
    hourlyMedianMin: z.number().positive(),
    hourlyMedianMax: z.number().positive(),
});
export const cohortPriceSchema = priceSummarySchema.extend({
    windows: z
        .strictObject({
            "6": cohortWindowSchema.optional(),
            "24": cohortWindowSchema.optional(),
        })
        .optional(),
});
export const cohortHourlySchema = z.strictObject({
    realm: z.enum(["pc", "xbox", "sony"]),
    league: z.string().min(1).max(100),
    hour: z.number().int().nonnegative().multipleOf(3600),
    revision: z.string().min(1).max(100),
    cohortId: z.string().min(1).max(128),
    listingCount: z.number().int().nonnegative(),
    uniqueSellers: z.number().int().nonnegative(),
    unknownCount: z.number().int().nonnegative(),
    prices: z.record(z.string().min(1).max(100), cohortPriceSchema),
    confidenceMethod: z.literal("asking-sellers-coverage-v1"),
    firstSeenAt: z.string().max(32).nullable(),
    lastSeenAt: z.string().max(32).nullable(),
});
export type CohortHourly = z.infer<typeof cohortHourlySchema>;

export function askingPriceConfidence(
    sellers: number,
    priced: number,
    matched: number,
    unknown: number,
): number {
    const candidates = matched + unknown;
    return candidates > 0 ? (sellers / (sellers + 10)) * (priced / candidates) : 0;
}
