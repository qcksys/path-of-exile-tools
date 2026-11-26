import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { z } from "zod";
import { CopyButton } from "~/components/copy-button";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Label } from "~/components/ui/label";
import { useCraftingCloud } from "~/hooks/use-crafting-cloud";
import { craftingCloudRequest } from "~/lib/crafting-cloud-client";
import { craftingBundleFingerprint, workspaceBundle } from "~/lib/crafting-cloud-sync";
import type { CraftingWorkspaceStore } from "~/lib/crafting-workspace-storage";
import { type CraftingShareInfo, craftingShareInfoSchema } from "~/schemas/crafting-cloud";
import type { CraftingWorkspace } from "~/schemas/crafting-workspace";
import { graphControl } from "./graph-query-editor";

const shareListSchema = z.object({ shares: z.array(craftingShareInfoSchema) });
export function CloudCraftingProjects({
    store,
    state,
    ready,
    game,
}: {
    store: CraftingWorkspaceStore;
    state: CraftingWorkspace;
    ready: boolean;
    game: "poe1" | "poe2";
}) {
    const version = useMemo(() => JSON.stringify(workspaceBundle(state)), [state]);
    const cloud = useCraftingCloud(store, version, ready);
    return (
        <CloudControls
            key={cloud.user?.id ?? ""}
            cloud={cloud}
            store={store}
            state={state}
            game={game}
        />
    );
}

function CloudControls({
    cloud,
    store,
    state,
    game,
}: {
    cloud: ReturnType<typeof useCraftingCloud>;
    store: CraftingWorkspaceStore;
    state: CraftingWorkspace;
    game: "poe1" | "poe2";
}) {
    const [shares, setShares] = useState<CraftingShareInfo[]>([]);
    const [error, setError] = useState("");
    const [publishing, setPublishing] = useState("");
    const [revoking, setRevoking] = useState<string[]>([]);
    const changedShares = useRef(new Set<string>());
    const [selected, setSelected] = useState("");
    const [mode, setMode] = useState<"frozen" | "live">("frozen");
    const targets = [
        ...state.projects
            .filter((entry) => entry.graph.game === game)
            .map((entry) => ({
                kind: "project" as const,
                id: entry.graph.id,
                name: entry.graph.name,
            })),
        ...state.builds
            .filter((entry) => entry.game === game)
            .map((entry) => ({ kind: "build" as const, id: entry.id, name: entry.name })),
    ];
    const target = targets.find((entry) => `${entry.kind}:${entry.id}` === selected) ?? targets[0];
    const accountId = cloud.user?.id;
    const requests = useRef<AbortController | null>(null);
    useEffect(() => {
        if (!accountId) return;
        const controller = new AbortController();
        requests.current = controller;
        void craftingCloudRequest("/shares/list", undefined, controller.signal)
            .then((result) => {
                if (controller.signal.aborted) return;
                const listed = shareListSchema.parse(result).shares;
                setShares((current) => [
                    ...current,
                    ...listed.filter((entry) => !changedShares.current.has(entry.id)),
                ]);
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            });
        return () => controller.abort();
    }, [accountId]);
    async function publish() {
        const signal = requests.current?.signal;
        if (
            !signal ||
            publishing ||
            !target ||
            !cloud.remote ||
            !cloud.user ||
            cloud.status !== "synced"
        )
            return;
        setPublishing(`${mode === "frozen" ? "Frozen" : "Live"} · ${target.name}`);
        setError("");
        try {
            if (
                (await craftingBundleFingerprint(workspaceBundle(store.snapshot().state))) !==
                cloud.checkpoint?.fingerprint
            )
                throw new Error("Wait for the latest edits to finish syncing before sharing.");
            if (signal.aborted) return;
            const share = craftingShareInfoSchema.parse(
                await craftingCloudRequest(
                    "/shares/create",
                    {
                        target: { kind: target.kind, id: target.id },
                        mode,
                        expectedRevision: cloud.remote.revision,
                    },
                    signal,
                ),
            );
            if (signal.aborted) return;
            changedShares.current.add(share.id);
            setShares((current) => [share, ...current.filter((entry) => entry.id !== share.id)]);
        } catch (error) {
            if (!signal.aborted)
                setError(error instanceof Error ? error.message : "Sharing failed.");
        } finally {
            if (!signal.aborted) setPublishing("");
        }
    }
    async function revoke(id: string) {
        const signal = requests.current?.signal;
        if (!signal || revoking.includes(id)) return;
        setRevoking((current) => [...current, id]);
        setError("");
        try {
            await craftingCloudRequest("/shares/revoke", { id }, signal);
            if (signal.aborted) return;
            changedShares.current.add(id);
            setShares((current) => current.filter((entry) => entry.id !== id));
        } catch (error) {
            if (!signal.aborted)
                setError(error instanceof Error ? error.message : "Revocation failed.");
        } finally {
            if (!signal.aborted)
                setRevoking((current) => current.filter((pending) => pending !== id));
        }
    }
    const statusText = {
        loading: "Checking account storage…",
        signedOut: "Local drafts · no account required",
        choice: "Choose your default storage",
        local: "Local storage selected",
        connect: "Connect these browser drafts",
        conflict: "Cloud and local edits need review",
        syncing: "Syncing private drafts…",
        synced: "Private cloud drafts are up to date",
        error: "Cloud sync needs attention",
    }[cloud.status];
    return (
        <section
            aria-label="Cloud crafting storage"
            className="rounded-lg border border-border bg-card p-4 text-sm space-y-3"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium" role="status">
                    {statusText}
                </p>
                {cloud.user ? (
                    <span className="text-xs text-muted-foreground">{cloud.user.name}</span>
                ) : (
                    cloud.status === "signedOut" && (
                        <Link
                            className="underline underline-offset-4"
                            to={`/login?returnTo=/${game === "poe1" ? "1" : "2"}/crafting/projects`}
                        >
                            Sign in for sync and sharing
                        </Link>
                    )
                )}
            </div>
            {cloud.message && (
                <p role={cloud.status === "error" ? "alert" : "status"}>{cloud.message}</p>
            )}
            {cloud.user && (
                <>
                    <p className="text-xs text-muted-foreground">
                        Cloud drafts are private. Publishing a link is a separate action. Your
                        browser keeps a local copy.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {cloud.status !== "local" && (
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={cloud.status === "syncing"}
                                onClick={() => void cloud.run("local")}
                            >
                                Use local storage
                            </Button>
                        )}
                        {(cloud.status === "local" || cloud.status === "choice") && (
                            <Button
                                size="sm"
                                disabled={Boolean(cloud.preference)}
                                onClick={() => void cloud.run("cloud")}
                            >
                                Enable private cloud sync
                            </Button>
                        )}
                        {(cloud.status === "connect" || cloud.status === "conflict") &&
                            (cloud.remote?.bundle.projects.length ||
                            cloud.remote?.bundle.builds.length ? (
                                <Button size="sm" onClick={() => void cloud.run("both")}>
                                    Keep both as separate drafts and sync
                                </Button>
                            ) : (
                                <Button size="sm" onClick={() => void cloud.run("upload")}>
                                    Upload these drafts and sync
                                </Button>
                            ))}
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={cloud.status === "syncing" || Boolean(cloud.preference)}
                            onClick={() => void cloud.run()}
                        >
                            Refresh cloud status
                        </Button>
                    </div>
                    {cloud.status === "conflict" && (
                        <p className="text-xs text-muted-foreground">
                            Keep both creates independent copies of the cloud plans and builds
                            alongside your local edits. Export all drafts first if you want an
                            additional backup.
                        </p>
                    )}
                    <details className="border-t border-border pt-3">
                        <summary className="cursor-pointer font-medium">
                            Share an item plan or build
                        </summary>
                        <p className="my-3 text-xs text-muted-foreground">
                            Anyone with a link can read its selected process. Frozen snapshots
                            preserve the process and crafting revision; live links follow saved
                            changes. Market prices refresh when the process is opened for
                            calculation.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                            <Label className="block text-xs">
                                Share target
                                <FormSelect
                                    className={graphControl}
                                    value={target ? `${target.kind}:${target.id}` : ""}
                                    onValueChange={(selectedValue) => setSelected(selectedValue)}
                                >
                                    {!targets.length && (
                                        <FormSelectItem value="">
                                            Create a project first
                                        </FormSelectItem>
                                    )}
                                    {targets.map((entry) => (
                                        <FormSelectItem
                                            key={`${entry.kind}:${entry.id}`}
                                            value={`${entry.kind}:${entry.id}`}
                                        >
                                            {entry.kind === "build" ? "Build" : "Item"}:{" "}
                                            {entry.name}
                                        </FormSelectItem>
                                    ))}
                                </FormSelect>
                            </Label>
                            <Label className="block text-xs">
                                Link behavior
                                <FormSelect
                                    className={graphControl}
                                    value={mode}
                                    onValueChange={(selectedValue) =>
                                        setMode(selectedValue as typeof mode)
                                    }
                                >
                                    <FormSelectItem value="frozen">Frozen snapshot</FormSelectItem>
                                    <FormSelectItem value="live">Live saved process</FormSelectItem>
                                </FormSelect>
                            </Label>
                            <Button
                                className="self-end"
                                size="sm"
                                disabled={
                                    Boolean(publishing) || cloud.status !== "synced" || !target
                                }
                                onClick={() => void publish()}
                            >
                                Publish share link
                            </Button>
                        </div>
                        {cloud.status !== "synced" && (
                            <p className="mt-2 text-xs text-muted-foreground">
                                Sync the current drafts before publishing.
                            </p>
                        )}
                        {error && (
                            <p role="alert" className="mt-2">
                                {error}
                            </p>
                        )}
                        <ul className="mt-3 space-y-2">
                            {publishing && (
                                <li className="border-t border-border pt-2" role="status">
                                    {publishing} · Publishing…
                                </li>
                            )}
                            {shares
                                .filter((share) => !revoking.includes(share.id))
                                .map((share) => (
                                    <li
                                        key={share.id}
                                        className="flex flex-wrap items-center gap-3 border-t border-border pt-2"
                                    >
                                        <Link
                                            className="min-w-0 flex-1 truncate underline"
                                            to={`/crafting/share/${share.id}`}
                                        >
                                            {share.mode === "frozen" ? "Frozen" : "Live"} ·{" "}
                                            {targets.find(
                                                (entry) =>
                                                    entry.kind === share.target.kind &&
                                                    entry.id === share.target.id,
                                            )?.name ?? share.target.kind}
                                        </Link>
                                        <CopyButton
                                            size="sm"
                                            variant="outline"
                                            getText={() =>
                                                `${location.origin}/crafting/share/${share.id}`
                                            }
                                            onCopyError={() =>
                                                setError(
                                                    "Copy failed. Open the link and copy its address.",
                                                )
                                            }
                                        >
                                            Copy link
                                        </CopyButton>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => void revoke(share.id)}
                                        >
                                            Revoke
                                        </Button>
                                    </li>
                                ))}
                        </ul>
                    </details>
                </>
            )}
        </section>
    );
}
