import { z } from "zod";
import {
    craftingFlagSchema,
    craftingItemSchema,
    craftingMethodSchema,
    craftingProjectSchema,
} from "./crafting";

export const craftingWorkbenchItemSchema = craftingItemSchema.meta({ id: "CraftingWorkbenchItem" });

export const craftingItemEditSchema = z.discriminatedUnion("kind", [
    craftingItemSchema.pick({ baseId: true, level: true }).extend({ kind: z.literal("create") }),
    z.object({ kind: z.literal("validate"), item: craftingWorkbenchItemSchema }),
    z.object({
        kind: z.literal("add-mod"),
        item: craftingWorkbenchItemSchema,
        id: z.string().min(1),
        source: z
            .enum(["natural", "essence", "emotion", "revealed", "attribute", "ukatoa", "influence"])
            .default("natural"),
        seed: craftingProjectSchema.shape.seed,
    }),
    z.object({
        kind: z.literal("flag"),
        item: craftingWorkbenchItemSchema,
        flag: craftingFlagSchema,
        enabled: z.boolean(),
    }),
    z.object({
        kind: z.literal("passive"),
        item: craftingWorkbenchItemSchema,
        id: z.string().min(1),
    }),
]);
export type CraftingItemEdit = z.infer<typeof craftingItemEditSchema>;

const counts = z.record(z.string(), z.number());
const routes = z.record(
    z.string(),
    z.object({
        visits: z.number(),
        passed: z.number(),
        failed: z.number(),
        errors: z.number(),
        spending: counts,
        branches: counts.optional(),
    }),
);
const cost = z.object({
    spending: counts,
    baseItems: z.number().optional(),
    baseSpending: z.number().optional(),
    total: z.number().nullable(),
    unpriced: z.array(z.string()),
});
export const craftingProcessResultSchema = z
    .object({
        item: craftingItemSchema,
        actions: z.number(),
        steps: z.number(),
        spending: counts,
        baseItems: z.number(),
        routes,
        lastStep: z.string().optional(),
        nextStep: z.string().optional(),
        error: z.string().optional(),
        timeout: z.boolean(),
        success: z.boolean(),
    })
    .meta({ id: "CraftingProcessResult" });
export const craftingWorkbenchResultSchema = z
    .object({
        kind: z.enum(["exact", "exact-process", "sampled", "process"]),
        trials: z.number(),
        successes: z.number(),
        probability: z.number(),
        interval: z.tuple([z.number(), z.number()]),
        attempts: z.number().nullable(),
        attempts95: z.number().nullable(),
        totalActions: z.number(),
        totalSteps: z.number().optional(),
        timeouts: z.number(),
        errors: counts,
        spending: counts,
        baseItems: z.number().optional(),
        baseSpending: z.number().optional(),
        meanCost: z.number().nullable(),
        costPerSuccess: z.number().nullable(),
        unpriced: z.array(z.string()),
        affixes: counts,
        samples: z.array(
            z.object({
                trial: z.number(),
                item: craftingItemSchema,
                success: z.boolean(),
                cost: cost.optional(),
            }),
        ),
        successCosts: z
            .object({
                cheapest: z.number().nullable(),
                costliest: z.number().nullable(),
                unpriced: z.number(),
            })
            .optional(),
        sampleStorage: craftingProjectSchema.shape.sampleStorage,
        successDistribution: z
            .array(
                z.object({
                    key: z.string(),
                    modId: z.string(),
                    side: z.enum(["prefix", "suffix"]),
                    essence: z.boolean(),
                    count: z.number(),
                    items: z.number(),
                    tierTotal: z.number(),
                    ranked: z.number(),
                }),
            )
            .optional(),
        routes: routes.optional(),
        simulationLimit: craftingProjectSchema.shape.simulationLimit,
        stopReason: z.enum(["trials", "successes", "actions"]).optional(),
        unfinished: craftingProcessResultSchema.optional(),
    })
    .meta({ id: "CraftingWorkbenchResult" });

export const craftingEmulationCommandSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("apply"), method: craftingMethodSchema }),
    z.object({ kind: z.literal("select-unrevealed"), index: z.number().int().min(0).max(5) }),
    z.object({
        kind: z.literal("prepare-reveal"),
        omens: z.array(z.string().min(1)).max(4).optional(),
    }),
    z.object({ kind: z.literal("reroll-reveal") }),
    z.object({ kind: z.literal("choose-revealed"), id: z.string().min(1) }),
    z.object({ kind: z.literal("choose-allflame"), index: z.number().int().min(0).max(10) }),
]);
export type CraftingEmulationCommand = z.infer<typeof craftingEmulationCommandSchema>;
export const craftingEmulationResultSchema = z.object({
    item: craftingItemSchema,
    cost: craftingItemSchema.shape.allflameCost.unwrap().element.array(),
    actions: z.number(),
    error: z.string().optional(),
});
