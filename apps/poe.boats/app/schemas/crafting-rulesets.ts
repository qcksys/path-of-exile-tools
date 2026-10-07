import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const game = z.enum(["poe1", "poe2"]);

export const craftingRulesetRefSchema = z.strictObject({
    era: id,
    revision: id,
    engine: id,
    patch: id,
    manifestSha256: hash,
    craftingSha256: hash,
});
export const craftingAvailabilitySchema = z.strictObject({
    kinds: z.array(id).min(1),
    disabled: z.array(z.strictObject({ kind: id, id: z.string().min(1) })).default([]),
    allflame: z.boolean(),
});
const artifact = z.strictObject({ sha256: hash, bytes: z.number().int().positive() });
export const craftingRulesetSchema = craftingRulesetRefSchema.extend({
    format: z.literal(1),
    game,
    label: z.string().min(1).max(150),
    notes: z.string().max(5000),
    publishedAt: z.iso.datetime(),
    catalog: artifact,
    implementation: artifact,
    availability: craftingAvailabilitySchema,
});
export const craftingRulesetIndexSchema = z.strictObject({
    format: z.literal(1),
    revisions: z.array(craftingRulesetSchema),
    latest: z.array(z.strictObject({ game, era: id, revision: id })),
});

export type CraftingRulesetRef = z.infer<typeof craftingRulesetRefSchema>;
export type CraftingRuleset = z.infer<typeof craftingRulesetSchema>;
export type CraftingRulesetIndex = z.infer<typeof craftingRulesetIndexSchema>;
