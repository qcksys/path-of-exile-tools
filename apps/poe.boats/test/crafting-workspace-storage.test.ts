import { describe, expect, it } from "vite-plus/test";
import { workspaceBundle } from "../app/lib/crafting-cloud-sync";
import {
    CraftingWorkspaceStore,
    craftingWorkspaceStorageKey,
} from "../app/lib/crafting-workspace-storage";
import { cloudBundle } from "./crafting-cloud-fixtures";
import { graphFixture } from "./crafting-graph-fixtures";

function storage() {
    const data = new Map<string, string>();
    return {
        data,
        full: false,
        getItem(key: string) {
            return data.get(key) ?? null;
        },
        setItem(key: string, value: string) {
            if (this.full) throw new Error("Storage is full.");
            data.set(key, value);
        },
    };
}

describe("local crafting workspace storage", () => {
    it("applies cloud data only when local drafts and browser storage still match the requested snapshot", () => {
        const disk = storage();
        const store = new CraftingWorkspaceStore();
        store.connect(disk);
        const empty = workspaceBundle(store.snapshot().state);
        expect(store.applyCloud(cloudBundle(), empty)).toBe(true);
        expect(store.snapshot().state.tabs).toEqual(["graph", "private"]);
        const before = workspaceBundle(store.snapshot().state);
        store.edit({
            action: "updateProject",
            expectedRevision: 1,
            graph: { ...before.projects[0]!.graph, name: "Edited while request ran" },
        });
        const local = store.snapshot().state;
        expect(store.applyCloud(cloudBundle(), before)).toBe(false);
        expect(store.snapshot().state).toEqual(local);
        const saved = disk.getItem(craftingWorkspaceStorageKey);
        disk.full = true;
        expect(store.applyCloud(cloudBundle(), workspaceBundle(local))).toBe(false);
        expect(store.snapshot().state).toEqual(local);
        expect(disk.getItem(craftingWorkspaceStorageKey)).toBe(saved);
        disk.full = false;
        const second = new CraftingWorkspaceStore();
        second.connect(disk);
        second.edit({ action: "createProject", graph: graphFixture() });
        const other = disk.getItem(craftingWorkspaceStorageKey);
        expect(store.applyCloud(cloudBundle(), workspaceBundle(local))).toBe(false);
        expect(store.snapshot().state).toEqual(local);
        expect(disk.getItem(craftingWorkspaceStorageKey)).toBe(other);
    });
    it("persists projects and selected tabs across reload without changing the SSR snapshot", () => {
        const disk = storage();
        const store = new CraftingWorkspaceStore();
        const initial = store.serverSnapshot();
        store.connect(disk);
        const [id] = store.edit({ action: "createProject", graph: graphFixture() });
        const reload = new CraftingWorkspaceStore();
        reload.connect(disk);
        expect(reload.snapshot().state).toEqual(store.snapshot().state);
        expect(reload.snapshot().state.activeProjectId).toBe(id);
        expect(store.serverSnapshot()).toBe(initial);
        expect(initial.ready).toBe(false);
    });

    it("keeps an unsaved draft after quota failure and saves it when space is available", () => {
        const disk = storage();
        const store = new CraftingWorkspaceStore();
        store.connect(disk);
        disk.full = true;
        store.edit({ action: "createProject", graph: graphFixture() });
        expect(store.snapshot()).toMatchObject({ unsaved: true, error: "Storage is full." });
        expect(store.snapshot().state.projects).toHaveLength(1);
        expect(disk.data.size).toBe(0);
        disk.full = false;
        store.save();
        expect(store.snapshot()).toMatchObject({ unsaved: false, error: null });
        expect(disk.getItem(craftingWorkspaceStorageKey)).not.toBeNull();
    });

    it("never overwrites corrupt existing storage while retaining new work for export", () => {
        const disk = storage();
        disk.setItem(craftingWorkspaceStorageKey, "invalid saved data");
        const store = new CraftingWorkspaceStore();
        store.connect(disk);
        expect(store.snapshot().error).not.toBeNull();
        store.edit({ action: "createProject", graph: graphFixture() });
        expect(store.snapshot().state.projects).toHaveLength(1);
        expect(store.snapshot().unsaved).toBe(true);
        expect(disk.getItem(craftingWorkspaceStorageKey)).toBe("invalid saved data");
    });

    it("detects another tab's intervening save and preserves both versions", () => {
        const disk = storage();
        const first = new CraftingWorkspaceStore();
        const second = new CraftingWorkspaceStore();
        first.connect(disk);
        first.edit({ action: "createProject", graph: graphFixture() });
        second.connect(disk);
        const project = first.snapshot().state.projects[0]!;
        first.edit({
            action: "updateProject",
            expectedRevision: 1,
            graph: { ...project.graph, name: "First tab" },
        });
        const saved = disk.getItem(craftingWorkspaceStorageKey);
        second.edit({
            action: "updateProject",
            expectedRevision: 1,
            graph: { ...project.graph, name: "Second tab" },
        });
        second.refresh();
        expect(second.snapshot().state.projects[0]!.graph.name).toBe("Second tab");
        expect(second.snapshot().unsaved).toBe(true);
        expect(second.snapshot().error).toContain("Another browser tab");
        expect(disk.getItem(craftingWorkspaceStorageKey)).toBe(saved);
        const viewer = new CraftingWorkspaceStore();
        viewer.connect(disk);
        expect(viewer.snapshot().state.projects[0]!.graph.name).toBe("First tab");
    });

    it("refreshes clean tabs and unsubscribes listeners", () => {
        const disk = storage();
        const writer = new CraftingWorkspaceStore();
        const reader = new CraftingWorkspaceStore();
        writer.connect(disk);
        reader.connect(disk);
        let changes = 0;
        const unsubscribe = reader.subscribe(() => changes++);
        writer.edit({ action: "createProject", graph: graphFixture() });
        reader.refresh();
        expect(reader.snapshot().state).toEqual(writer.snapshot().state);
        expect(changes).toBe(1);
        unsubscribe();
        reader.refresh();
        expect(changes).toBe(1);
    });
});
