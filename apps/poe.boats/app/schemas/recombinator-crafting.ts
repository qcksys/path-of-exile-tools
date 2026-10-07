import { z } from "zod";
import { RecombinatorDraftSchema } from "../lib/recombinator-plan";
import { craftingItemSchema } from "./crafting";
import { craftingRulesetRefSchema } from "./crafting-rulesets";

export const recombinatorCraftingInputSchema = z.object({
    source: craftingRulesetRefSchema.pick({
        patch: true,
        manifestSha256: true,
        craftingSha256: true,
    }),
    selection: RecombinatorDraftSchema.shape.items.element,
    baseId: craftingItemSchema.shape.baseId,
    rarity: z.enum(["normal", "magic", "rare"]),
    rolls: z.enum(["minimum", "maximum"]),
});

export const recombinatorCraftingPlanSchema = z.object({
    source: recombinatorCraftingInputSchema.shape.source,
    draft: RecombinatorDraftSchema,
    inputs: z.record(
        z.string(),
        recombinatorCraftingInputSchema.pick({ baseId: true, rarity: true, rolls: true }),
    ),
    finalStep: z.string().min(1).max(80),
    required: z.array(z.string().min(1)).max(6).default([]),
    exact: z.boolean().default(false),
    requiredBase: z.string().default("any"),
});
