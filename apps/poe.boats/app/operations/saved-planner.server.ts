import type { z } from "zod";
import * as queries from "~/db/queries/idol-planner.queries";
import { IdolSetSchema } from "~/schemas/idol-set";
import { STORAGE_VERSION } from "~/schemas/storage";
import { OperationError } from "./errors";
import type { OperationContext } from "./operation";
import {
    duplicatePlannerSet,
    editPlanner,
    newPlannerSet,
    type PlannerCommand,
    validatePlannerSet,
} from "./planner";
import { type CreateSetSchema, type SavedSetSchema, UpdateSetSchema } from "./planner-contracts";

function owner(context: OperationContext) {
    if (!context.caller) throw new OperationError("Authentication required.", 401);
    return context.caller.id;
}

export async function getOwnedSetData(
    db: queries.PlannerDatabase,
    userId: string,
    setId: string,
    lock = false,
) {
    const data = await queries.getSetWithData(db, setId, userId, lock);
    if (!data || data.set.userId !== userId) throw new OperationError("Set not found.", 404);
    return data;
}

function serializeSet(
    data: NonNullable<Awaited<ReturnType<typeof queries.getSetWithData>>>,
): z.infer<typeof SavedSetSchema> {
    return {
        isActive: data.set.isActive,
        set: IdolSetSchema.parse({
            id: data.set.id,
            name: data.set.name,
            createdAt: data.set.rowCreatedAt.getTime(),
            updatedAt: data.set.rowUpdatedAt.getTime(),
            mapDevice: data.set.mapDevice ?? undefined,
            unlockedConditions: data.set.unlockedConditions ?? [],
            inventory: data.idols.map((item) => ({
                id: item.id,
                idol: item.data,
                source: item.source,
                importedAt: item.importedAt,
                usageCount: data.placements.filter((placement) => placement.idolId === item.id)
                    .length,
            })),
            placements: data.placements.map((item) => ({
                id: item.id,
                inventoryIdolId: item.idolId,
                position: { x: item.posX, y: item.posY },
            })),
        }),
    };
}

export async function getSavedSet(context: OperationContext, setId: string) {
    return serializeSet(await getOwnedSetData(context.db, owner(context), setId));
}

export async function listSavedSets(context: OperationContext) {
    const userId = owner(context);
    const rows = await queries.getUserSets(context.db, userId);
    return { sets: await Promise.all(rows.map((row) => getSavedSet(context, row.id))) };
}

export async function createSavedSet(
    context: OperationContext,
    input: z.infer<typeof CreateSetSchema>,
) {
    const userId = owner(context);
    const set = newPlannerSet(input.name);
    await context.db.transaction(async (db) => {
        await queries.createSet(db, {
            id: set.id,
            userId,
            name: set.name,
            mapDevice: set.mapDevice,
            unlockedConditions: set.unlockedConditions,
            isActive: true,
        });
    });
    return { set, isActive: true };
}

export async function updateSavedSet(
    context: OperationContext,
    input: z.input<typeof UpdateSetSchema>,
) {
    const userId = owner(context);
    const { setId, ...updates } = UpdateSetSchema.parse(input);
    await context.db.transaction(async (db) => {
        const current = serializeSet(await getOwnedSetData(db, userId, setId, true));
        validatePlannerSet({ ...current.set, ...updates });
        if (updates.isActive === true) await queries.setActiveSet(db, userId, setId);
        if (Object.keys(updates).length) await queries.updateSet(db, setId, updates);
    });
    return getSavedSet(context, setId);
}

export async function deleteSavedSet(context: OperationContext, setId: string) {
    const userId = owner(context);
    await context.db.transaction(async (db) => {
        await getOwnedSetData(db, userId, setId, true);
        await queries.deleteSet(db, setId);
    });
    return { ok: true as const };
}

export async function editSavedSet(context: OperationContext, command: PlannerCommand) {
    const userId = owner(context);
    if (!("setId" in command) || ["select", "delete", "rename"].includes(command.action)) {
        throw new OperationError(
            "Use the saved-set create, update, or delete operation for this action.",
        );
    }
    return context.db.transaction(async (db) => {
        const current = serializeSet(await getOwnedSetData(db, userId, command.setId, true));
        const result =
            command.action === "duplicate"
                ? { state: { sets: [duplicatePlannerSet(current.set)] }, ids: [] as string[] }
                : editPlanner({
                      state: {
                          version: STORAGE_VERSION,
                          sets: [current.set],
                          activeSetId: current.set.id,
                      },
                      command,
                  });
        const set = result.state.sets[0];
        const duplicate = command.action === "duplicate";
        if (duplicate) {
            await queries.createSet(db, {
                id: set.id,
                userId,
                name: set.name,
                mapDevice: set.mapDevice,
                unlockedConditions: set.unlockedConditions,
                isActive: true,
            });
            result.ids.push(set.id);
        } else {
            await queries.updateSet(db, set.id, {
                name: set.name,
                mapDevice: set.mapDevice,
                unlockedConditions: set.unlockedConditions,
            });
        }
        const previous = duplicate ? [] : current.set.inventory;
        const removed = previous.filter(
            (item) => !set.inventory.some((next) => next.id === item.id),
        );
        await queries.removeIdols(
            db,
            removed.map((item) => item.id),
        );
        for (const item of set.inventory) {
            const row = {
                id: item.id,
                setId: set.id,
                data: item.idol,
                source: item.source,
                importedAt: item.importedAt,
            };
            if (previous.some((entry) => entry.id === item.id))
                await queries.updateIdol(db, item.id, row);
            else await queries.addIdol(db, row);
        }
        const placements = duplicate ? [] : current.set.placements;
        for (const item of placements) {
            if (!set.placements.some((next) => next.id === item.id))
                await queries.removePlacement(db, item.id);
        }
        for (const item of set.placements) {
            if (placements.some((entry) => entry.id === item.id))
                await queries.movePlacement(db, item.id, item.position.x, item.position.y);
            else
                await queries.addPlacement(db, {
                    id: item.id,
                    setId: set.id,
                    idolId: item.inventoryIdolId,
                    posX: item.position.x,
                    posY: item.position.y,
                });
        }
        return { set, isActive: duplicate || current.isActive, ids: result.ids };
    });
}
