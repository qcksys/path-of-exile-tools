import { nanoid } from "nanoid";
import { useCallback, useMemo } from "react";
import type { IdolBaseKey } from "~/data/idol-bases";
import { getAllUnlockIds } from "~/data/map-device-unlocks";
import { buildOccupancyGrid, checkCanPlace, type Position } from "~/lib/grid-utils";
import type { IdolInstance } from "~/schemas/idol";
import type { IdolPlacement, IdolSet } from "~/schemas/idol-set";
import type { ImportSource, InventoryIdol } from "~/schemas/inventory";
import { createEmptyMapDevice } from "~/schemas/scarab";

export interface UseIdolSetsReturn {
    sets: IdolSet[];
    activeSet: IdolSet | null;
    activeSetId: string | null;
    selectSet: (id: string) => void;
    createSet: (name: string) => string;
    deleteSet: (id: string) => void;
    renameSet: (id: string, name: string) => void;
    duplicateSet: (id: string) => string | null;
    placeIdol: (inventoryIdolId: string, position: Position) => string | null;
    moveIdol: (placementId: string, newPosition: Position) => boolean;
    removeIdolFromSet: (placementId: string) => void;
    removeInventoryIdolFromAllSets: (inventoryIdolId: string) => void;
    canPlaceIdol: (
        inventoryIdol: InventoryIdol,
        position: Position,
        excludePlacementId?: string,
    ) => boolean;
    // Map device operations
    updateMapDeviceSlot: (slotIndex: number, scarabId: string | null) => void;
    updateMapDeviceCraftingOption: (optionId: string | null) => void;
    // Unlock operations
    updateUnlockedConditions: (conditions: string[]) => void;
    // Inventory operations for active set
    addIdol: (idol: IdolInstance, source: ImportSource) => string | null;
    addIdols: (idols: IdolInstance[], source: ImportSource) => string[];
    updateIdol: (id: string, idol: IdolInstance) => void;
    duplicateIdol: (id: string) => string | null;
    removeIdol: (id: string) => void;
    removeIdols: (ids: string[]) => void;
    clearInventory: () => void;
}

export function useIdolSets(
    sets: IdolSet[],
    setSets: React.Dispatch<React.SetStateAction<IdolSet[]>>,
    activeSetId: string | null,
    setActiveSetId: React.Dispatch<React.SetStateAction<string | null>>,
): UseIdolSetsReturn {
    const activeSet = useMemo(
        () => sets.find((s) => s.id === activeSetId) ?? null,
        [sets, activeSetId],
    );

    const inventory = activeSet?.inventory ?? [];

    const selectSet = useCallback(
        (id: string) => {
            setActiveSetId(id);
        },
        [setActiveSetId],
    );

    const createSet = useCallback(
        (name: string): string => {
            const id = nanoid();
            const newSet: IdolSet = {
                id,
                name,
                placements: [],
                inventory: [],
                mapDevice: createEmptyMapDevice(),
                unlockedConditions: getAllUnlockIds(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            setSets((prev) => [...prev, newSet]);
            setActiveSetId(id);
            return id;
        },
        [setSets, setActiveSetId],
    );

    const deleteSet = useCallback(
        (id: string) => {
            setSets((prev) => {
                const remaining = prev.filter((s) => s.id !== id);
                if (remaining.length === 0) {
                    return prev;
                }
                return remaining;
            });
            if (activeSetId === id) {
                setSets((prev) => {
                    const remaining = prev.filter((s) => s.id !== id);
                    if (remaining.length > 0) {
                        setActiveSetId(remaining[0].id);
                    }
                    return prev;
                });
            }
        },
        [setSets, activeSetId, setActiveSetId],
    );

    const renameSet = useCallback(
        (id: string, name: string) => {
            setSets((prev) =>
                prev.map((s) => (s.id === id ? { ...s, name, updatedAt: Date.now() } : s)),
            );
        },
        [setSets],
    );

    const duplicateSet = useCallback(
        (id: string): string | null => {
            const sourceSet = sets.find((s) => s.id === id);
            if (!sourceSet) return null;

            const newId = nanoid();
            const newSet: IdolSet = {
                ...sourceSet,
                id: newId,
                name: `${sourceSet.name} (Copy)`,
                placements: sourceSet.placements.map((p) => ({
                    ...p,
                    id: nanoid(),
                })),
                inventory: sourceSet.inventory.map((item) => ({
                    ...item,
                    id: nanoid(),
                    idol: { ...item.idol, id: nanoid() },
                })),
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            setSets((prev) => [...prev, newSet]);
            setActiveSetId(newId);
            return newId;
        },
        [sets, setSets, setActiveSetId],
    );

    const canPlaceIdol = useCallback(
        (
            inventoryIdol: InventoryIdol,
            position: Position,
            excludePlacementId?: string,
        ): boolean => {
            if (!activeSet) return false;

            const grid = buildOccupancyGrid(activeSet.placements, inventory, excludePlacementId);
            return checkCanPlace(grid, inventoryIdol.idol.baseType as IdolBaseKey, position);
        },
        [activeSet, inventory],
    );

    const placeIdol = useCallback(
        (inventoryIdolId: string, position: Position): string | null => {
            if (!activeSet) return null;

            const invIdol = inventory.find((i) => i.id === inventoryIdolId);
            if (!invIdol) return null;

            const grid = buildOccupancyGrid(activeSet.placements, inventory);
            if (!checkCanPlace(grid, invIdol.idol.baseType as IdolBaseKey, position)) {
                return null;
            }

            const placementId = nanoid();
            const newPlacement: IdolPlacement = {
                id: placementId,
                inventoryIdolId,
                position,
            };

            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              placements: [...s.placements, newPlacement],
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );

            return placementId;
        },
        [activeSet, inventory, setSets],
    );

    const moveIdol = useCallback(
        (placementId: string, newPosition: Position): boolean => {
            if (!activeSet) return false;

            const placement = activeSet.placements.find((p) => p.id === placementId);
            if (!placement) return false;

            const invIdol = inventory.find((i) => i.id === placement.inventoryIdolId);
            if (!invIdol) return false;

            const grid = buildOccupancyGrid(activeSet.placements, inventory, placementId);
            if (!checkCanPlace(grid, invIdol.idol.baseType as IdolBaseKey, newPosition)) {
                return false;
            }

            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              placements: s.placements.map((p) =>
                                  p.id === placementId
                                      ? {
                                            ...p,
                                            position: newPosition,
                                        }
                                      : p,
                              ),
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );

            return true;
        },
        [activeSet, inventory, setSets],
    );

    const removeIdolFromSet = useCallback(
        (placementId: string) => {
            setSets((prev) =>
                prev.map((s) => ({
                    ...s,
                    placements: s.placements.filter((p) => p.id !== placementId),
                    updatedAt: Date.now(),
                })),
            );
        },
        [setSets],
    );

    const removeInventoryIdolFromAllSets = useCallback(
        (inventoryIdolId: string) => {
            setSets((prev) =>
                prev.map((s) => ({
                    ...s,
                    placements: s.placements.filter((p) => p.inventoryIdolId !== inventoryIdolId),
                    updatedAt: Date.now(),
                })),
            );
        },
        [setSets],
    );

    // Map device operations
    const updateMapDeviceSlot = useCallback(
        (slotIndex: number, scarabId: string | null) => {
            if (!activeSet) return;

            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              mapDevice: {
                                  ...s.mapDevice,
                                  slots: s.mapDevice.slots.map((slot) =>
                                      slot.slotIndex === slotIndex ? { ...slot, scarabId } : slot,
                                  ),
                              },
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );
        },
        [activeSet, setSets],
    );

    const updateMapDeviceCraftingOption = useCallback(
        (optionId: string | null) => {
            if (!activeSet) return;

            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              mapDevice: {
                                  ...s.mapDevice,
                                  craftingOptionId: optionId,
                              },
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );
        },
        [activeSet, setSets],
    );

    const updateUnlockedConditions = useCallback(
        (conditions: string[]) => {
            if (!activeSet) return;

            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              unlockedConditions: conditions,
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );
        },
        [activeSet, setSets],
    );

    // Inventory operations for active set
    const addIdol = useCallback(
        (idol: IdolInstance, source: ImportSource): string | null => {
            if (!activeSet) return null;

            const id = nanoid();
            const newItem: InventoryIdol = {
                id,
                idol,
                importedAt: Date.now(),
                source,
                usageCount: 0,
            };

            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              inventory: [...s.inventory, newItem],
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );

            return id;
        },
        [activeSet, setSets],
    );

    const addIdols = useCallback(
        (idols: IdolInstance[], source: ImportSource): string[] => {
            if (!activeSet) return [];

            const newItems: InventoryIdol[] = idols.map((idol) => ({
                id: nanoid(),
                idol,
                importedAt: Date.now(),
                source,
                usageCount: 0,
            }));

            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              inventory: [...s.inventory, ...newItems],
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );

            return newItems.map((item) => item.id);
        },
        [activeSet, setSets],
    );

    const updateIdol = useCallback(
        (id: string, idol: IdolInstance): void => {
            if (!activeSet) return;

            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              inventory: s.inventory.map((item) =>
                                  item.id === id ? { ...item, idol } : item,
                              ),
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );
        },
        [activeSet, setSets],
    );

    const duplicateIdol = useCallback(
        (id: string): string | null => {
            if (!activeSet) return null;

            const original = inventory.find((item) => item.id === id);
            if (!original) return null;

            const newId = nanoid();
            const duplicate: InventoryIdol = {
                id: newId,
                idol: { ...original.idol, id: nanoid() },
                importedAt: Date.now(),
                source: original.source,
                usageCount: 0,
            };

            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              inventory: [...s.inventory, duplicate],
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );

            return newId;
        },
        [activeSet, inventory, setSets],
    );

    const removeIdol = useCallback(
        (id: string) => {
            if (!activeSet) return;

            // Remove from inventory and placements
            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              inventory: s.inventory.filter((item) => item.id !== id),
                              placements: s.placements.filter((p) => p.inventoryIdolId !== id),
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );
        },
        [activeSet, setSets],
    );

    const removeIdols = useCallback(
        (ids: string[]) => {
            if (!activeSet) return;

            const idSet = new Set(ids);
            // Remove from inventory and placements
            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              inventory: s.inventory.filter((item) => !idSet.has(item.id)),
                              placements: s.placements.filter((p) => !idSet.has(p.inventoryIdolId)),
                              updatedAt: Date.now(),
                          }
                        : s,
                ),
            );
        },
        [activeSet, setSets],
    );

    const clearInventory = useCallback(() => {
        if (!activeSet) return;

        setSets((prev) =>
            prev.map((s) =>
                s.id === activeSet.id
                    ? {
                          ...s,
                          inventory: [],
                          placements: [],
                          updatedAt: Date.now(),
                      }
                    : s,
            ),
        );
    }, [activeSet, setSets]);

    return useMemo(
        () => ({
            sets,
            activeSet,
            activeSetId,
            selectSet,
            createSet,
            deleteSet,
            renameSet,
            duplicateSet,
            placeIdol,
            moveIdol,
            removeIdolFromSet,
            removeInventoryIdolFromAllSets,
            canPlaceIdol,
            updateMapDeviceSlot,
            updateMapDeviceCraftingOption,
            updateUnlockedConditions,
            addIdol,
            addIdols,
            updateIdol,
            duplicateIdol,
            removeIdol,
            removeIdols,
            clearInventory,
        }),
        [
            sets,
            activeSet,
            activeSetId,
            selectSet,
            createSet,
            deleteSet,
            renameSet,
            duplicateSet,
            placeIdol,
            moveIdol,
            removeIdolFromSet,
            removeInventoryIdolFromAllSets,
            canPlaceIdol,
            updateMapDeviceSlot,
            updateMapDeviceCraftingOption,
            updateUnlockedConditions,
            addIdol,
            addIdols,
            updateIdol,
            duplicateIdol,
            removeIdol,
            removeIdols,
            clearInventory,
        ],
    );
}
