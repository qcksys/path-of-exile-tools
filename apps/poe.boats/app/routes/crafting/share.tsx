import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { z } from "zod";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { GraphProjectEditor } from "~/components/crafting/graph-project-editor";
import { downloadCraftingJson } from "~/components/crafting/projects";
import { Button } from "~/components/ui/button";
import { useCraftingWorkspace } from "~/hooks/use-crafting-workspace";
import { craftingCloudRequest } from "~/lib/crafting-cloud-client";
import { workspaceBundle } from "~/lib/crafting-cloud-sync";
import {
    CRAFTING_RULESET_INDEX_URL,
    resolveRuleset,
    validateRulesetIndex,
} from "~/lib/crafting-rulesets";
import {
    editCraftingWorkspace,
    parseCraftingWorkspace,
    resolveCraftingBuild,
} from "~/lib/crafting-workspace";
import { sharedCraftingBundleSchema } from "~/schemas/crafting-cloud";
import type { CraftingRuleset, CraftingRulesetIndex } from "~/schemas/crafting-rulesets";
import type { CraftingWorkspace } from "~/schemas/crafting-workspace";

export function meta() {
    return [{ title: "Shared crafting process · POE.BOATS" }];
}
export default function CraftingSharePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const local = useCraftingWorkspace();
    const [share, setShare] = useState<z.infer<typeof sharedCraftingBundleSchema>>();
    const [preview, setPreview] = useState<CraftingWorkspace>();
    const previewRef = useRef(preview);
    previewRef.current = preview;
    const [index, setIndex] = useState<CraftingRulesetIndex>();
    const [selected, setSelected] = useState("");
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    // biome-ignore lint/correctness/useExhaustiveDependencies: The reload button requests a fresh published process.
    useEffect(() => {
        const controller = new AbortController();
        setShare(undefined);
        setPreview(undefined);
        setError("");
        void Promise.all([
            craftingCloudRequest(
                `/shares/get?id=${encodeURIComponent(id ?? "")}`,
                undefined,
                controller.signal,
            ),
            fetch(CRAFTING_RULESET_INDEX_URL, { signal: controller.signal }).then(
                async (response) => {
                    if (!response.ok) throw new Error("Crafting revisions are unavailable.");
                    return response.json();
                },
            ),
        ])
            .then(([value, revisions]) => {
                if (controller.signal.aborted) return;
                const next = sharedCraftingBundleSchema.parse(value);
                setShare(next);
                setPreview(
                    parseCraftingWorkspace({ ...next.bundle, tabs: [], activeProjectId: null }),
                );
                setIndex(validateRulesetIndex(revisions));
                setSelected("");
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            });
        return () => controller.abort();
    }, [id, attempt]);
    const rows =
        preview && share
            ? share.target.kind === "project"
                ? preview.projects.map((project) => ({
                      id: project.graph.id,
                      kind: "reference" as const,
                      project,
                  }))
                : resolveCraftingBuild(preview, share.target.id).members
            : [];
    const active = rows.find((row) => row.id === selected) ?? rows[0];
    let ruleset: CraftingRuleset | undefined;
    let pinError = "";
    if (active && index) {
        try {
            ruleset = resolveRuleset(
                index,
                active.project.graph.game,
                active.project.graph.ruleset,
            );
        } catch (error) {
            pinError = error instanceof Error ? error.message : String(error);
        }
    }
    const game = active?.project.graph.game ?? preview?.builds[0]?.game ?? "poe1";
    function keepCopy() {
        if (!preview) return;
        try {
            local.store.edit({ action: "import", bundle: workspaceBundle(preview) });
            if (local.store.snapshot().unsaved)
                throw new Error(
                    local.store.snapshot().error ??
                        "Local storage could not save this copy. Export it before leaving.",
                );
            navigate(`/${game === "poe1" ? "1" : "2"}/crafting/projects`);
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        }
    }
    return (
        <div className="min-h-screen flex flex-col">
            <AppHeader section="Shared crafting process" />
            <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-5 px-4 py-6 sm:px-6">
                <Link
                    className="text-sm underline"
                    to={`/${game === "poe1" ? "1" : "2"}/crafting/projects`}
                >
                    Your crafting projects
                </Link>
                {(error || pinError) && <p role="alert">{error || pinError}</p>}
                {!share && !error && <p role="status">Loading shared process…</p>}
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAttempt((value) => value + 1)}
                    >
                        Reload published process
                    </Button>
                    {preview && (
                        <>
                            <Button size="sm" disabled={!local.ready} onClick={keepCopy}>
                                Save independent copy
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    downloadCraftingJson(
                                        workspaceBundle(preview),
                                        "shared-crafting-process",
                                    )
                                }
                            >
                                Export process
                            </Button>
                        </>
                    )}
                </div>
                {share && (
                    <section className="rounded-lg border border-border bg-card p-4 space-y-2">
                        <h1 className="text-2xl font-semibold">
                            {preview?.builds[0]?.name ??
                                preview?.projects[0]?.graph.name ??
                                "Crafting process"}
                        </h1>
                        <p>
                            {share.mode === "frozen"
                                ? "Frozen process snapshot"
                                : "Live saved process"}{" "}
                            · saved workspace revision {share.workspaceRevision}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Market bindings refresh for calculation; manually entered prices remain
                            as supplied. A frozen snapshot preserves the process and crafting rules,
                            not a historical market valuation. Preview edits stay on this page until
                            you save an independent copy.
                        </p>
                    </section>
                )}
                {rows.length > 1 && (
                    <div
                        className="flex flex-wrap gap-2"
                        role="tablist"
                        aria-label="Shared build items"
                    >
                        {rows.map((row) => (
                            <Button
                                key={row.id}
                                role="tab"
                                aria-selected={row.id === active?.id}
                                variant={row.id === active?.id ? "default" : "outline"}
                                onClick={() => setSelected(row.id)}
                            >
                                {row.project.graph.name}
                            </Button>
                        ))}
                    </div>
                )}
                {preview && active && index && ruleset && (
                    <GraphProjectEditor
                        key={`${id}:${active.id}:${attempt}`}
                        project={active.project}
                        ruleset={ruleset}
                        index={index}
                        onChange={(graph) => {
                            try {
                                const next = editCraftingWorkspace(
                                    previewRef.current,
                                    share?.target.kind === "build" && active.kind === "value"
                                        ? {
                                              action: "updateBuildCopy",
                                              buildId: share.target.id,
                                              memberId: active.id,
                                              graph,
                                              expectedRevision: active.project.revision,
                                          }
                                        : {
                                              action: "updateProject",
                                              graph,
                                              expectedRevision: active.project.revision,
                                          },
                                ).state;
                                previewRef.current = next;
                                setPreview(next);
                            } catch (error) {
                                setError(error instanceof Error ? error.message : String(error));
                            }
                        }}
                        onCopy={keepCopy}
                        onExport={() =>
                            downloadCraftingJson(
                                workspaceBundle(preview),
                                "shared-crafting-process",
                            )
                        }
                    />
                )}
            </main>
            <AppFooter />
        </div>
    );
}
