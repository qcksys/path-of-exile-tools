// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useItemLibrary } from "~/components/crafting/use-item-library";
import { CraftingEngine } from "~/lib/crafting-engine";
import { craftingInventory, validateLibrary } from "~/lib/crafting-inventory";
import { craftingCatalogSchema } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

const poe2 = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
beforeEach(() => localStorage.clear());
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe.each([catalog, poe2])("$game shared item library", (data) => {
    const engine = new CraftingEngine(data);
    const key = `poe-boats:crafting:${data.game}:${data.patch}:library:v1`;
    const item = engine.createItem(
        Object.keys(data.bases).find((id) => data.bases[id]!.item_class === "Body Armour")!,
    );
    const entry = { id: "item", name: "Finished item", item, tab: "Keep" };
    const library = {
        format: 1 as const,
        game: data.game,
        patch: data.patch,
        inventory: [entry],
        inventoryTabs: ["Keep", "Empty"],
    };
    const mount = () =>
        renderHook(() => useItemLibrary(engine), {
            wrapper: ({ children }) => createElement(StrictMode, null, children),
        });

    it("validates JSON roundtrips including empty tabs without sharing item objects", () => {
        const restored = validateLibrary(engine, JSON.parse(JSON.stringify(library)));
        expect(restored).toEqual(library);
        expect(restored.inventory[0]!.item).not.toBe(item);
        expect(
            validateLibrary(engine, { ...library, inventory: [], inventoryTabs: undefined }),
        ).toMatchObject({ inventory: [] });
    });

    it("rejects wrong builds, invalid tabs, duplicate identities and non-catalog items", () => {
        for (const input of [
            { ...library, game: data.game === "poe1" ? "poe2" : "poe1" },
            { ...library, patch: "other" },
            { ...library, format: 2 },
            { ...library, inventoryTabs: ["Empty"] },
            { ...library, inventoryTabs: ["Keep", "Keep"] },
            { ...library, inventoryTabs: ["Unfiled"] },
            { ...library, inventory: [entry, entry] },
            { ...library, inventory: [{ ...entry, item: { ...item, baseId: "unknown" } }] },
            {
                ...library,
                inventory: [{ ...entry, item: { ...item, mods: [{ id: "unknown", values: [] }] } }],
            },
        ])
            expect(() => validateLibrary(engine, input)).toThrow();
    });

    it("makes all tabs available to donor pickers with distinct valid identities", () => {
        const project = [{ ...entry, id: "library:item", name: "Project item" }];
        const entries = craftingInventory(project, [
            entry,
            { ...entry, id: "library:item", name: "a".repeat(100) },
        ]);
        expect(new Set(entries.map((value) => value.id)).size).toBe(3);
        expect(entries[0]).toEqual(project[0]);
        expect(entries[1]).toMatchObject({ name: "Library · Finished item", tab: "Keep", item });
        expect(entries[2]!.name).toHaveLength(100);
        expect(library.inventory).toEqual([entry]);
    });

    it("does not write defaults during Strict Mode mount and restores separately saved state", () => {
        const writes = vi.spyOn(Storage.prototype, "setItem");
        const empty = mount();
        expect(empty.result.current.ready).toBe(true);
        expect(writes).not.toHaveBeenCalled();
        empty.unmount();
        localStorage.setItem(key, JSON.stringify(library));
        writes.mockClear();
        const { result } = mount();
        expect(result.current.library).toEqual(library);
        expect(writes).not.toHaveBeenCalled();
    });

    it("saves only validated data and preserves stored and visible contents on quota failure", () => {
        localStorage.setItem(key, JSON.stringify(library));
        const { result } = mount();
        const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("Full", "QuotaExceededError");
        });
        act(() => expect(result.current.save({ ...library, inventory: [] })).toBe(false));
        expect(result.current.library).toEqual(library);
        expect(localStorage.getItem(key)).toBe(JSON.stringify(library));
        expect(result.current.error).toContain("Cannot save the shared library");
        writes.mockRestore();
        act(() => expect(result.current.save({ ...library, inventory: [] })).toBe(true));
        expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ inventory: [] });
        expect(result.current.error).toBe("");
        act(() => expect(result.current.save({ ...library, patch: "wrong" })).toBe(false));
        expect(result.current.library.inventory).toEqual([]);
    });

    it("preserves malformed storage until explicit replacement", () => {
        localStorage.setItem(key, "{broken");
        const { result } = mount();
        expect(result.current.blocked).toBe(true);
        expect(result.current.error).toContain("Cannot read the shared library");
        act(() => expect(result.current.save(library)).toBe(false));
        expect(localStorage.getItem(key)).toBe("{broken");
        act(() => expect(result.current.save(library, true)).toBe(true));
        expect(result.current.library).toEqual(library);
        expect(result.current.blocked).toBe(false);
    });

    it("recovers from a storage read failure without overwriting unknown data", () => {
        localStorage.setItem(key, JSON.stringify(library));
        const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new DOMException("Denied", "SecurityError");
        });
        const writes = vi.spyOn(Storage.prototype, "setItem");
        const { result } = mount();
        expect(result.current.blocked).toBe(true);
        act(() => expect(result.current.save(result.current.empty(), true)).toBe(false));
        expect(writes).not.toHaveBeenCalled();
        read.mockRestore();
        act(() => result.current.reload());
        expect(result.current.library).toEqual(library);
        expect(result.current.blocked).toBe(false);
    });

    it("refreshes cross-tab changes and rejects writes based on stale contents", () => {
        const { result } = mount();
        localStorage.setItem(key, JSON.stringify(library));
        act(() => expect(result.current.save(result.current.empty())).toBe(false));
        expect(result.current.library).toEqual(library);
        expect(result.current.error).toContain("changed in another browser tab");
        const updated = { ...library, inventory: [] };
        localStorage.setItem(key, JSON.stringify(updated));
        act(() => window.dispatchEvent(new StorageEvent("storage", { key })));
        expect(result.current.library).toEqual(updated);
        expect(result.current.error).toBe("");
        localStorage.setItem(key, "broken");
        act(() => window.dispatchEvent(new StorageEvent("storage", { key })));
        expect(result.current.library).toEqual(updated);
        expect(result.current.blocked).toBe(true);
        act(() => expect(result.current.save(library)).toBe(false));
        expect(localStorage.getItem(key)).toBe("broken");
        localStorage.removeItem(key);
        act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
        expect(result.current.library).toEqual(result.current.empty());
        expect(result.current.blocked).toBe(false);
    });

    it("keeps other builds isolated and removes its storage listener on unmount", () => {
        localStorage.setItem(key, JSON.stringify(library));
        const view = mount();
        view.unmount();
        const read = vi.spyOn(Storage.prototype, "getItem");
        act(() => window.dispatchEvent(new StorageEvent("storage", { key })));
        expect(read).not.toHaveBeenCalled();
        const other = new CraftingEngine({ ...data, patch: "another-build" });
        const { result } = renderHook(() => useItemLibrary(other));
        expect(result.current.library.inventory).toEqual([]);
        expect(localStorage.getItem(key)).toBe(JSON.stringify(library));
    });
});
