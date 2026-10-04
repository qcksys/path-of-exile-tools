import { useCallback, useRef } from "react";
import { toast } from "sonner";
import type { Position } from "~/lib/grid-utils";
import { canPlaceInSet, editPlanner, type PlannerCommand } from "~/operations/planner";
import type { IdolInstance } from "~/schemas/idol";
import type { IdolSet } from "~/schemas/idol-set";
import type { ImportSource, InventoryIdol } from "~/schemas/inventory";
import { STORAGE_VERSION, type StorageData } from "~/schemas/storage";

export function useIdolSets(
    sets: IdolSet[],
    setSets: React.Dispatch<React.SetStateAction<IdolSet[]>>,
    activeSetId: string | null,
    setActiveSetId: React.Dispatch<React.SetStateAction<string | null>>,
) {
    const state = useRef<StorageData>({ version: STORAGE_VERSION, sets, activeSetId });
    state.current = { version: STORAGE_VERSION, sets, activeSetId };
    const run = useCallback(
        (command: PlannerCommand, quiet = false) => {
            try {
                const result = editPlanner({ state: state.current, command });
                state.current = result.state;
                setSets(result.state.sets);
                setActiveSetId(result.state.activeSetId);
                return result.ids;
            } catch (error) {
                if (!quiet)
                    toast.error(
                        error instanceof Error ? error.message : "Could not update planner.",
                    );
                return null;
            }
        },
        [setSets, setActiveSetId],
    );
    const activeSet = sets.find((set) => set.id === activeSetId) ?? null;
    const addIdols = (idols: IdolInstance[], source: ImportSource) =>
        activeSetId && idols.length
            ? (run({ action: "addIdols", setId: activeSetId, idols, source }) ?? [])
            : [];
    const removeIdols = (ids: string[]) => {
        if (activeSetId && ids.length) run({ action: "removeIdols", setId: activeSetId, ids });
    };
    return {
        sets,
        activeSet,
        activeSetId,
        selectSet: (setId: string) => {
            run({ action: "select", setId });
        },
        createSet: (name: string) => run({ action: "create", name })?.[0] ?? "",
        deleteSet: (setId: string) => {
            run({ action: "delete", setId });
        },
        renameSet: (setId: string, name: string) => {
            run({ action: "rename", setId, name });
        },
        duplicateSet: (setId: string) => run({ action: "duplicate", setId })?.[0] ?? null,
        canPlaceIdol: (item: InventoryIdol, position: Position, excludePlacementId?: string) =>
            activeSet ? canPlaceInSet(activeSet, item.id, position, excludePlacementId) : false,
        placeIdol: (idolId: string, position: Position) =>
            activeSetId
                ? (run({ action: "place", setId: activeSetId, idolId, position }, true)?.[0] ??
                  null)
                : null,
        moveIdol: (placementId: string, position: Position) =>
            Boolean(
                activeSetId &&
                    run({ action: "move", setId: activeSetId, placementId, position }, true),
            ),
        removeIdolFromSet: (placementId: string) => {
            if (activeSetId) run({ action: "removePlacement", setId: activeSetId, placementId });
        },
        removeInventoryIdolFromAllSets: (idolId: string) => {
            for (const set of state.current.sets) {
                for (const placement of set.placements.filter(
                    (entry) => entry.inventoryIdolId === idolId,
                )) {
                    run({ action: "removePlacement", setId: set.id, placementId: placement.id });
                }
            }
        },
        updateMapDeviceSlot: (slotIndex: number, scarabId: string | null) => {
            if (activeSetId) run({ action: "setSlot", setId: activeSetId, slotIndex, scarabId });
        },
        updateMapDeviceCraftingOption: (craftingOptionId: string | null) => {
            if (activeSetId) run({ action: "setCraft", setId: activeSetId, craftingOptionId });
        },
        updateUnlockedConditions: (unlockedConditions: string[]) => {
            if (activeSetId) run({ action: "setUnlocks", setId: activeSetId, unlockedConditions });
        },
        addIdol: (idol: IdolInstance, source: ImportSource) => addIdols([idol], source)[0] ?? null,
        addIdols,
        updateIdol: (idolId: string, idol: IdolInstance) => {
            if (activeSetId) run({ action: "updateIdol", setId: activeSetId, idolId, idol });
        },
        duplicateIdol: (idolId: string) =>
            activeSetId
                ? (run({ action: "duplicateIdol", setId: activeSetId, idolId })?.[0] ?? null)
                : null,
        removeIdol: (idolId: string) => removeIdols([idolId]),
        removeIdols,
        clearInventory: () => {
            if (activeSetId) run({ action: "clearInventory", setId: activeSetId });
        },
    };
}

export type UseIdolSetsReturn = ReturnType<typeof useIdolSets>;
