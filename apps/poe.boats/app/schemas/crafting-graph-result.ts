import { z } from "zod";
import { craftingItemSchema } from "./crafting";
import { acquisitionComparisonSchema } from "./crafting-economy";
import { graphDestinationSchema } from "./crafting-graph";

const count = z.number().int().nonnegative();
const amount = z.number().nonnegative();
const probability = z.number().min(0).max(1);
const interval = z.tuple([probability, probability]);
const counts = z.record(z.string(), count);
const amounts = z.record(z.string(), amount);

export const graphModelOddsSchema = z.object({
    attempts: count,
    branches: amounts,
    outcomes: amounts,
});

export const graphTokenSchema = z.object({ id: z.string(), item: craftingItemSchema });
export const graphNodeVisitsSchema = z.object({
    visits: count,
    matches: counts,
    branches: counts,
    recovered: count,
    skipped: count.optional(),
    modelOdds: graphModelOddsSchema.optional(),
});
export const graphTraceEntrySchema = z.object({
    nodeId: z.string(),
    inputs: z.array(z.string()),
    outputs: z.array(z.string()),
    branchId: z.string().optional(),
    destination: graphDestinationSchema.optional(),
    skipped: z.literal(true).optional(),
});
export const graphTrialResultSchema = z.object({
    status: z.enum(["running", "returned", "terminal", "truncated", "error"]),
    outcomeId: z.string().nullable(),
    success: z.boolean(),
    item: craftingItemSchema.nullable(),
    steps: count,
    actions: count,
    purchases: count,
    consumedItems: count,
    cost: amount.nullable(),
    knownCost: amount,
    revenue: amount.nullable(),
    creditedRevenue: amount,
    missingPrices: z.array(z.string()),
    unpricedSales: z.array(z.string()),
    excludedRecovery: count,
    spending: amounts,
    visits: z.record(z.string(), graphNodeVisitsSchema),
    retained: z.array(graphTokenSchema),
    trace: z.array(graphTraceEntrySchema),
    nodeItems: z.record(z.string(), craftingItemSchema).optional(),
    error: z.string().nullable(),
});
export const graphProductionEstimateSchema = z.object({
    nodeId: z.string(),
    trials: count,
    returned: count,
    returnProbability: probability,
    returnInterval: interval,
    expectedCost: amount.nullable(),
    expectedActions: amount.nullable(),
    missingPrices: z.array(z.string()),
    complete: z.boolean(),
    errors: counts,
});
export const craftingGraphResultSchema = z.object({
    kind: z.literal("sampled-graph"),
    complete: z.boolean(),
    stopReason: z.enum(["running", "complete", "work-limit"]),
    phase: z.enum(["preparing", "pilot", "estimate", "outcome-pilot", "final"]),
    nodeId: z.string().nullable(),
    work: count,
    trials: count,
    requestedTrials: count,
    meanCost: amount.nullable(),
    costInterval: z.tuple([amount, amount]).nullable(),
    meanRevenue: amount.nullable(),
    meanProfit: z.number().nullable(),
    meanActions: amount.nullable(),
    observedCost: amount.nullable(),
    probability: probability.nullable(),
    interval,
    outcomes: z.array(
        z.object({
            id: z.string(),
            count,
            probability: probability.nullable(),
            interval,
        }),
    ),
    missingPrices: z.array(z.string()),
    unpricedSales: z.array(z.string()),
    excludedRecovery: count,
    truncated: count,
    errors: counts,
    acquisitions: z.record(z.string(), acquisitionComparisonSchema),
    estimates: z.array(graphProductionEstimateSchema),
    visits: z.record(z.string(), graphNodeVisitsSchema),
    spending: amounts,
    samples: z.array(graphTrialResultSchema),
    unfinished: graphTrialResultSchema.nullable(),
});

export type GraphToken = z.infer<typeof graphTokenSchema>;
export type GraphNodeVisits = z.infer<typeof graphNodeVisitsSchema>;
export type GraphModelOdds = z.infer<typeof graphModelOddsSchema>;
export type GraphTraceEntry = z.infer<typeof graphTraceEntrySchema>;
export type GraphTrialResult = z.infer<typeof graphTrialResultSchema>;
export type GraphProductionEstimate = z.infer<typeof graphProductionEstimateSchema>;
export type CraftingGraphResult = z.infer<typeof craftingGraphResultSchema>;
