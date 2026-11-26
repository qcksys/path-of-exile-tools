import { useIdolSets } from "~/hooks/use-idol-sets";
import { useStorageState } from "~/hooks/use-storage-state";
import { loadStorage, saveStorage } from "~/lib/storage";
import { newPlannerSet } from "~/operations/planner";
import { createEmptyStorage, type StorageData } from "~/schemas/storage";

function loadPlanner(): StorageData {
    const data = loadStorage();
    if (!data.sets.length) {
        const set = newPlannerSet("Set 1", "default");
        return { ...data, sets: [set], activeSetId: set.id };
    }
    for (const set of data.sets) {
        const counts = new Map<string, number>();
        for (const { inventoryIdolId } of set.placements)
            counts.set(inventoryIdolId, (counts.get(inventoryIdolId) ?? 0) + 1);
        for (const item of set.inventory) item.usageCount = counts.get(item.id) ?? 0;
    }
    return data;
}

function savePlanner(planner: StorageData) {
    const result = saveStorage(planner);
    if (!result.success) throw new Error(result.error);
}

export function usePlannerState() {
    const [planner, setPlanner, isHydrated] = useStorageState(
        loadPlanner,
        savePlanner,
        createEmptyStorage(),
    );
    return { isHydrated, sets: useIdolSets(planner, setPlanner) };
}
