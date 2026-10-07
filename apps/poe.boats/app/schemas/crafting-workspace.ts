import { z } from "zod";
import { craftingGraphSchema } from "./crafting-graph";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(120);
export const craftingDraftSchema = z.strictObject({
    graph: craftingGraphSchema,
    revision: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
});
export const craftingBuildMemberSchema = z.discriminatedUnion("kind", [
    z.strictObject({ id, kind: z.literal("reference"), projectId: id }),
    z.strictObject({ id, kind: z.literal("value"), project: craftingDraftSchema }),
]);
export const craftingBuildSchema = z.strictObject({
    id,
    name,
    game: craftingGraphSchema.shape.game,
    members: z.array(craftingBuildMemberSchema).max(100),
    revision: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
});
export const craftingBundleSchema = z.strictObject({
    format: z.literal(1),
    projects: z.array(craftingDraftSchema).max(100),
    builds: z.array(craftingBuildSchema).max(100),
});
export const craftingWorkspaceSchema = craftingBundleSchema.extend({
    tabs: z.array(id).max(100),
    activeProjectId: id.nullable(),
});
export const createCraftingProjectCommandSchema = z.strictObject({
    action: z.literal("createProject"),
    graph: craftingGraphSchema,
});
export const updateCraftingProjectCommandSchema = z.strictObject({
    action: z.literal("updateProject"),
    graph: craftingGraphSchema,
    expectedRevision: z.number().int().positive(),
});
export const importCraftingBundleCommandSchema = z.strictObject({
    action: z.literal("import"),
    bundle: craftingBundleSchema,
});
export const updateCraftingBuildCopyCommandSchema = updateCraftingProjectCommandSchema.extend({
    action: z.literal("updateBuildCopy"),
    buildId: id,
    memberId: id,
});
export const craftingWorkspaceCommandSchema = z.discriminatedUnion("action", [
    createCraftingProjectCommandSchema,
    z.strictObject({ action: z.literal("openProject"), projectId: id }),
    z.strictObject({ action: z.literal("closeProject"), projectId: id }),
    z.strictObject({ action: z.literal("deleteProject"), projectId: id }),
    updateCraftingProjectCommandSchema,
    z.strictObject({
        action: z.literal("createBuild"),
        name,
        game: craftingGraphSchema.shape.game,
    }),
    z.strictObject({ action: z.literal("renameBuild"), buildId: id, name }),
    z.strictObject({ action: z.literal("deleteBuild"), buildId: id }),
    z.strictObject({
        action: z.literal("addMember"),
        buildId: id,
        projectId: id,
        kind: z.enum(["reference", "value"]),
    }),
    z.strictObject({ action: z.literal("removeMember"), buildId: id, memberId: id }),
    z.strictObject({ action: z.literal("detachMember"), buildId: id, memberId: id }),
    importCraftingBundleCommandSchema,
    updateCraftingBuildCopyCommandSchema,
]);

export type CraftingDraft = z.infer<typeof craftingDraftSchema>;
export type CraftingBuild = z.infer<typeof craftingBuildSchema>;
export type CraftingBundle = z.infer<typeof craftingBundleSchema>;
export type CraftingWorkspace = z.infer<typeof craftingWorkspaceSchema>;
export type CraftingWorkspaceCommand = z.infer<typeof craftingWorkspaceCommandSchema>;
