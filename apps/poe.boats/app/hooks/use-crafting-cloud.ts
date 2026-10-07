import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "~/lib/auth.client";
import { craftingCloudRequest } from "~/lib/crafting-cloud-client";
import {
    type CraftingSyncCheckpoint,
    craftingBundleFingerprint,
    craftingSyncCheckpointSchema,
    keepBothCraftingCopies,
    planCraftingSync,
    workspaceBundle,
} from "~/lib/crafting-cloud-sync";
import type { CraftingWorkspaceStore } from "~/lib/crafting-workspace-storage";
import { type CraftingCloudState, craftingCloudStateSchema } from "~/schemas/crafting-cloud";

export const craftingSyncStorageKey = "poe-boats:crafting-sync:v1";
type Status =
    | "loading"
    | "signedOut"
    | "choice"
    | "local"
    | "connect"
    | "conflict"
    | "syncing"
    | "synced"
    | "error";
export function useCraftingCloud(
    store: CraftingWorkspaceStore,
    localVersion: string,
    ready: boolean,
) {
    const session = authClient.useSession();
    const user = session.data?.user;
    const userId = user?.id;
    const [status, setStatus] = useState<Status>("loading");
    const [message, setMessage] = useState("");
    const [remote, setRemote] = useState<CraftingCloudState>();
    const [attempt, setAttempt] = useState(0);
    const pending = useRef<AbortController | null>(null);
    const checkpoint = useRef<CraftingSyncCheckpoint | null>(null);
    const loaded = useRef(false);
    const busy = useRef(false);
    const queued = useRef(false);
    const currentUser = useRef(userId);
    currentUser.current = userId;

    useEffect(() => {
        pending.current?.abort();
        setRemote(undefined);
        setMessage("");
        setStatus(userId ? "loading" : session.isPending ? "loading" : "signedOut");
        return () => pending.current?.abort();
    }, [userId, session.isPending]);

    const run = useCallback(
        async (action: "sync" | "local" | "cloud" | "upload" | "both" = "sync") => {
            if (!ready || !userId) return;
            if (busy.current) {
                queued.current = true;
                return;
            }
            busy.current = true;
            setStatus("syncing");
            const controller = new AbortController();
            pending.current = controller;
            const valid = () => !controller.signal.aborted && currentUser.current === userId;
            try {
                if (!loaded.current) {
                    const raw = localStorage.getItem(craftingSyncStorageKey);
                    try {
                        checkpoint.current = raw
                            ? craftingSyncCheckpointSchema.parse(JSON.parse(raw))
                            : null;
                    } catch {
                        checkpoint.current = null;
                    }
                    loaded.current = true;
                }
                const before = store.snapshot();
                if (action !== "local" && !store.hasSavedSnapshot())
                    throw new Error(
                        "Resolve the local storage error before syncing. Your drafts are preserved.",
                    );
                const local = workspaceBundle(before.state);
                const next = craftingCloudStateSchema.parse(
                    await craftingCloudRequest(
                        action === "local" || action === "cloud"
                            ? "/cloud/preference"
                            : "/cloud/get",
                        action === "local" || action === "cloud"
                            ? { defaultStorage: action }
                            : undefined,
                        controller.signal,
                    ),
                );
                if (!valid()) return;
                setRemote(next);
                setMessage("");
                if (next.defaultStorage !== "cloud") {
                    setStatus(next.defaultStorage === null ? "choice" : "local");
                    return;
                }
                let plan = await planCraftingSync(userId, local, next, checkpoint.current);
                if (!valid()) return;
                if (
                    action === "upload" ||
                    (action === "cloud" &&
                        !next.bundle.projects.length &&
                        !next.bundle.builds.length)
                ) {
                    if (next.bundle.projects.length || next.bundle.builds.length)
                        throw new Error(
                            "The cloud now contains drafts. Refresh and choose Keep both to preserve them.",
                        );
                    plan = { checkpoint: plan.checkpoint, action: "push" };
                }
                let upload = local;
                if (action === "both") {
                    upload = workspaceBundle(keepBothCraftingCopies(before.state, next.bundle));
                    if (!store.applyCloud(upload, local))
                        throw new Error(store.snapshot().error ?? "Local drafts changed.");
                    plan = { checkpoint: plan.checkpoint, action: "push" };
                }
                if (plan.action === "connect" || plan.action === "conflict") {
                    setStatus(plan.action);
                    setMessage(plan.reason);
                    return;
                }
                if (plan.action === "pull" && !store.applyCloud(next.bundle, local))
                    throw new Error(store.snapshot().error ?? "Local drafts changed.");
                let acknowledged = next;
                if (plan.action === "push") {
                    setStatus("syncing");
                    acknowledged = craftingCloudStateSchema.parse(
                        await craftingCloudRequest(
                            "/cloud/save",
                            { bundle: upload, expectedRevision: next.revision },
                            controller.signal,
                        ),
                    );
                    if (!valid()) return;
                    setRemote(acknowledged);
                }
                const saved = {
                    accountId: userId,
                    revision: acknowledged.revision,
                    fingerprint: await craftingBundleFingerprint(acknowledged.bundle),
                };
                if (!valid()) return;
                localStorage.setItem(craftingSyncStorageKey, JSON.stringify(saved));
                checkpoint.current = saved;
                const currentHash = await craftingBundleFingerprint(
                    workspaceBundle(store.snapshot().state),
                );
                if (!valid()) return;
                setStatus(currentHash === saved.fingerprint ? "synced" : "syncing");
                if (currentHash !== saved.fingerprint) queued.current = true;
            } catch (error) {
                if (valid()) {
                    setStatus("error");
                    setMessage(
                        error instanceof Error
                            ? error.message
                            : "Cloud sync failed. Local drafts are preserved.",
                    );
                }
            } finally {
                busy.current = false;
                if (queued.current && !controller.signal.aborted) {
                    queued.current = false;
                    setAttempt((value) => value + 1);
                }
            }
        },
        [ready, store, userId],
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: Local content and explicit retries schedule a fresh sync; run reads the latest store snapshot.
    useEffect(() => {
        if (!ready || !userId) return;
        const timer = window.setTimeout(() => void run(), 600);
        return () => window.clearTimeout(timer);
    }, [run, ready, userId, localVersion, attempt]);
    useEffect(() => {
        const refresh = () => {
            void session.refetch();
            setAttempt((value) => value + 1);
        };
        const timer = window.setInterval(refresh, 60_000);
        window.addEventListener("focus", refresh);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", refresh);
        };
    }, [session.refetch]);
    return { user, status, message, remote, run, checkpoint: checkpoint.current };
}
