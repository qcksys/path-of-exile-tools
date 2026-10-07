import { itemQuerySchema, rangeSchema } from "@poe-tools/item-query";
import { z } from "zod";
import { craftingRulesetRefSchema } from "./crafting-graph";

const tradeValueSchema = z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    option: z.string().optional(),
});
export const craftingTradePayloadSchema = z.object({
    query: z.object({
        status: z.object({ option: z.literal("available") }),
        type: z.string().optional(),
        stats: z.array(
            z.object({
                type: z.enum(["and", "count", "not"]),
                filters: z.array(z.object({ id: z.string(), value: rangeSchema.optional() })),
                value: rangeSchema.optional(),
            }),
        ),
        filters: z.record(
            z.string(),
            z.object({ filters: z.record(z.string(), tradeValueSchema) }),
        ),
    }),
    sort: z.object({ price: z.literal("asc") }),
});

export const craftingTradeInputSchema = z.object({
    query: itemQuerySchema,
    ruleset: craftingRulesetRefSchema,
    league: z.string().trim().min(1).max(100),
});
export const craftingTradeResultSchema = z.object({
    url: z.string(),
    payload: craftingTradePayloadSchema,
    fidelity: z.enum(["exact", "approximate"]),
    warnings: z.array(
        z.object({
            group: z.number().int(),
            condition: z.number().int().optional(),
            message: z.string(),
        }),
    ),
    metadataDate: z.string(),
});
export type CraftingTradeResult = z.infer<typeof craftingTradeResultSchema>;
export type CraftingTradePayload = z.infer<typeof craftingTradePayloadSchema>;
