import { z } from "zod";
import type { CraftingCloudState } from "../schemas/crafting-cloud";
import {
    type CraftingBundle,
    type CraftingWorkspace,
    craftingBundleSchema,
} from "../schemas/crafting-workspace";
import { editCraftingWorkspace, parseCraftingWorkspace } from "./crafting-workspace";

export const craftingSyncCheckpointSchema = z.strictObject({
    accountId: z.string().min(1),
    revision: z.number().int().nonnegative(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type CraftingSyncCheckpoint = z.infer<typeof craftingSyncCheckpointSchema>;
export function workspaceBundle(state: CraftingWorkspace): CraftingBundle {
    return craftingBundleSchema.parse({
        format: state.format,
        projects: state.projects,
        builds: state.builds,
    });
}
export async function craftingBundleFingerprint(bundle: CraftingBundle) {
    const data = new TextEncoder().encode(JSON.stringify(craftingBundleSchema.parse(bundle)));
    const hash = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
export async function planCraftingSync(
    accountId: string,
    local: CraftingBundle,
    remote: CraftingCloudState,
    checkpoint: CraftingSyncCheckpoint | null,
) {
    const [localHash, remoteHash] = await Promise.all([
        craftingBundleFingerprint(local),
        craftingBundleFingerprint(remote.bundle),
    ]);
    const nextCheckpoint = { accountId, revision: remote.revision, fingerprint: remoteHash };
    if (checkpoint?.accountId === accountId && remote.revision < checkpoint.revision)
        return {
            action: "conflict",
            reason: "The cloud revision moved backwards. Keep both drafts until you choose how to resolve it.",
            checkpoint: nextCheckpoint,
        } as const;
    if (localHash === remoteHash) return { action: "synced", checkpoint: nextCheckpoint } as const;
    if (!checkpoint || checkpoint.accountId !== accountId) {
        if (!local.projects.length && !local.builds.length)
            return { action: "pull", checkpoint: nextCheckpoint } as const;
        return {
            action: "connect",
            reason: "Choose whether to upload these browser drafts or keep both local and cloud copies before connecting this account.",
            checkpoint: nextCheckpoint,
        } as const;
    }
    const localChanged = localHash !== checkpoint.fingerprint;
    const remoteChanged =
        remote.revision !== checkpoint.revision || remoteHash !== checkpoint.fingerprint;
    if (localChanged && remoteChanged)
        return {
            action: "conflict",
            reason: "Both this browser and the cloud have changed. Your local drafts are preserved.",
            checkpoint: nextCheckpoint,
        } as const;
    return { action: localChanged ? "push" : "pull", checkpoint: nextCheckpoint } as const;
}
export function applyCraftingCloudBundle(current: CraftingWorkspace, bundle: CraftingBundle) {
    const ids = bundle.projects.map((project) => project.graph.id);
    const previousIds = new Set(current.projects.map((project) => project.graph.id));
    const tabs = [
        ...current.tabs.filter((id) => ids.includes(id)),
        ...ids.filter((id) => !previousIds.has(id)),
    ];
    const activeProjectId =
        current.activeProjectId && tabs.includes(current.activeProjectId)
            ? current.activeProjectId
            : (tabs[0] ?? null);
    return parseCraftingWorkspace({ ...bundle, tabs, activeProjectId });
}
export function keepBothCraftingCopies(current: CraftingWorkspace, remote: CraftingBundle) {
    return editCraftingWorkspace(current, { action: "import", bundle: remote }).state;
}
