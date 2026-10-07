import { z } from "zod";

export const craftingPriceSchema = z.strictObject({
    amount: z.number().nonnegative(),
    currency: z.string().min(1),
    source: z.enum(["manual", "market"]),
    observedAt: z.iso.datetime().optional(),
    confidence: z.number().min(0).max(1).nullable(),
    samples: z.number().int().nonnegative().optional(),
    cohortId: z.string().min(1).optional(),
});

export const acquisitionEstimateSchema = z.strictObject({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(["purchase", "craft"]),
    expectedCost: z.number().nonnegative().nullable(),
    currency: z.string().min(1),
    expectedActions: z.number().nonnegative().nullable(),
    guaranteed: z.boolean(),
    confidence: z.number().min(0).max(1).nullable(),
    missingPrices: z.array(z.string()).default([]),
});

export const acquisitionChoiceSchema = z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("automatic") }),
    z.strictObject({ mode: z.literal("pinned"), alternativeId: z.string().min(1) }),
]);

export const acquisitionComparisonSchema = z.strictObject({
    choice: acquisitionChoiceSchema,
    selectedId: z.string().nullable(),
    alternatives: z.array(acquisitionEstimateSchema),
    incomplete: z.boolean(),
});

export type AcquisitionEstimate = z.infer<typeof acquisitionEstimateSchema>;
export type CraftingPrice = z.infer<typeof craftingPriceSchema>;
export type AcquisitionChoice = z.infer<typeof acquisitionChoiceSchema>;
export type AcquisitionComparison = z.infer<typeof acquisitionComparisonSchema>;
