import { z } from "zod";
import { craftingRulesetRefSchema } from "./crafting-rulesets";

export const craftingPresetIdSchema = z.enum([
    "life-block-shield",
    "es-block-shield",
    "tailwind-boots",
    "physical-bow",
    "elemental-bow",
    "suppression-chest",
    "global-defence-chest",
    "rarity-helmet",
    "energy-shield-chest",
]);
export const craftingPresetSchema = z.object({
    id: craftingPresetIdSchema,
    game: z.literal("poe1"),
    name: z.string(),
    description: z.string(),
});
export const craftingPresetInputSchema = z.object({
    game: z.enum(["poe1", "poe2"]),
    ruleset: craftingRulesetRefSchema,
    presetId: craftingPresetIdSchema,
});
export type CraftingPresetId = z.infer<typeof craftingPresetIdSchema>;
export type CraftingPreset = z.infer<typeof craftingPresetSchema>;
