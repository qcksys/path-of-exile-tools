import { z } from "zod";
import { craftingBundleSchema } from "./crafting-workspace";

export const craftingStoragePreferenceSchema = z.enum(["local", "cloud"]);
export const craftingCloudStateSchema = z.strictObject({
    bundle: craftingBundleSchema,
    revision: z.number().int().nonnegative(),
    defaultStorage: craftingStoragePreferenceSchema.nullable(),
    updatedAt: z.iso.datetime().nullable(),
});
export const saveCraftingCloudSchema = z.strictObject({
    bundle: craftingBundleSchema,
    expectedRevision: craftingCloudStateSchema.shape.revision,
});
export const craftingShareTargetSchema = z.strictObject({
    kind: z.enum(["project", "build"]),
    id: z.string().min(1).max(100),
});
export const createCraftingShareSchema = z.strictObject({
    target: craftingShareTargetSchema,
    mode: z.enum(["frozen", "live"]),
    expectedRevision: craftingCloudStateSchema.shape.revision,
});
export const craftingShareInfoSchema = z.strictObject({
    id: z.uuid(),
    target: craftingShareTargetSchema,
    mode: createCraftingShareSchema.shape.mode,
    createdAt: z.iso.datetime(),
});
export const sharedCraftingBundleSchema = craftingShareInfoSchema.extend({
    bundle: craftingBundleSchema,
    workspaceRevision: craftingCloudStateSchema.shape.revision,
    prices: z.literal("live"),
});
export type CraftingCloudState = z.infer<typeof craftingCloudStateSchema>;
export type SaveCraftingCloud = z.infer<typeof saveCraftingCloudSchema>;
export type CreateCraftingShare = z.infer<typeof createCraftingShareSchema>;
export type CraftingShareInfo = z.infer<typeof craftingShareInfoSchema>;
