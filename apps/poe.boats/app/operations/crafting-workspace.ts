import { z } from "zod";
import {
    CraftingWorkspaceConflict,
    editCraftingWorkspace,
    exportCraftingBundle,
    freezeCraftingBuild,
} from "~/lib/crafting-workspace";
import {
    craftingBuildMemberSchema,
    craftingBuildSchema,
    craftingBundleSchema,
    craftingDraftSchema,
    craftingWorkspaceCommandSchema,
    craftingWorkspaceSchema,
    createCraftingProjectCommandSchema,
    importCraftingBundleCommandSchema,
    updateCraftingBuildCopyCommandSchema,
    updateCraftingProjectCommandSchema,
} from "~/schemas/crafting-workspace";
import { CraftingGraphContract } from "./crafting-contracts";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

const Draft = craftingDraftSchema
    .extend({ graph: CraftingGraphContract })
    .meta({ id: "CraftingDraft" });
const Member = z.discriminatedUnion("kind", [
    craftingBuildMemberSchema.options[0],
    craftingBuildMemberSchema.options[1].extend({ project: Draft }),
]);
const Build = craftingBuildSchema
    .extend({ members: z.array(Member).max(100) })
    .meta({ id: "CraftingBuild" });
const Bundle = craftingBundleSchema
    .extend({
        projects: z.array(Draft).max(100),
        builds: z.array(Build).max(100),
    })
    .meta({ id: "CraftingBundle" });
const Workspace = craftingWorkspaceSchema.extend(Bundle.shape).meta({ id: "CraftingWorkspace" });

export { Bundle as CraftingBundleContract };

const Command = z
    .discriminatedUnion("action", [
        createCraftingProjectCommandSchema.extend({ graph: CraftingGraphContract }),
        updateCraftingProjectCommandSchema.extend({ graph: CraftingGraphContract }),
        importCraftingBundleCommandSchema.extend({ bundle: Bundle }),
        updateCraftingBuildCopyCommandSchema.extend({ graph: CraftingGraphContract }),
        ...craftingWorkspaceCommandSchema.options.filter(
            (option) =>
                !["createProject", "updateProject", "updateBuildCopy", "import"].includes(
                    option.shape.action.value,
                ),
        ),
    ])
    .meta({ id: "CraftingWorkspaceCommand" });

function execute<T>(action: () => T): T {
    try {
        return action();
    } catch (error) {
        throw new OperationError(
            error instanceof Error ? error.message : "Invalid crafting workspace.",
            error instanceof CraftingWorkspaceConflict ? 409 : 400,
        );
    }
}
const common = {
    family: "crafting",
    ui: "/1/crafting/projects",
    access: "public",
    readOnly: true,
    method: "post",
} as const;

export const craftingWorkspaceOperations = [
    defineOperation({
        ...common,
        path: "/workspace/edit",
        name: "edit_crafting_workspace",
        description:
            "Edit explicit crafting workspace state: project tabs, revisions and build members by reference or value. Returns new state without saving to an account or browser. Stale project updates are refused.",
        input: z.object({ state: Workspace, command: Command }),
        output: z.object({ state: Workspace, ids: z.array(z.string()) }),
        execute: ({ state, command }) => execute(() => editCraftingWorkspace(state, command)),
    }),
    defineOperation({
        ...common,
        path: "/workspace/export",
        name: "export_crafting_bundle",
        description:
            "Export an item plan or build as a portable bundle with all referenced projects included. Importing creates new IDs and independent drafts without overwriting existing projects.",
        input: z.object({
            state: Workspace,
            selection: z.object({ kind: z.enum(["project", "build"]), id: z.string().min(1) }),
        }),
        output: z.object({ bundle: Bundle }),
        execute: ({ state, selection }) =>
            execute(() => ({ bundle: exportCraftingBundle(state, selection) })),
    }),
    defineOperation({
        ...common,
        path: "/workspace/freeze-build",
        name: "freeze_crafting_build",
        description:
            "Capture all current build members by value, including referenced item plans and their ruleset revisions. Does not save or publish; stored market quotes remain distinct from a later live valuation.",
        input: z.object({ state: Workspace, buildId: z.string().min(1) }),
        output: z.object({ build: Build }),
        execute: ({ state, buildId }) =>
            execute(() => ({ build: freezeCraftingBuild(state, buildId) })),
    }),
];
