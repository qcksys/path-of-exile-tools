import { useEffect, useState, useSyncExternalStore } from "react";
import {
    CraftingWorkspaceStore,
    craftingWorkspaceStorageKey,
} from "~/lib/crafting-workspace-storage";

const workspaceChanged = "poe-boats:crafting-workspace-changed";

export function useCraftingWorkspace() {
    const [store] = useState(() => new CraftingWorkspaceStore());
    const snapshot = useSyncExternalStore(store.subscribe, store.snapshot, store.serverSnapshot);
    useEffect(() => {
        store.connect({
            getItem: (key) => localStorage.getItem(key),
            setItem: (key, value) => {
                localStorage.setItem(key, value);
                window.dispatchEvent(new CustomEvent(workspaceChanged, { detail: store }));
            },
        });
        const refresh = (event: StorageEvent) => {
            if (event.key === craftingWorkspaceStorageKey || event.key === null) store.refresh();
        };
        window.addEventListener("storage", refresh);
        const refreshLocal = (event: Event) => {
            if (event instanceof CustomEvent && event.detail !== store) store.refresh();
        };
        window.addEventListener(workspaceChanged, refreshLocal);
        return () => {
            window.removeEventListener("storage", refresh);
            window.removeEventListener(workspaceChanged, refreshLocal);
        };
    }, [store]);
    return { ...snapshot, store };
}
