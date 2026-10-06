import { useCallback, useEffect, useRef, useState } from "react";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { validateLibrary } from "~/lib/crafting-inventory";
import type { CraftingLibrary } from "~/schemas/crafting";

export function useItemLibrary(engine: CraftingEngine) {
    const key = `poe-boats:crafting:${engine.catalog.game}:${engine.catalog.patch}:library:v1`;
    const empty = useCallback(
        (): CraftingLibrary => ({
            format: 1,
            game: engine.catalog.game,
            patch: engine.catalog.patch,
            inventory: [],
            inventoryTabs: [],
        }),
        [engine.catalog.game, engine.catalog.patch],
    );
    const [library, setLibrary] = useState(empty);
    const [ready, setReady] = useState(false);
    const [blocked, setBlocked] = useState(false);
    const [error, setError] = useState("");
    const stored = useRef<{ key: string; raw: string | null } | undefined>(undefined);

    const reload = useCallback(() => {
        if (stored.current?.key !== key) setLibrary(empty());
        try {
            const raw = localStorage.getItem(key);
            stored.current = { key, raw };
            const next = raw === null ? empty() : validateLibrary(engine, JSON.parse(raw));
            setLibrary(next);
            setBlocked(false);
            setError("");
        } catch (error) {
            setBlocked(true);
            setError(`Cannot read the shared library: ${String(error)}`);
        }
        setReady(true);
    }, [engine, key, empty]);

    useEffect(() => {
        reload();
        const updated = (event: StorageEvent) => {
            if (event.key === key || event.key === null) reload();
        };
        window.addEventListener("storage", updated);
        return () => window.removeEventListener("storage", updated);
    }, [reload, key]);

    const save = (input: CraftingLibrary, replace = false) => {
        if (!ready || stored.current?.key !== key || (blocked && !replace)) return false;
        try {
            const next = validateLibrary(engine, input);
            const raw = localStorage.getItem(key);
            if (raw !== stored.current.raw) {
                reload();
                setError("The shared library changed in another browser tab. Review it and retry.");
                return false;
            }
            const serialized = JSON.stringify(next);
            localStorage.setItem(key, serialized);
            stored.current = { key, raw: serialized };
            setLibrary(next);
            setBlocked(false);
            setError("");
            return true;
        } catch (error) {
            setError(`Cannot save the shared library: ${String(error)}`);
            return false;
        }
    };

    return { library, ready, blocked, error, reload, save, empty };
}
