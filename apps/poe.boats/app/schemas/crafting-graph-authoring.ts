import { z } from "zod";
import { craftingItemSchema, craftingMethodSchema } from "./crafting";
import { craftingPriceSchema } from "./crafting-economy";
import { craftingGraphSchema, graphInputSchema, graphNodeSchema } from "./crafting-graph";
import { craftingRulesetRefSchema } from "./crafting-rulesets";

export const projectFromItemInputSchema = z.object({
    game: craftingGraphSchema.shape.game,
    ruleset: craftingRulesetRefSchema,
    item: craftingItemSchema,
    name: craftingGraphSchema.shape.name,
    price: craftingPriceSchema.nullable().default(null),
});

export const replaceGraphPurchaseItemInputSchema = z.object({
    graph: craftingGraphSchema,
    nodeId: graphNodeSchema.options[0].shape.id,
    alternativeId: graphNodeSchema.options[0].shape.id,
    expectedItem: craftingItemSchema,
    item: craftingItemSchema,
});

export const replaceGraphMethodInputSchema = z.object({
    graph: craftingGraphSchema,
    nodeId: graphNodeSchema.options[1].shape.id,
    expectedMethod: craftingMethodSchema,
    method: craftingMethodSchema,
});

export const graphAuthoringCommandSchema = z.discriminatedUnion("action", [
    z.strictObject({
        action: z.literal("connect"),
        targetId: graphNodeSchema.options[1].shape.id,
        inputId: graphInputSchema.shape.id,
        source: graphInputSchema.shape.source,
    }),
    z.strictObject({
        action: z.literal("removeNode"),
        nodeId: graphNodeSchema.options[1].shape.id,
    }),
]);
