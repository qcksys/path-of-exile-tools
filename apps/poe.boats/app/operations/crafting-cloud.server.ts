import * as queries from "~/db/queries/crafting-cloud.queries";
import type { TCraftingShareS } from "~/db/schema/crafting.share";
import type { TCraftingWorkspaceS } from "~/db/schema/crafting.workspace";
import {
    exportCraftingBundle,
    freezeCraftingBuild,
    parseCraftingWorkspace,
} from "~/lib/crafting-workspace";
import type {
    CraftingCloudState,
    CreateCraftingShare,
    SaveCraftingCloud,
} from "~/schemas/crafting-cloud";
import { type CraftingBundle, craftingBundleSchema } from "~/schemas/crafting-workspace";
import { OperationError } from "./errors";
import type { OperationContext } from "./operation";

function owner(context: OperationContext) {
    if (!context.caller) throw new OperationError("Authentication required.", 401);
    return context.caller.id;
}
function serialize(row: TCraftingWorkspaceS | null): CraftingCloudState {
    return {
        bundle: row?.bundle ?? { format: 1, projects: [], builds: [] },
        revision: row?.revision ?? 0,
        defaultStorage: row?.defaultStorage ?? null,
        updatedAt: row?.rowUpdatedAt.toISOString() ?? null,
    };
}
function info(row: TCraftingShareS) {
    return {
        id: row.id,
        target: { kind: row.targetKind, id: row.targetId },
        mode: row.mode,
        createdAt: row.rowCreatedAt.toISOString(),
    };
}
function workspace(bundle: CraftingBundle) {
    return parseCraftingWorkspace({ ...bundle, tabs: [], activeProjectId: null });
}
function checkRevision(row: TCraftingWorkspaceS | null, revision: number) {
    if ((row?.revision ?? 0) !== revision)
        throw new OperationError(
            "Cloud drafts changed elsewhere. Read the latest revision before saving or sharing; your local drafts have not been replaced.",
            409,
        );
}
function selectedBundle(
    bundle: CraftingBundle,
    target: CreateCraftingShare["target"],
    frozen: boolean,
) {
    try {
        const state = workspace(bundle);
        return frozen && target.kind === "build"
            ? { format: 1 as const, projects: [], builds: [freezeCraftingBuild(state, target.id)] }
            : exportCraftingBundle(state, target);
    } catch {
        throw new OperationError("Crafting share target not found.", 404);
    }
}
export async function getCloudCraftingWorkspace(context: OperationContext) {
    return serialize(await queries.getCraftingCloudRow(context.db, owner(context)));
}
export async function saveCloudCraftingWorkspace(
    context: OperationContext,
    input: SaveCraftingCloud,
) {
    const userId = owner(context);
    let bundle: CraftingBundle;
    try {
        const state = workspace(input.bundle);
        bundle = craftingBundleSchema.parse({
            format: state.format,
            projects: state.projects,
            builds: state.builds,
        });
    } catch (error) {
        throw new OperationError(
            error instanceof Error ? error.message : "Invalid crafting workspace.",
        );
    }
    if (new TextEncoder().encode(JSON.stringify(bundle)).byteLength > 900_000)
        throw new OperationError(
            "Cloud workspace exceeds 900 KB. Export projects before removing any to reduce its size.",
            413,
        );
    return context.db.transaction(async (db) => {
        await queries.ensureCraftingCloudRow(db, userId);
        const current = await queries.getCraftingCloudRow(db, userId, true);
        if (!current) throw new OperationError("Cloud workspace is unavailable.", 404);
        checkRevision(current, input.expectedRevision);
        await queries.updateCraftingCloudRow(db, userId, {
            bundle,
            revision: current.revision + 1,
        });
        return serialize(await queries.getCraftingCloudRow(db, userId));
    });
}
export async function setCraftingStoragePreference(
    context: OperationContext,
    defaultStorage: "local" | "cloud",
) {
    const userId = owner(context);
    return context.db.transaction(async (db) => {
        await queries.ensureCraftingCloudRow(db, userId);
        const current = await queries.getCraftingCloudRow(db, userId, true);
        if (!current) throw new OperationError("Cloud workspace is unavailable.", 404);
        await queries.updateCraftingCloudRow(db, userId, {
            bundle: current.bundle,
            defaultStorage,
        });
        return serialize(await queries.getCraftingCloudRow(db, userId));
    });
}
export async function createCraftingShare(context: OperationContext, input: CreateCraftingShare) {
    const userId = owner(context);
    return context.db.transaction(async (db) => {
        const current = await queries.getCraftingCloudRow(db, userId, true);
        checkRevision(current, input.expectedRevision);
        if (!current) throw new OperationError("Save your crafting drafts before sharing.", 404);
        const bundle = selectedBundle(current.bundle, input.target, input.mode === "frozen");
        const id = crypto.randomUUID();
        const now = new Date();
        await queries.insertCraftingShare(db, {
            id,
            userId,
            targetKind: input.target.kind,
            targetId: input.target.id,
            mode: input.mode,
            snapshot: input.mode === "frozen" ? bundle : null,
            workspaceRevision: current.revision,
            rowCreatedAt: now,
            rowUpdatedAt: now,
        });
        return { id, target: input.target, mode: input.mode, createdAt: now.toISOString() };
    });
}
export async function getCraftingShare(context: OperationContext, id: string) {
    const row = await queries.getCraftingShareRow(context.db, id);
    if (!row) throw new OperationError("Crafting share not found.", 404);
    if (row.mode === "frozen") {
        if (!row.snapshot) throw new Error("Frozen crafting share has no snapshot.");
        return {
            ...info(row),
            bundle: row.snapshot,
            workspaceRevision: row.workspaceRevision,
            prices: "live" as const,
        };
    }
    const current = await queries.getCraftingCloudRow(context.db, row.userId);
    if (!current) throw new OperationError("Crafting share not found.", 404);
    return {
        ...info(row),
        bundle: selectedBundle(current.bundle, { kind: row.targetKind, id: row.targetId }, false),
        workspaceRevision: current.revision,
        prices: "live" as const,
    };
}
export async function listCraftingShares(context: OperationContext) {
    return { shares: (await queries.listCraftingShareRows(context.db, owner(context))).map(info) };
}
export async function revokeCraftingShare(context: OperationContext, id: string) {
    const userId = owner(context);
    return context.db.transaction(async (db) => {
        const current = await queries.getCraftingCloudRow(db, userId, true);
        const row = await queries.getCraftingShareRow(db, id);
        if (!current || row?.userId !== userId)
            throw new OperationError("Crafting share not found.", 404);
        await queries.revokeCraftingShareRow(db, userId, id);
        return { ok: true as const };
    });
}
