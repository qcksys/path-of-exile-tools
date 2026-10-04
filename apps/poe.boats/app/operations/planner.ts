import { nanoid } from "nanoid";
import { z } from "zod";
import { IDOL_BASES } from "~/data/idol-bases";
import { getAvailableOptions } from "~/data/map-crafting-options";
import { getAllUnlockIds, getLockedPositions } from "~/data/map-device-unlocks";
import { getScarabById } from "~/data/scarab-data";
import { buildOccupancyGrid, checkCanPlace } from "~/lib/grid-utils";
import { IdolInstanceSchema } from "~/schemas/idol";
import { GridPositionSchema, type IdolSet, IdolSetSchema } from "~/schemas/idol-set";
import { ImportSourceSchema } from "~/schemas/inventory";
import {
    createEmptyMapDevice,
    HORNED_SCARAB_OF_AWAKENING_ID,
    MapDeviceSlotSchema,
} from "~/schemas/scarab";
import { type StorageData, StorageSchema } from "~/schemas/storage";
import { OperationError } from "./errors";
import { canSelectScarab } from "./map-device";

const id = z.string().min(1).max(100);
const name = IdolSetSchema.shape.name;
export const PlannerCommandSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("create"), name }),
    z.object({ action: z.literal("select"), setId: id }),
    z.object({ action: z.literal("delete"), setId: id }),
    z.object({ action: z.literal("rename"), setId: id, name }),
    z.object({ action: z.literal("duplicate"), setId: id }),
    z.object({ action: z.literal("import"), set: IdolSetSchema }),
    z.object({
        action: z.literal("addIdols"),
        setId: id,
        idols: z.array(IdolInstanceSchema).min(1).max(500),
        source: ImportSourceSchema,
    }),
    z.object({ action: z.literal("updateIdol"), setId: id, idolId: id, idol: IdolInstanceSchema }),
    z.object({ action: z.literal("duplicateIdol"), setId: id, idolId: id }),
    z.object({ action: z.literal("removeIdols"), setId: id, ids: z.array(id).min(1).max(500) }),
    z.object({ action: z.literal("clearInventory"), setId: id }),
    z.object({ action: z.literal("place"), setId: id, idolId: id, position: GridPositionSchema }),
    z.object({
        action: z.literal("move"),
        setId: id,
        placementId: id,
        position: GridPositionSchema,
    }),
    z.object({ action: z.literal("removePlacement"), setId: id, placementId: id }),
    z.object({ action: z.literal("setSlot"), setId: id, ...MapDeviceSlotSchema.shape }),
    z.object({
        action: z.literal("setCraft"),
        setId: id,
        craftingOptionId: IdolSetSchema.shape.mapDevice.unwrap().shape.craftingOptionId,
    }),
    z.object({
        action: z.literal("setUnlocks"),
        setId: id,
        unlockedConditions: IdolSetSchema.shape.unlockedConditions,
    }),
]);
export type PlannerCommand = z.infer<typeof PlannerCommandSchema>;
export const EditPlannerSchema = z.object({ state: StorageSchema, command: PlannerCommandSchema });
export const PlannerResultSchema = z.object({ state: StorageSchema, ids: z.array(z.string()) });

export function newPlannerSet(name: string, setId = nanoid()): IdolSet {
    return IdolSetSchema.parse({
        id: setId,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        placements: [],
        inventory: [],
        mapDevice: createEmptyMapDevice(),
        unlockedConditions: getAllUnlockIds(),
    });
}

export function canPlaceInSet(
    set: Pick<IdolSet, "inventory" | "placements" | "unlockedConditions">,
    idolId: string,
    position: { x: number; y: number },
    excludePlacementId?: string,
) {
    const idol = set.inventory.find((entry) => entry.id === idolId);
    if (!idol) return false;
    const base = IDOL_BASES[idol.idol.baseType];
    const locked = getLockedPositions(set.unlockedConditions);
    for (let x = position.x; x < position.x + base.width; x++) {
        for (let y = position.y; y < position.y + base.height; y++) {
            if (locked.has(`${x},${y}`)) return false;
        }
    }
    return Boolean(
        idol &&
            GridPositionSchema.safeParse(position).success &&
            !set.placements.some(
                (entry) => entry.inventoryIdolId === idolId && entry.id !== excludePlacementId,
            ) &&
            checkCanPlace(
                buildOccupancyGrid(set.placements, set.inventory, excludePlacementId),
                idol.idol.baseType,
                position,
            ),
    );
}

export function validatePlannerSet(set: IdolSet): IdolSet {
    if (
        new Set(set.inventory.map((item) => item.id)).size !== set.inventory.length ||
        new Set(set.placements.map((item) => item.id)).size !== set.placements.length
    ) {
        throw new OperationError("Inventory and placement IDs must be unique.");
    }
    for (const placement of set.placements) {
        if (!canPlaceInSet(set, placement.inventoryIdolId, placement.position, placement.id)) {
            throw new OperationError(
                "An idol placement is missing, duplicated, overlapping, or outside the grid.",
            );
        }
    }
    return {
        ...set,
        inventory: set.inventory.map((item) => ({
            ...item,
            usageCount: set.placements.filter((placement) => placement.inventoryIdolId === item.id)
                .length,
        })),
    };
}

export function duplicatePlannerSet(source: IdolSet): IdolSet {
    const inventory = source.inventory.map((item) => ({
        ...item,
        id: nanoid(),
        idol: { ...item.idol, id: nanoid() },
    }));
    const ids = new Map(source.inventory.map((item, index) => [item.id, inventory[index].id]));
    return validatePlannerSet({
        ...source,
        id: nanoid(),
        name: `${source.name.slice(0, 43)} (Copy)`,
        inventory,
        placements: source.placements.map((placement) => ({
            ...placement,
            id: nanoid(),
            inventoryIdolId: ids.get(placement.inventoryIdolId) ?? "",
        })),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        contentHash: undefined,
    });
}

export function editPlanner(
    input: z.input<typeof EditPlannerSchema>,
): z.infer<typeof PlannerResultSchema> {
    const { state, command } = EditPlannerSchema.parse(input);
    let sets = state.sets;
    let activeSetId = state.activeSetId;
    const ids: string[] = [];
    if (command.action === "create" || command.action === "import") {
        const set =
            command.action === "create"
                ? newPlannerSet(command.name)
                : validatePlannerSet(command.set);
        if (sets.some((entry) => entry.id === set.id))
            throw new OperationError("A set with this ID already exists.", 409);
        sets = [...sets, set];
        activeSetId = set.id;
        ids.push(set.id);
    } else {
        const original = sets.find((entry) => entry.id === command.setId);
        if (!original) throw new OperationError("Set not found.", 404);
        let set = structuredClone(original);
        switch (command.action) {
            case "select":
                activeSetId = set.id;
                break;
            case "delete":
                if (sets.length === 1) throw new OperationError("Keep at least one set.", 409);
                sets = sets.filter((entry) => entry.id !== set.id);
                if (activeSetId === set.id) activeSetId = sets[0].id;
                break;
            case "duplicate": {
                const duplicate = duplicatePlannerSet(set);
                sets = [...sets, duplicate];
                activeSetId = duplicate.id;
                ids.push(duplicate.id);
                break;
            }
            case "rename":
                set.name = command.name;
                break;
            case "addIdols":
                for (const idol of command.idols) {
                    const itemId = nanoid();
                    ids.push(itemId);
                    set.inventory.push({
                        id: itemId,
                        idol,
                        importedAt: Date.now(),
                        source: command.source,
                        usageCount: 0,
                    });
                }
                break;
            case "updateIdol": {
                const item = set.inventory.find((entry) => entry.id === command.idolId);
                if (!item) throw new OperationError("Idol not found.", 404);
                item.idol = command.idol;
                break;
            }
            case "duplicateIdol": {
                const item = set.inventory.find((entry) => entry.id === command.idolId);
                if (!item) throw new OperationError("Idol not found.", 404);
                const itemId = nanoid();
                ids.push(itemId);
                set.inventory.push({
                    ...item,
                    id: itemId,
                    idol: { ...item.idol, id: nanoid() },
                    importedAt: Date.now(),
                    usageCount: 0,
                });
                break;
            }
            case "removeIdols":
                if (command.ids.some((itemId) => !set.inventory.some((item) => item.id === itemId)))
                    throw new OperationError("Idol not found.", 404);
                set.inventory = set.inventory.filter((entry) => !command.ids.includes(entry.id));
                set.placements = set.placements.filter(
                    (entry) => !command.ids.includes(entry.inventoryIdolId),
                );
                break;
            case "clearInventory":
                set.inventory = [];
                set.placements = [];
                break;
            case "place": {
                if (!canPlaceInSet(set, command.idolId, command.position))
                    throw new OperationError("Cannot place this idol here.", 409);
                const placementId = nanoid();
                ids.push(placementId);
                set.placements.push({
                    id: placementId,
                    inventoryIdolId: command.idolId,
                    position: command.position,
                });
                break;
            }
            case "move": {
                const placement = set.placements.find((entry) => entry.id === command.placementId);
                if (!placement) throw new OperationError("Placement not found.", 404);
                if (!canPlaceInSet(set, placement.inventoryIdolId, command.position, placement.id))
                    throw new OperationError("Cannot place this idol here.", 409);
                placement.position = command.position;
                break;
            }
            case "removePlacement":
                if (!set.placements.some((entry) => entry.id === command.placementId))
                    throw new OperationError("Placement not found.", 404);
                set.placements = set.placements.filter((entry) => entry.id !== command.placementId);
                break;
            case "setSlot": {
                const current = set.mapDevice.slots.find(
                    (slot) => slot.slotIndex === command.slotIndex,
                );
                if (!current) throw new OperationError("Map-device slot not found.", 404);
                if (command.scarabId) {
                    const scarab = getScarabById(command.scarabId);
                    const usage = set.mapDevice.slots.filter(
                        (slot) => slot.scarabId === command.scarabId,
                    ).length;
                    if (!scarab || !canSelectScarab(scarab, usage, current.scarabId))
                        throw new OperationError(
                            "Scarab is unavailable or its limit is reached.",
                            409,
                        );
                }
                set.mapDevice.slots = set.mapDevice.slots.map((slot) =>
                    slot.slotIndex === command.slotIndex
                        ? { ...slot, scarabId: command.scarabId }
                        : slot,
                );
                break;
            }
            case "setCraft":
                if (
                    command.craftingOptionId &&
                    !getAvailableOptions(
                        set.mapDevice.slots.some(
                            (slot) => slot.scarabId === HORNED_SCARAB_OF_AWAKENING_ID,
                        ),
                    ).some((option) => option.id === command.craftingOptionId)
                )
                    throw new OperationError("Crafting option is unavailable.", 409);
                set.mapDevice.craftingOptionId = command.craftingOptionId;
                break;
            case "setUnlocks":
                set.unlockedConditions = command.unlockedConditions;
                break;
        }
        if (!["select", "delete", "duplicate"].includes(command.action)) {
            set = validatePlannerSet({ ...set, updatedAt: Date.now(), contentHash: undefined });
            sets = sets.map((entry) => (entry.id === set.id ? set : entry));
        }
    }
    const result: StorageData = { ...state, sets, activeSetId };
    return { state: result, ids };
}
