import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Button } from "~/components/ui/button";
import { useCraftingWorkspace } from "~/hooks/use-crafting-workspace";
import { CraftingEngine } from "~/lib/crafting-engine";
import { projectFromItem } from "~/lib/crafting-graph-authoring";
import {
    CRAFTING_RULESET_INDEX_URL,
    resolveRuleset,
    validateRulesetIndex,
} from "~/lib/crafting-rulesets";
import { exportCraftingBundle, resolveCraftingBuild } from "~/lib/crafting-workspace";
import type { CraftingCatalog } from "~/schemas/crafting";
import type { CraftingRuleset, CraftingRulesetIndex } from "~/schemas/crafting-rulesets";
import { type CraftingWorkspaceCommand, craftingBundleSchema } from "~/schemas/crafting-workspace";
import { CloudCraftingProjects } from "./cloud-projects";
import { GraphProjectEditor } from "./graph-project-editor";
import { graphControl } from "./graph-query-editor";

export function downloadCraftingJson(value: unknown, name: string) {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name.replace(/[^\p{L}\p{N} _.-]/gu, "_")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CraftingProjects({ catalog }: { catalog: CraftingCatalog }) {
    const workspace = useCraftingWorkspace();
    const [index, setIndex] = useState<CraftingRulesetIndex>();
    const [error, setError] = useState("");
    const [creating, setCreating] = useState(false);
    const [copy, setCopy] = useState<{ buildId: string; memberId: string }>();
    const [name, setName] = useState("New crafting project");
    const [baseId, setBaseId] = useState(
        () =>
            Object.entries(catalog.bases).find(
                ([, base]) => base.item_class === "Ring" && base.rarities.includes("normal"),
            )?.[0] ?? Object.keys(catalog.bases)[0]!,
    );
    const [level, setLevel] = useState(86);
    const engine = useMemo(() => new CraftingEngine(catalog), [catalog]);
    const bases = useMemo(
        () =>
            Object.entries(catalog.bases)
                .filter(([, base]) => base.rarities.includes("normal"))
                .map(([id, base]) => ({ id, label: `${base.name} · ${base.item_class}` })),
        [catalog],
    );
    const gameNumber = catalog.game === "poe1" ? 1 : 2;
    const projects = workspace.state.projects.filter(
        (project) => project.graph.game === catalog.game,
    );
    const builds = workspace.state.builds.filter((build) => build.game === catalog.game);
    const active =
        copy && workspace.state.builds.some((build) => build.id === copy.buildId)
            ? resolveCraftingBuild(workspace.state, copy.buildId).members.find(
                  (entry) => entry.id === copy.memberId,
              )?.project
            : projects.find((project) => project.graph.id === workspace.state.activeProjectId);
    let ruleset: CraftingRuleset | undefined;
    let pinError = "";
    if (active && index) {
        try {
            ruleset = resolveRuleset(index, active.graph.game, active.graph.ruleset);
        } catch (error) {
            pinError = error instanceof Error ? error.message : String(error);
        }
    }
    const currentRuleset = index?.revisions.find(
        (entry) =>
            entry.game === catalog.game &&
            entry.craftingSha256 === catalog.craftingSha256 &&
            entry.manifestSha256 === catalog.manifestSha256 &&
            index.latest.some(
                (latest) =>
                    latest.game === entry.game &&
                    latest.era === entry.era &&
                    latest.revision === entry.revision,
            ),
    );
    function edit(command: CraftingWorkspaceCommand) {
        const ids = workspace.store.edit(command);
        setError("");
        return ids;
    }
    function safely(action: () => void) {
        try {
            action();
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        }
    }
    useEffect(() => {
        const controller = new AbortController();
        fetch(CRAFTING_RULESET_INDEX_URL, { signal: controller.signal, cache: "no-cache" })
            .then(async (response) => {
                if (!response.ok) throw new Error("Crafting revisions are unavailable.");
                setIndex(validateRulesetIndex(await response.json()));
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            });
        return () => controller.abort();
    }, []);
    useEffect(() => {
        if (
            !workspace.ready ||
            projects.some((project) => project.graph.id === workspace.state.activeProjectId)
        )
            return;
        const tab = workspace.state.tabs.find((id) =>
            projects.some((project) => project.graph.id === id),
        );
        if (tab) workspace.store.edit({ action: "openProject", projectId: tab });
    }, [workspace.ready, workspace.state, workspace.store, projects]);
    return (
        <div className="space-y-5">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Path of Exile {gameNumber} · Crafting
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                        Crafting projects
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Connect acquisitions, crafts and recoveries. Compare the cost of the entire
                        process.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link
                        className="self-center px-2 text-sm underline underline-offset-4"
                        to={`/${gameNumber}/crafting`}
                    >
                        Item workbench
                    </Link>
                    <Button
                        disabled={!workspace.ready || !currentRuleset}
                        onClick={() => setCreating(!creating)}
                    >
                        New project
                    </Button>
                    <label className="cursor-pointer rounded-md border border-input px-3 py-2 text-sm">
                        Import JSON
                        <input
                            aria-label="Import crafting projects"
                            type="file"
                            accept="application/json,.json"
                            className="sr-only"
                            onChange={async (event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (!file) return;
                                try {
                                    const bundle = craftingBundleSchema.parse(
                                        JSON.parse(await file.text()),
                                    );
                                    edit({ action: "import", bundle });
                                    setCopy(undefined);
                                } catch (error) {
                                    setError(
                                        error instanceof Error ? error.message : String(error),
                                    );
                                }
                            }}
                        />
                    </label>
                </div>
            </header>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                    {workspace.ready
                        ? workspace.unsaved
                            ? "Unsaved changes in this browser"
                            : "Saved locally in this browser"
                        : "Loading saved drafts…"}
                </span>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                        downloadCraftingJson(
                            {
                                format: 1,
                                projects: workspace.state.projects,
                                builds: workspace.state.builds,
                            },
                            "crafting-backup",
                        )
                    }
                >
                    Export all drafts
                </Button>
            </div>
            <CloudCraftingProjects
                store={workspace.store}
                state={workspace.state}
                ready={workspace.ready}
                game={catalog.game}
            />
            {(error || workspace.error || pinError) && (
                <div
                    role="alert"
                    className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm"
                >
                    {error || workspace.error || pinError}
                    {workspace.unsaved && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="ml-3"
                            onClick={() => workspace.store.save()}
                        >
                            Retry saving
                        </Button>
                    )}
                </div>
            )}
            {creating && (
                <form
                    className="grid items-end gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 md:grid-cols-[1fr_2fr_100px_auto]"
                    onSubmit={(event) => {
                        event.preventDefault();
                        safely(() => {
                            if (!currentRuleset)
                                throw new Error("No published ruleset matches this catalog.");
                            edit({
                                action: "createProject",
                                graph: projectFromItem(
                                    currentRuleset,
                                    engine.createItem(baseId, level),
                                    name,
                                ),
                            });
                            setCreating(false);
                            setCopy(undefined);
                        });
                    }}
                >
                    <label className="text-xs">
                        Project name
                        <input
                            required
                            className={graphControl}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </label>
                    <CatalogPicker
                        id="new-project-base"
                        label="Starting base"
                        options={bases}
                        value={bases.find((base) => base.id === baseId)}
                        onSelect={setBaseId}
                    />
                    <label className="text-xs">
                        Item level
                        <input
                            required
                            className={graphControl}
                            type="number"
                            min="1"
                            max="100"
                            value={level}
                            onChange={(event) => setLevel(Number(event.target.value))}
                        />
                    </label>
                    <Button type="submit">Create project</Button>
                </form>
            )}
            <div
                className="flex gap-1 overflow-x-auto border-b border-border"
                role="tablist"
                aria-label="Crafting project tabs"
            >
                {workspace.state.tabs.flatMap((id) => {
                    const project = projects.find((project) => project.graph.id === id);
                    return project
                        ? [
                              <div
                                  key={id}
                                  className={`flex shrink-0 items-center border-b-2 ${workspace.state.activeProjectId === id && !copy ? "border-primary bg-primary/5" : "border-transparent"}`}
                              >
                                  <button
                                      type="button"
                                      role="tab"
                                      tabIndex={workspace.state.activeProjectId === id ? 0 : -1}
                                      onKeyDown={(event) => {
                                          if (
                                              !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                                                  event.key,
                                              )
                                          )
                                              return;
                                          const tabs = workspace.state.tabs.filter((tab) =>
                                              projects.some((project) => project.graph.id === tab),
                                          );
                                          const current = tabs.indexOf(id);
                                          const next =
                                              event.key === "Home"
                                                  ? tabs[0]
                                                  : event.key === "End"
                                                    ? tabs.at(-1)
                                                    : tabs[
                                                          (current +
                                                              (event.key === "ArrowRight"
                                                                  ? 1
                                                                  : -1) +
                                                              tabs.length) %
                                                              tabs.length
                                                      ];
                                          if (!next) return;
                                          event.preventDefault();
                                          safely(() => {
                                              edit({ action: "openProject", projectId: next });
                                              setCopy(undefined);
                                          });
                                          document.getElementById(`project-tab-${next}`)?.focus();
                                      }}
                                      aria-selected={
                                          workspace.state.activeProjectId === id && !copy
                                      }
                                      aria-controls="crafting-project-panel"
                                      id={`project-tab-${id}`}
                                      className="px-4 py-3 text-sm"
                                      onClick={() =>
                                          safely(() => {
                                              edit({ action: "openProject", projectId: id });
                                              setCopy(undefined);
                                          })
                                      }
                                  >
                                      {project.graph.name}
                                  </button>
                                  <button
                                      type="button"
                                      className="px-2 py-3 text-muted-foreground"
                                      aria-label={`Close ${project.graph.name}`}
                                      onClick={() =>
                                          safely(() =>
                                              edit({ action: "closeProject", projectId: id }),
                                          )
                                      }
                                  >
                                      ×
                                  </button>
                              </div>,
                          ]
                        : [];
                })}
            </div>
            <div
                id="crafting-project-panel"
                role="tabpanel"
                aria-label={active?.graph.name ?? "Crafting project"}
            >
                {copy && (
                    <div className="mb-3 flex items-center gap-3 text-sm">
                        <span>Editing an independent build copy</span>
                        <Button size="sm" variant="outline" onClick={() => setCopy(undefined)}>
                            Return to project tabs
                        </Button>
                    </div>
                )}
                {active && ruleset && index ? (
                    <GraphProjectEditor
                        key={copy ? `${copy.buildId}:${copy.memberId}` : active.graph.id}
                        project={active}
                        currentCatalog={catalog}
                        ruleset={ruleset}
                        index={index}
                        onChange={(graph) => {
                            if (copy)
                                edit({
                                    action: "updateBuildCopy",
                                    ...copy,
                                    graph,
                                    expectedRevision: active.revision,
                                });
                            else
                                edit({
                                    action: "updateProject",
                                    graph,
                                    expectedRevision: active.revision,
                                });
                        }}
                        onCopy={() =>
                            safely(() => {
                                edit({ action: "createProject", graph: active.graph });
                                setCopy(undefined);
                            })
                        }
                        onExport={() =>
                            safely(() =>
                                downloadCraftingJson(
                                    copy
                                        ? { format: 1, projects: [active], builds: [] }
                                        : exportCraftingBundle(workspace.state, {
                                              kind: "project",
                                              id: active.graph.id,
                                          }),
                                    active.graph.name,
                                ),
                            )
                        }
                    />
                ) : (
                    <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
                        <h2 className="text-xl font-medium">
                            {active ? "Loading the project's ruleset…" : "Plan a complete craft"}
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {active
                                ? pinError
                                : "Create an item plan, import a shared process, or send an item from the workbench."}
                        </p>
                    </div>
                )}
            </div>
            <details className="rounded-lg border border-border p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                    Saved item plans & builds
                </summary>
                <div className="mt-4 grid gap-6 lg:grid-cols-2">
                    <section className="space-y-3">
                        <h2 className="text-sm font-semibold">Item plans</h2>
                        {projects.map((project) => (
                            <div
                                key={project.graph.id}
                                className="flex items-center gap-2 border-b border-border py-2"
                            >
                                <span className="min-w-0 flex-1 truncate text-sm">
                                    {project.graph.name}
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        safely(() => {
                                            edit({
                                                action: "openProject",
                                                projectId: project.graph.id,
                                            });
                                            setCopy(undefined);
                                        })
                                    }
                                >
                                    Open
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                        safely(() =>
                                            edit({
                                                action: "deleteProject",
                                                projectId: project.graph.id,
                                            }),
                                        )
                                    }
                                >
                                    Delete
                                </Button>
                            </div>
                        ))}
                    </section>
                    <section className="space-y-4">
                        <form
                            className="flex gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                const form = event.currentTarget;
                                const name = String(new FormData(form).get("buildName"));
                                safely(() => {
                                    edit({ action: "createBuild", name, game: catalog.game });
                                    form.reset();
                                });
                            }}
                        >
                            <input
                                required
                                name="buildName"
                                aria-label="Build name"
                                placeholder="Build name"
                                className={graphControl}
                            />
                            <Button type="submit" variant="outline">
                                Create build
                            </Button>
                        </form>
                        {builds.map((build) => (
                            <div
                                key={build.id}
                                className="space-y-3 rounded border border-border p-3"
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        aria-label="Saved build name"
                                        key={build.name}
                                        className={`${graphControl} flex-1 font-semibold`}
                                        defaultValue={build.name}
                                        onBlur={(event) => {
                                            if (
                                                event.target.value.trim() &&
                                                event.target.value !== build.name
                                            )
                                                safely(() =>
                                                    edit({
                                                        action: "renameBuild",
                                                        buildId: build.id,
                                                        name: event.target.value,
                                                    }),
                                                );
                                        }}
                                    />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                            safely(() => {
                                                edit({ action: "deleteBuild", buildId: build.id });
                                                if (copy?.buildId === build.id) setCopy(undefined);
                                            })
                                        }
                                    >
                                        Delete build
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                            safely(() =>
                                                downloadCraftingJson(
                                                    exportCraftingBundle(workspace.state, {
                                                        kind: "build",
                                                        id: build.id,
                                                    }),
                                                    build.name,
                                                ),
                                            )
                                        }
                                    >
                                        Export build
                                    </Button>
                                </div>
                                {resolveCraftingBuild(workspace.state, build.id).members.map(
                                    (member) => (
                                        <div
                                            key={member.id}
                                            className="flex flex-wrap items-center gap-2 text-xs"
                                        >
                                            <span className="flex-1">
                                                {member.project.graph.name} ·{" "}
                                                {member.kind === "reference"
                                                    ? "Follows project edits"
                                                    : "Independent copy"}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    safely(() => {
                                                        if (member.kind === "reference") {
                                                            edit({
                                                                action: "openProject",
                                                                projectId: member.project.graph.id,
                                                            });
                                                            setCopy(undefined);
                                                        } else
                                                            setCopy({
                                                                buildId: build.id,
                                                                memberId: member.id,
                                                            });
                                                    })
                                                }
                                            >
                                                Edit item
                                            </Button>
                                            {member.kind === "reference" && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() =>
                                                        safely(() =>
                                                            edit({
                                                                action: "detachMember",
                                                                buildId: build.id,
                                                                memberId: member.id,
                                                            }),
                                                        )
                                                    }
                                                >
                                                    Make independent
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                    safely(() => {
                                                        edit({
                                                            action: "removeMember",
                                                            buildId: build.id,
                                                            memberId: member.id,
                                                        });
                                                        if (copy?.memberId === member.id)
                                                            setCopy(undefined);
                                                    })
                                                }
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    ),
                                )}
                                <form
                                    className="flex flex-wrap gap-2"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        const values = new FormData(event.currentTarget);
                                        safely(() =>
                                            edit({
                                                action: "addMember",
                                                buildId: build.id,
                                                projectId: String(values.get("projectId")),
                                                kind:
                                                    values.get("kind") === "value"
                                                        ? "value"
                                                        : "reference",
                                            }),
                                        );
                                    }}
                                >
                                    <select
                                        required
                                        name="projectId"
                                        aria-label={`Item plan for ${build.name}`}
                                        className={graphControl}
                                    >
                                        <option value="">Choose item plan</option>
                                        {projects.map((project) => (
                                            <option key={project.graph.id} value={project.graph.id}>
                                                {project.graph.name}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        name="kind"
                                        aria-label={`Save mode for ${build.name}`}
                                        className={graphControl}
                                    >
                                        <option value="reference">Reference · follow edits</option>
                                        <option value="value">Copy · edit independently</option>
                                    </select>
                                    <Button size="sm" variant="outline" type="submit">
                                        Add item to build
                                    </Button>
                                </form>
                            </div>
                        ))}
                    </section>
                </div>
            </details>
        </div>
    );
}
