import { nanoid } from "nanoid";
import { useCallback, useMemo } from "react";
import type { IdolInstance } from "~/schemas/idol";
import type { ImportSource, InventoryIdol } from "~/schemas/inventory";

export interface UseInventoryReturn {
    inventory: InventoryIdol[];
    addIdol: (idol: IdolInstance, source: ImportSource) => string;
    addIdols: (idols: IdolInstance[], source: ImportSource) => string[];
    updateIdol: (id: string, idol: IdolInstance) => void;
    duplicateIdol: (id: string) => string | null;
    removeIdol: (id: string) => void;
    getIdol: (id: string) => InventoryIdol | undefined;
    searchInventory: (query: string) => InventoryIdol[];
    clearInventory: () => void;
    updateUsageCounts: (placementIdolIds: string[]) => void;
}

export function useInventory(
    inventory: InventoryIdol[],
    setInventory: React.Dispatch<React.SetStateAction<InventoryIdol[]>>,
): UseInventoryReturn {
    const addIdol = useCallback(
        (idol: IdolInstance, source: ImportSource): string => {
            const id = nanoid();
            const newItem: InventoryIdol = {
                id,
                idol,
                importedAt: Date.now(),
                source,
                usageCount: 0,
            };
            setInventory((prev) => [...prev, newItem]);
            return id;
        },
        [setInventory],
    );

    const addIdols = useCallback(
        (idols: IdolInstance[], source: ImportSource): string[] => {
            const newItems: InventoryIdol[] = idols.map((idol) => ({
                id: nanoid(),
                idol,
                importedAt: Date.now(),
                source,
                usageCount: 0,
            }));
            setInventory((prev) => [...prev, ...newItems]);
            return newItems.map((item) => item.id);
        },
        [setInventory],
    );

    const updateIdol = useCallback(
        (id: string, idol: IdolInstance): void => {
            setInventory((prev) => prev.map((item) => (item.id === id ? { ...item, idol } : item)));
        },
        [setInventory],
    );

    const duplicateIdol = useCallback(
        (id: string): string | null => {
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
            setInventory((prev) => [...prev, duplicate]);
            return newId;
        },
        [inventory, setInventory],
    );

    const removeIdol = useCallback(
        (id: string) => {
            setInventory((prev) => prev.filter((item) => item.id !== id));
        },
        [setInventory],
    );

    const getIdol = useCallback(
        (id: string): InventoryIdol | undefined => {
            return inventory.find((item) => item.id === id);
        },
        [inventory],
    );

    const searchInventory = useCallback(
        (query: string): InventoryIdol[] => {
            if (!query.trim()) return inventory;

            const lowerQuery = query.toLowerCase();
            return inventory.filter((item) => {
                const idol = item.idol;
                const allMods = [...idol.prefixes, ...idol.suffixes];

                return (
                    idol.name?.toLowerCase().includes(lowerQuery) ||
                    idol.baseType.toLowerCase().includes(lowerQuery) ||
                    allMods.some((mod) => mod.text?.toLowerCase().includes(lowerQuery))
                );
            });
        },
        [inventory],
    );

    const clearInventory = useCallback(() => {
        setInventory([]);
    }, [setInventory]);

    const updateUsageCounts = useCallback(
        (placementIdolIds: string[]) => {
            const countMap = new Map<string, number>();
            for (const id of placementIdolIds) {
                countMap.set(id, (countMap.get(id) ?? 0) + 1);
            }

            setInventory((prev) =>
                prev.map((item) => ({
                    ...item,
                    usageCount: countMap.get(item.id) ?? 0,
                })),
            );
        },
        [setInventory],
    );

    return useMemo(
        () => ({
            inventory,
            addIdol,
            addIdols,
            updateIdol,
            duplicateIdol,
            removeIdol,
            getIdol,
            searchInventory,
            clearInventory,
            updateUsageCounts,
        }),
        [
            inventory,
            addIdol,
            addIdols,
            updateIdol,
            duplicateIdol,
            removeIdol,
            getIdol,
            searchInventory,
            clearInventory,
            updateUsageCounts,
        ],
    );
}
