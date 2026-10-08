import { z } from "zod";

export const simpleCraftFieldSchema = z.enum([
    "memoryStrands",
    "quality",
    "catalystQuality",
    "sockets",
    "links",
]);
export const simpleCraftGoalSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("once") }),
    z.strictObject({
        kind: z.literal("minimum"),
        field: simpleCraftFieldSchema,
        value: z.number().int().min(1).max(100),
    }),
]);
export const simpleCraftCapabilitySchema = z.object({
    effect: z.string(),
    target: z
        .object({
            field: simpleCraftFieldSchema,
            maximum: z.number().int().min(1).max(100),
            suggested: z.number().int().min(1).max(100),
        })
        .nullable(),
    available: z.boolean().nullable(),
    reason: z.string().nullable(),
});
export type SimpleCraftGoal = z.infer<typeof simpleCraftGoalSchema>;
export type SimpleCraftCapability = z.infer<typeof simpleCraftCapabilitySchema>;
