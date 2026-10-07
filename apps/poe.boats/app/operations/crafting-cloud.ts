import { z } from "zod";
import {
    craftingCloudStateSchema,
    craftingShareInfoSchema,
    craftingStoragePreferenceSchema,
    createCraftingShareSchema,
    saveCraftingCloudSchema,
    sharedCraftingBundleSchema,
} from "~/schemas/crafting-cloud";
import {
    createCraftingShare,
    getCloudCraftingWorkspace,
    getCraftingShare,
    listCraftingShares,
    revokeCraftingShare,
    saveCloudCraftingWorkspace,
    setCraftingStoragePreference,
} from "./crafting-cloud.server";
import { CraftingBundleContract } from "./crafting-workspace";
import { defineOperation, EmptySchema, OkSchema } from "./operation";

const State = craftingCloudStateSchema
    .extend({ bundle: CraftingBundleContract })
    .meta({ id: "CraftingCloudState" });
const shareId = z.strictObject({ id: craftingShareInfoSchema.shape.id });
const common = {
    family: "crafting",
    ui: "/1/crafting/projects",
    access: "account",
    method: "post",
    readOnly: false,
} as const;

export const craftingCloudOperations = [
    defineOperation({
        ...common,
        path: "/cloud/get",
        name: "get_saved_crafting_workspace",
        method: "get",
        readOnly: true,
        description:
            "Read the authenticated account's private crafting projects, builds, cloud revision and default storage preference. Does not synchronize browser storage.",
        input: EmptySchema,
        output: State,
        execute: (_, context) => getCloudCraftingWorkspace(context),
    }),
    defineOperation({
        ...common,
        path: "/cloud/save",
        name: "save_crafting_workspace",
        description:
            "Save the authenticated account's private crafting bundle using its last-read cloud revision. Rejects concurrent edits and invalid build references. Publishing is a separate operation.",
        input: saveCraftingCloudSchema.extend({ bundle: CraftingBundleContract }),
        output: State,
        execute: (input, context) => saveCloudCraftingWorkspace(context, input),
    }),
    defineOperation({
        ...common,
        path: "/cloud/preference",
        name: "set_crafting_storage_preference",
        description:
            "Choose local or cloud as the authenticated account's default crafting storage. Preserves existing cloud drafts and does not itself upload browser data or publish anything.",
        input: z.strictObject({ defaultStorage: craftingStoragePreferenceSchema }),
        output: State,
        execute: (input, context) => setCraftingStoragePreference(context, input.defaultStorage),
    }),
    defineOperation({
        ...common,
        path: "/shares/create",
        name: "create_crafting_share",
        description:
            "Explicitly publish a frozen or live link to an owned saved item plan or build at the last-read cloud revision. Frozen builds embed every referenced plan. Anyone holding the returned share ID can read that selected process. Frozen rules stay pinned; price bindings remain live by default.",
        input: createCraftingShareSchema,
        output: craftingShareInfoSchema,
        execute: (input, context) => createCraftingShare(context, input),
    }),
    defineOperation({
        ...common,
        path: "/shares/get",
        name: "get_crafting_share",
        method: "get",
        access: "public",
        readOnly: true,
        description:
            "Read a published crafting process by its unguessable share ID. Live links follow saved changes; frozen links preserve the shared process. Returns only the selected plan/build and its dependencies, with captured prices that callers refresh separately for live valuation.",
        input: shareId,
        output: sharedCraftingBundleSchema.extend({ bundle: CraftingBundleContract }),
        execute: ({ id }, context) => getCraftingShare(context, id),
    }),
    defineOperation({
        ...common,
        path: "/shares/list",
        name: "list_crafting_shares",
        method: "get",
        readOnly: true,
        description:
            "List the authenticated account's active crafting share links for management. Private drafts are not published by listing them.",
        input: EmptySchema,
        output: z.object({ shares: z.array(craftingShareInfoSchema) }),
        execute: (_, context) => listCraftingShares(context),
    }),
    defineOperation({
        ...common,
        path: "/shares/revoke",
        name: "revoke_crafting_share",
        description:
            "Revoke an owned crafting share link without changing saved projects, builds or browser drafts. Other accounts cannot revoke it.",
        input: shareId,
        output: OkSchema,
        execute: ({ id }, context) => revokeCraftingShare(context, id),
    }),
];
