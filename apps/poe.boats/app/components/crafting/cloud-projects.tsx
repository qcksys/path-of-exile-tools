import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { z } from "zod";
import { Button } from "~/components/ui/button";
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
    const [shares, setShares] = useState<CraftingShareInfo[]>([]);
    const [error, setError] = useState("");
    const [publishing, setPublishing] = useState(false);
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
    const currentAccount = useRef(accountId);
    currentAccount.current = accountId;
    useEffect(() => {
        setShares([]);
        setError("");
        if (!accountId) return;
        const controller = new AbortController();
        void craftingCloudRequest("/shares/list", undefined, controller.signal)
            .then((result) => {
                if (!controller.signal.aborted) setShares(shareListSchema.parse(result).shares);
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            });
        return () => controller.abort();
    }, [accountId]);
    async function publish() {
        if (!target || !cloud.remote || !cloud.user || cloud.status !== "synced") return;
        setPublishing(true);
        setError("");
        try {
            if (
                (await craftingBundleFingerprint(workspaceBundle(store.snapshot().state))) !==
                cloud.checkpoint?.fingerprint
            )
                throw new Error("Wait for the latest edits to finish syncing before sharing.");
            if (currentAccount.current !== accountId) return;
            const share = craftingShareInfoSchema.parse(
                await craftingCloudRequest("/shares/create", {
                    target: { kind: target.kind, id: target.id },
                    mode,
                    expectedRevision: cloud.remote.revision,
                }),
            );
            if (currentAccount.current === accountId) setShares((current) => [share, ...current]);
        } catch (error) {
            if (currentAccount.current === accountId)
                setError(error instanceof Error ? error.message : "Sharing failed.");
        } finally {
            setPublishing(false);
        }
    }
    async function revoke(id: string) {
        setError("");
        try {
            await craftingCloudRequest("/shares/revoke", { id });
            if (currentAccount.current === accountId)
                setShares((current) => current.filter((entry) => entry.id !== id));
        } catch (error) {
            if (currentAccount.current === accountId)
                setError(error instanceof Error ? error.message : "Revocation failed.");
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
                <p role={cloud.status === "error" ? "alert" : undefined}>{cloud.message}</p>
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
                            <Button size="sm" onClick={() => void cloud.run("cloud")}>
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
                            disabled={cloud.status === "syncing"}
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
                            <label className="text-xs">
                                Share target
                                <select
                                    className={graphControl}
                                    value={target ? `${target.kind}:${target.id}` : ""}
                                    onChange={(event) => setSelected(event.target.value)}
                                >
                                    {!targets.length && (
                                        <option value="">Create a project first</option>
                                    )}
                                    {targets.map((entry) => (
                                        <option
                                            key={`${entry.kind}:${entry.id}`}
                                            value={`${entry.kind}:${entry.id}`}
                                        >
                                            {entry.kind === "build" ? "Build" : "Item"}:{" "}
                                            {entry.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-xs">
                                Link behavior
                                <select
                                    className={graphControl}
                                    value={mode}
                                    onChange={(event) => setMode(event.target.value as typeof mode)}
                                >
                                    <option value="frozen">Frozen snapshot</option>
                                    <option value="live">Live saved process</option>
                                </select>
                            </label>
                            <Button
                                className="self-end"
                                size="sm"
                                disabled={publishing || cloud.status !== "synced" || !target}
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
                            {shares.map((share) => (
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
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                            void navigator.clipboard
                                                .writeText(
                                                    `${location.origin}/crafting/share/${share.id}`,
                                                )
                                                .catch(() =>
                                                    setError(
                                                        "Copy failed. Open the link and copy its address.",
                                                    ),
                                                )
                                        }
                                    >
                                        Copy link
                                    </Button>
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
