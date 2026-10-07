import type {
    CraftingBundle,
    CraftingWorkspace,
    CraftingWorkspaceCommand,
} from "../schemas/crafting-workspace";
import { applyCraftingCloudBundle, workspaceBundle } from "./crafting-cloud-sync";
import {
    editCraftingWorkspace,
    emptyCraftingWorkspace,
    parseCraftingWorkspace,
} from "./crafting-workspace";

export const craftingWorkspaceStorageKey = "poe-boats:crafting-workspace:v1";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export interface CraftingWorkspaceSnapshot {
    state: CraftingWorkspace;
    ready: boolean;
    unsaved: boolean;
    error: string | null;
}

export class CraftingWorkspaceStore {
    private current: CraftingWorkspaceSnapshot = {
        state: emptyCraftingWorkspace(),
        ready: false,
        unsaved: false,
        error: null,
    };
    private readonly initial = this.current;
    private readonly listeners = new Set<() => void>();
    private storage?: Storage;
    private lastSaved: string | null = null;
    private readable = false;

    snapshot = () => this.current;
    serverSnapshot = () => this.initial;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    private emit(next: CraftingWorkspaceSnapshot) {
        this.current = next;
        for (const listener of this.listeners) listener();
    }

    connect(storage: Storage) {
        this.storage = storage;
        this.refresh();
    }

    refresh() {
        try {
            if (!this.storage) throw new Error("Browser storage is unavailable.");
            const raw = this.storage.getItem(craftingWorkspaceStorageKey);
            if (this.current.unsaved && raw !== this.lastSaved)
                throw new Error(
                    "Another browser tab saved changes. Your unsaved draft is preserved; export it before reloading.",
                );
            if (this.current.unsaved) return;
            const state =
                raw === null ? emptyCraftingWorkspace() : parseCraftingWorkspace(JSON.parse(raw));
            this.lastSaved = raw;
            this.readable = true;
            this.emit({ state, ready: true, unsaved: false, error: null });
        } catch (error) {
            this.emit({
                ...this.current,
                ready: true,
                error:
                    error instanceof Error
                        ? error.message
                        : "Saved crafting projects could not be read.",
            });
        }
    }

    edit(command: CraftingWorkspaceCommand) {
        const { state, ids } = editCraftingWorkspace(this.current.state, command);
        this.emit({ ...this.current, state, unsaved: true });
        this.save();
        return ids;
    }

    save() {
        try {
            if (!this.storage || !this.readable)
                throw new Error(
                    "Saved projects could not be read. Export this draft to keep it; existing storage has not been replaced.",
                );
            if (this.storage.getItem(craftingWorkspaceStorageKey) !== this.lastSaved)
                throw new Error(
                    "Another browser tab saved changes. Your unsaved draft is preserved; export it before reloading.",
                );
            const raw = JSON.stringify(this.current.state);
            this.storage.setItem(craftingWorkspaceStorageKey, raw);
            this.lastSaved = raw;
            this.emit({ ...this.current, unsaved: false, error: null });
        } catch (error) {
            this.emit({
                ...this.current,
                unsaved: true,
                error:
                    error instanceof Error
                        ? error.message
                        : "Browser storage could not save this draft.",
            });
        }
    }

    applyCloud(bundle: CraftingBundle, expectedLocal: CraftingBundle) {
        try {
            if (!this.storage || !this.readable || this.current.unsaved)
                throw new Error("Save or export local changes before applying cloud drafts.");
            if (
                JSON.stringify(workspaceBundle(this.current.state)) !==
                JSON.stringify(expectedLocal)
            )
                throw new Error(
                    "Local drafts changed while cloud data was loading. They have been preserved.",
                );
            if (this.storage.getItem(craftingWorkspaceStorageKey) !== this.lastSaved)
                throw new Error(
                    "Another browser tab saved changes. Reload its changes before applying cloud drafts.",
                );
            const state = applyCraftingCloudBundle(this.current.state, bundle);
            const raw = JSON.stringify(state);
            this.storage.setItem(craftingWorkspaceStorageKey, raw);
            this.lastSaved = raw;
            this.emit({ state, ready: true, unsaved: false, error: null });
            return true;
        } catch (error) {
            this.emit({
                ...this.current,
                error:
                    error instanceof Error
                        ? error.message
                        : "Cloud drafts could not be saved locally.",
            });
            return false;
        }
    }

    hasSavedSnapshot() {
        try {
            return Boolean(
                this.readable &&
                    this.storage &&
                    !this.current.unsaved &&
                    this.storage.getItem(craftingWorkspaceStorageKey) === this.lastSaved,
            );
        } catch {
            return false;
        }
    }
}
