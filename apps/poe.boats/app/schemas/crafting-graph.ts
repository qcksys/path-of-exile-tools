import { itemQuerySchema } from "@poe-tools/item-query";
import { z } from "zod";
import { craftingItemSchema, craftingMethodSchema } from "./crafting";
import { acquisitionChoiceSchema, craftingPriceSchema } from "./crafting-economy";
import { craftingRulesetRefSchema } from "./crafting-rulesets";
import { simpleCraftGoalSchema } from "./crafting-smart";

export { craftingRulesetRefSchema } from "./crafting-rulesets";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(120);
const position = z.object({ x: z.number(), y: z.number() }).optional();

export const graphDestinationSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("return") }),
    z.strictObject({ kind: z.literal("recover"), nodeId: id, inputId: id }),
    z.strictObject({ kind: z.literal("discard") }),
    z.strictObject({ kind: z.literal("sell"), price: craftingPriceSchema.nullable() }),
    z.strictObject({ kind: z.literal("terminal"), outcomeId: id }),
]);

export const graphBranchSchema = z.strictObject({
    id,
    name,
    query: itemQuerySchema,
    destination: graphDestinationSchema,
});

export const graphInputSchema = z.strictObject({
    id,
    name,
    source: id,
    query: itemQuerySchema.optional(),
});

export const graphPurchaseSchema = z.strictObject({
    kind: z.literal("purchase"),
    id,
    name,
    item: craftingItemSchema,
    price: craftingPriceSchema.nullable(),
});
export const graphProductionSchema = z.strictObject({
    kind: z.literal("production"),
    id,
    name,
    nodeId: id,
});
export const graphNodeSchema = z.discriminatedUnion("kind", [
    z.strictObject({
        kind: z.literal("acquire"),
        id,
        name,
        position,
        output: itemQuerySchema,
        alternatives: z
            .array(z.discriminatedUnion("kind", [graphPurchaseSchema, graphProductionSchema]))
            .min(1)
            .max(20),
        choice: acquisitionChoiceSchema.default({ mode: "automatic" }),
    }),
    z.strictObject({
        kind: z.literal("craft"),
        id,
        name,
        position,
        output: itemQuerySchema,
        inputs: z.array(graphInputSchema).min(1).max(2),
        method: craftingMethodSchema,
        smart: simpleCraftGoalSchema.optional(),
        applyWhen: itemQuerySchema.optional(),
        branches: z.array(graphBranchSchema).max(24).default([]),
        ordering: z.enum(["automatic", "manual"]).default("automatic"),
        fallback: graphDestinationSchema.default({ kind: "return" }),
    }),
]);

export const graphOutcomeSchema = z.strictObject({
    id,
    name,
    query: itemQuerySchema,
    success: z.boolean().default(true),
    disposition: z.enum(["keep", "sell", "discard"]).default("keep"),
    price: craftingPriceSchema.nullable().default(null),
});

export const craftingGraphSchema = z.strictObject({
    format: z.literal(1),
    id,
    name,
    game: itemQuerySchema.shape.game,
    ruleset: craftingRulesetRefSchema,
    currency: z.string().min(1).max(100).default("chaos"),
    league: z.string().min(1).max(100).optional(),
    nodes: z.array(graphNodeSchema).min(1).max(100),
    entry: id,
    outcomes: z.array(graphOutcomeSchema).min(1).max(24),
    outcomeOrdering: z.enum(["automatic", "manual"]).default("automatic"),
    prices: z.record(z.string(), craftingPriceSchema).default({}),
    seed: z.number().int().min(0).max(0xffffffff).default(42),
    iterations: z.number().int().min(1).max(100_000).default(1000),
    maxSteps: z.number().int().min(1).max(1_000_000).default(10_000),
});

export type CraftingGraph = z.infer<typeof craftingGraphSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphCraftNode = Extract<GraphNode, { kind: "craft" }>;
export type GraphAcquireNode = Extract<GraphNode, { kind: "acquire" }>;
export type GraphDestination = z.infer<typeof graphDestinationSchema>;
export type GraphOutcome = z.infer<typeof graphOutcomeSchema>;
