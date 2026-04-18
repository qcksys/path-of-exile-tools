import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAllUnlockIds } from "~/data/map-device-unlocks";
import { useIdolSets } from "~/hooks/use-idol-sets";
import { loadStorage, saveStorage } from "~/lib/storage";
import type { IdolSet } from "~/schemas/idol-set";
import { createEmptyMapDevice } from "~/schemas/scarab";
import { STORAGE_VERSION } from "~/schemas/storage";

const DEFAULT_SET_NAME = "Set 1";

export function usePlannerState() {
    const [sets, setSets] = useState<IdolSet[]>([]);
    const [activeSetId, setActiveSetId] = useState<string | null>(null);
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        const data = loadStorage();
        setSets(data.sets);
        setActiveSetId(data.activeSetId);

        if (data.sets.length === 0) {
            const defaultSet: IdolSet = {
                id: "default",
                name: DEFAULT_SET_NAME,
                placements: [],
                inventory: [],
                mapDevice: createEmptyMapDevice(),
                unlockedConditions: getAllUnlockIds(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            setSets([defaultSet]);
            setActiveSetId(defaultSet.id);
        }

        setIsHydrated(true);
    }, []);

    useEffect(() => {
        if (!isHydrated) return;

        const result = saveStorage({
            version: STORAGE_VERSION,
            sets,
            activeSetId,
        });

        if (!result.success) {
            toast.error("Failed to save changes", {
                description: result.error,
            });
        }
    }, [sets, activeSetId, isHydrated]);

    const setsHook = useIdolSets(sets, setSets, activeSetId, setActiveSetId);

    // Update usage counts when placements change
    useEffect(() => {
        if (!isHydrated || !setsHook.activeSet) return;

        const activeSet = setsHook.activeSet;
        const placementIdolIds = activeSet.placements.map((p) => p.inventoryIdolId);

        // Build count map
        const countMap = new Map<string, number>();
        for (const id of placementIdolIds) {
            countMap.set(id, (countMap.get(id) ?? 0) + 1);
        }

        // Update inventory items with usage counts
        const needsUpdate = activeSet.inventory.some(
            (item) => item.usageCount !== (countMap.get(item.id) ?? 0),
        );

        if (needsUpdate) {
            setSets((prev) =>
                prev.map((s) =>
                    s.id === activeSet.id
                        ? {
                              ...s,
                              inventory: s.inventory.map((item) => ({
                                  ...item,
                                  usageCount: countMap.get(item.id) ?? 0,
                              })),
                          }
                        : s,
                ),
            );
        }
    }, [isHydrated, setsHook.activeSet]);

    return {
        isHydrated,
        sets: setsHook,
    };
}
