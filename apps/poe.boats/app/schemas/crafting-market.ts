import { itemQuerySchema, itemRecordSchema } from "@poe-tools/item-query";
import {
    cohortHourlySchema,
    cohortPriceReferenceSchema,
    marketCohortDefinitionSchema,
} from "@poe-tools/market";
import { z } from "zod";
import { craftingGraphSchema } from "./crafting-graph";

export const craftingMarketRefreshResultSchema = z.strictObject({
    graph: craftingGraphSchema,
    issues: z.array(z.string()),
});

export const craftingMarketSnapshotsInputSchema = z.strictObject({
    graph: craftingGraphSchema,
    hours: z.array(z.number().int().nonnegative().multipleOf(3600)).min(1).max(24),
});
export const craftingMarketSnapshotsResultSchema = z.strictObject({
    points: z.array(
        z.strictObject({
            at: z.number().int().nonnegative(),
            graph: craftingGraphSchema.nullable(),
            issues: z.array(z.string()),
        }),
    ),
});

export const craftingMarketInputSchema = z.strictObject({
    item: itemRecordSchema,
    requirements: itemQuerySchema,
    realm: cohortPriceReferenceSchema.shape.realm.default("pc"),
    league: cohortPriceReferenceSchema.shape.league,
    currency: z.string().min(1).max(100),
    window: cohortPriceReferenceSchema.shape.window,
    assumption: cohortPriceReferenceSchema.shape.assumption,
    at: z.number().int().nonnegative().optional(),
});
export const craftingMarketCandidateSchema = z.strictObject({
    definition: marketCohortDefinitionSchema,
    latest: cohortHourlySchema,
    covered: z.boolean(),
    reasons: z.array(z.string()),
    window: cohortPriceReferenceSchema.shape.window,
    assumption: cohortPriceReferenceSchema.shape.assumption,
});
export const craftingMarketResultSchema = z.strictObject({
    candidates: z.array(craftingMarketCandidateSchema),
    truncated: z.boolean(),
    message: z.string().nullable(),
});
export const craftingMarketHistoryInputSchema = cohortPriceReferenceSchema.extend({
    before: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(1000).default(168),
});
export const craftingMarketHistoryResultSchema = z.strictObject({
    history: z.array(cohortHourlySchema),
    nextBefore: z.number().int().nonnegative().nullable(),
});
export type CraftingMarketInput = z.infer<typeof craftingMarketInputSchema>;
export type CraftingMarketCandidate = z.infer<typeof craftingMarketCandidateSchema>;
export type CraftingMarketResult = z.infer<typeof craftingMarketResultSchema>;
export type CraftingMarketHistoryInput = z.infer<typeof craftingMarketHistoryInputSchema>;
