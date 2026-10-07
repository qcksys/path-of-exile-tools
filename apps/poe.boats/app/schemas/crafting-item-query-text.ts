import {
    gameSchema,
    itemQuerySchema,
    itemQuerySelectionSchema,
    itemRecordSchema,
} from "@poe-tools/item-query";
import { z } from "zod";
import { craftingItemSchema } from "./crafting";
import { craftingRulesetRefSchema } from "./crafting-rulesets";

export const craftingItemQueryTextInputSchema = z.object({
    game: gameSchema,
    ruleset: craftingRulesetRefSchema,
    text: z.string().trim().min(1).max(50_000),
    selection: itemQuerySelectionSchema.prefault({}),
});
export const craftingItemQueryTextResultSchema = z.object({
    matches: z.array(
        z.object({
            item: craftingItemSchema,
            record: itemRecordSchema,
            query: itemQuerySchema,
            warnings: z.array(z.string()),
        }),
    ),
});
export type CraftingItemQueryTextResult = z.infer<typeof craftingItemQueryTextResultSchema>;
