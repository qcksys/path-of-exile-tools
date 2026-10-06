import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Button } from "~/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { usesAllflame } from "~/lib/crafting-allflame";
import { BenchCraftConflict, CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { craftingFlags, setCraftingFlag } from "~/lib/crafting-flags";
import { craftingInventory } from "~/lib/crafting-inventory";
import { availableOmens } from "~/lib/crafting-omens";
import {
    type CraftingProcess,
    type CraftingResult,
    hasCraftingRequirements,
    validateProject,
} from "~/lib/crafting-simulation";
import { strongbox } from "~/lib/crafting-strongboxes";
import {
    type CraftingCatalog,
    type CraftingItem,
    type CraftingProject,
    craftingProjectSchema,
} from "~/schemas/crafting";
import { AllflameCopies, AllflameEditor } from "./allflame-panel";
import { BlightEditor } from "./blight-editor";
import { ClusterEditor } from "./cluster-editor";
import { BaseDefenceEditor } from "./defence-editor";
import { CraftingDisplay, DisplaySettings, useDisplayPreferences } from "./display-settings";
import { FossilOptimizerPanel } from "./fossil-optimizer";
import { InventoryStorage } from "./inventory-storage";
import { ItemCard } from "./item-card";
import { ItemTextPanel } from "./item-text-panel";
import { LastChanges } from "./last-changes";
import { MemoryEditor } from "./memory-editor";
import { controlClass, MethodPicker } from "./method-picker";
import { ModBrowser } from "./mod-browser";
import { PassiveEditor } from "./passive-editor";
import { ProcessEditor } from "./process-editor";
import { QualityEditor } from "./quality-editor";
import { CraftingResults } from "./results";
import { RevealPanel } from "./reveal-panel";
import { SocketEditor } from "./socket-editor";
import { TargetEditor } from "./target-editor";
import { useItemLibrary } from "./use-item-library";

function initialProject(engine: CraftingEngine): CraftingProject {
    const baseId =
        Object.entries(engine.catalog.bases).find(
            ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
        )?.[0] ?? Object.keys(engine.catalog.bases)[0]!;
    const currency = engine.catalog.crafting.currencies.find(
        (entry) => entry.action === "transmute_to_rare",
    )!;
    return craftingProjectSchema.parse({
        format: 1,
        game: engine.catalog.game,
        patch: engine.catalog.patch,
        item: engine.createItem(baseId),
        method: { kind: "currency", id: currency.id },
        target: { groups: [] },
        steps: [],
        prices: {},
        seed: 42,
        iterations: 10000,
        maxActions: 100,
    });
}
type HistoryEntry = {
    id: number;
    item: CraftingItem;
    spending: Record<string, number>;
    label: string;
    actions: number;
    baseItems: number;
};

export function CraftingWorkbench({
    catalog,
    mode = "calculate",
}: {
    catalog: CraftingCatalog;
    mode?: string;
}) {
    const { preferences, setPreferences, storageError, display } = useDisplayPreferences();
    const engine = useMemo(() => new CraftingEngine(catalog), [catalog]);
    const [project, setProject] = useState(() => initialProject(engine));
    const library = useItemLibrary(engine);
    const inventory = useMemo(
        () => craftingInventory(project.inventory, library.library.inventory),
        [project.inventory, library.library.inventory],
    );
    const nextHistoryId = useRef(1);
    const [history, setHistory] = useState<HistoryEntry[]>([
        {
            id: 0,
            item: project.item,
            spending: {},
            label: "Starting item",
            actions: 0,
            baseItems: 1,
        },
    ]);
    const [cursor, setCursor] = useState(0);
    const [result, setResult] = useState<CraftingResult>();
    const [processRun, setProcessRun] = useState<ReturnType<CraftingProcess["result"]>>();
    const [busy, setBusy] = useState(false);
    const [continuous, setContinuous] = useState(false);
    const [emulationSteps, setEmulationSteps] = useState<number>();
    const [cancelled, setCancelled] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [saved, setSaved] = useState<string[]>([]);
    const [saveName, setSaveName] = useState("My crafting project");
    const [selectedSave, setSelectedSave] = useState("");
    const [autoSave, setAutoSave] = useState(true);
    const [draftReady, setDraftReady] = useState(false);
    const [draftError, setDraftError] = useState("");
    const worker = useRef<Worker | null>(null);
    const file = useRef<HTMLInputElement>(null);
    const storageKey = `poe-boats:crafting:${catalog.game}:${catalog.patch}`;
    const draftKey = `${storageKey}:draft:v1`;
    const gameNumber = catalog.game === "poe1" ? 1 : 2;
    const useProcess = mode === "simulate" || project.useProcess;
    const base = engine.base(project.item);
    const chest = strongbox(catalog, project.item);
    const baseOptions = useMemo(
        () =>
            Object.entries(catalog.bases)
                .map(([id, base]) => {
                    const chest = strongbox(catalog, { baseId: id });
                    return {
                        id,
                        label: chest
                            ? `${base.name} · level ${Math.max(1, chest.minimumLevel)}–${chest.maximumLevel} · ${id.split("/").at(-1)}`
                            : `${base.name} · ${base.item_class}${preferences.itemOrder === "dropLevel" ? ` · drop level ${base.drop_level}` : ""}`,
                    };
                })
                .sort(
                    (a, b) =>
                        (preferences.itemOrder === "dropLevel"
                            ? catalog.bases[a.id]!.drop_level - catalog.bases[b.id]!.drop_level
                            : 0) ||
                        a.label.localeCompare(b.label) ||
                        a.id.localeCompare(b.id),
                ),
        [catalog, preferences.itemOrder],
    );

    useEffect(() => {
        try {
            setSaved(Object.keys(JSON.parse(localStorage.getItem(storageKey) ?? "{}")));
        } catch {
            setNotice("Saved projects could not be read in this browser.");
        }
        return () => {
            worker.current?.terminate();
        };
    }, [storageKey]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(draftKey);
            if (stored !== null) {
                const draft = JSON.parse(stored);
                if (draft === false) {
                    setAutoSave(false);
                } else {
                    const restored = validateProject(catalog, draft);
                    setProject(restored);
                    setHistory([
                        {
                            id: nextHistoryId.current++,
                            item: restored.item,
                            spending: {},
                            label: "Restored draft",
                            actions: 0,
                            baseItems: 1,
                        },
                    ]);
                    setCursor(0);
                    setNotice("Automatic draft restored. History and spending start fresh.");
                }
            }
            setDraftReady(true);
        } catch {
            setAutoSave(false);
            setDraftError(
                "The automatic draft could not be restored. Automatic saving is off; enable it to replace that draft.",
            );
        }
    }, [catalog, draftKey]);

    useEffect(() => {
        if (!draftReady) return;
        try {
            localStorage.setItem(
                draftKey,
                JSON.stringify(autoSave ? craftingProjectSchema.parse(project) : false),
            );
            setDraftError("");
        } catch {
            setDraftError(
                "The automatic draft could not be saved in this browser. Save or export your project before leaving.",
            );
        }
    }, [autoSave, draftReady, draftKey, project]);

    function change(patch: Partial<CraftingProject>) {
        worker.current?.terminate();
        worker.current = null;
        setBusy(false);
        setEmulationSteps(undefined);
        setResult(undefined);
        setProcessRun(undefined);
        setError("");
        setNotice("");
        setProject((current) => ({ ...current, ...patch }));
    }
    function safely(action: () => void) {
        try {
            action();
            setError("");
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        }
    }
    function setItem(
        item: CraftingItem,
        label = "Edit item",
        spending = history[cursor]!.spending,
        actions = history[cursor]!.actions,
        baseItems = history[cursor]!.baseItems,
    ) {
        if (project.item.allflameCopies && item.allflameCopies && item !== project.item)
            throw new Error("Choose an Allflame copy before editing the item.");
        const validated = engine.validateItem(item);
        const next = [
            ...history.slice(0, cursor + 1),
            { id: nextHistoryId.current++, item: validated, label, spending, actions, baseItems },
        ].slice(-101);
        setHistory(next);
        setCursor(next.length - 1);
        change({ item: validated });
    }
    function restore(input: unknown) {
        const validated = validateProject(catalog, input);
        change(validated);
        setHistory([
            {
                id: nextHistoryId.current++,
                item: validated.item,
                spending: {},
                label: "Loaded item",
                actions: 0,
                baseItems: 1,
            },
        ]);
        setCursor(0);
    }
    function clearHistory() {
        change({});
        setHistory([
            {
                id: nextHistoryId.current++,
                item: project.item,
                spending: {},
                label: "History cleared",
                actions: 0,
                baseItems: 1,
            },
        ]);
        setCursor(0);
        setNotice(
            "History and currency spending cleared. The current item is the new starting item.",
        );
    }
    function apply() {
        safely(() => {
            const current = history[cursor]!;
            let conflict: BenchCraftConflict | undefined;
            const applied = (() => {
                try {
                    return (
                        usesAllflame(project.method)
                            ? engine.prepareAllflame.bind(engine)
                            : engine.apply.bind(engine)
                    )(project.item, project.method, seededRandom(project.seed + current.actions));
                } catch (error) {
                    if (!(error instanceof BenchCraftConflict) || !error.cost.length) throw error;
                    conflict = error;
                    return { item: error.item, cost: error.cost };
                }
            })();
            const spending = { ...current.spending };
            for (const cost of applied.item.allflameCopies ? [] : applied.cost)
                spending[cost.id] = (spending[cost.id] ?? 0) + cost.amount;
            setItem(
                applied.item,
                engine.methodName(project.method),
                spending,
                current.actions + (applied.item.allflameCopies ? 0 : 1),
            );
            if (conflict) throw conflict;
        });
    }
    function run(type: "calculate" | "sample" | "process" | "emulate-process") {
        safely(() => {
            const validated = validateProject(catalog, project);
            if (type !== "emulate-process" && !hasCraftingRequirements(validated.target))
                throw new Error("Choose at least one target modifier or item requirement.");
            worker.current?.terminate();
            const instance = new Worker(new URL("../../lib/crafting.worker.ts", import.meta.url), {
                type: "module",
            });
            worker.current = instance;
            setBusy(true);
            setContinuous(
                type !== "calculate" &&
                    type !== "emulate-process" &&
                    validated.simulationLimit?.kind === "manual",
            );
            setEmulationSteps(type === "emulate-process" ? 0 : undefined);
            setCancelled(false);
            setResult(undefined);
            setProcessRun(undefined);
            instance.onmessage = (event) => {
                if (worker.current !== instance) return;
                if (event.data.type === "emulating") {
                    setEmulationSteps(event.data.result.steps);
                    setProcessRun(event.data.result);
                    return;
                }
                if (event.data.type === "emulated") {
                    const applied = event.data.result;
                    const current = history[cursor]!;
                    const spending = { ...current.spending };
                    for (const [id, amount] of Object.entries(
                        applied.spending as Record<string, number>,
                    ))
                        spending[id] = (spending[id] ?? 0) + amount;
                    setItem(
                        applied.item,
                        "Applied crafting process",
                        spending,
                        current.actions + applied.actions,
                        current.baseItems + applied.baseItems - 1,
                    );
                    setProcessRun(applied);
                    setNotice(
                        applied.error
                            ? `Process stopped: ${applied.error} Completed crafts and their costs were retained.`
                            : applied.timeout
                              ? "Process reached the step limit. Completed crafts and their costs were retained."
                              : applied.success
                                ? "Process finished successfully."
                                : "Process finished without meeting the success requirements.",
                    );
                } else if (event.data.type === "error") {
                    setError(event.data.message);
                    setProcessRun(undefined);
                    setEmulationSteps(undefined);
                } else setResult(event.data.result);
                if (event.data.type !== "progress") {
                    setBusy(false);
                    instance.terminate();
                    worker.current = null;
                }
            };
            instance.onerror = (event) => {
                if (worker.current !== instance) return;
                setError(event.message || "The crafting worker could not start.");
                setProcessRun(undefined);
                setEmulationSteps(undefined);
                setBusy(false);
                instance.terminate();
                worker.current = null;
            };
            instance.postMessage({
                type,
                catalog,
                project: {
                    ...validated,
                    useProcess,
                    seed:
                        type === "emulate-process"
                            ? (validated.seed + history[cursor]!.actions) >>> 0
                            : validated.seed,
                },
            });
        });
    }
    const costs = useMemo(() => {
        const all = [project.method, ...project.steps.map((step) => step.method)].flatMap(
            (method) => {
                if (!method) return [];
                try {
                    const bench =
                        method.kind === "bench" &&
                        catalog.crafting.bench.find((entry) => entry.id === method.id);
                    return [
                        ...engine.costs(method),
                        ...(bench && (bench.mod || bench.enchantment)
                            ? engine.benchRemovalCost(project.item, Boolean(bench.enchantment))
                            : []),
                    ];
                } catch {
                    return [];
                }
            },
        );
        if (project.item.reveal)
            for (const omen of availableOmens(catalog, { kind: "reveal", preferred: [] }))
                all.push({ id: omen.id, name: omen.name, amount: 1 });
        for (const id of Object.keys(history[cursor]!.spending)) {
            if (!all.some((entry) => entry.id === id))
                all.push({ id, name: engine.costName(id), amount: 1 });
        }
        return [...new Map(all.map((entry) => [entry.id, entry])).values()];
    }, [engine, catalog, project.method, project.steps, project.item, history, cursor]);

    return (
        <CraftingDisplay value={display}>
            <div
                className={preferences.compact ? "space-y-3" : "space-y-6"}
                data-compact={preferences.compact}
            >
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            Path of Exile {gameNumber} · Crafting
                        </p>
                        <h1 className="text-3xl font-semibold tracking-tight">
                            Crafting workbench
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Explore modifiers, measure your chances, and test a crafting process.
                        </p>
                    </div>
                    <span className="rounded-full border border-border bg-muted/40 px-3 py-1 font-mono text-xs">
                        Client build {catalog.patch}
                    </span>
                </div>
                <nav aria-label="Crafting modes" className="flex gap-1 border-b border-border">
                    {(
                        [
                            ["calculate", "Calculate"],
                            ["simulate", "Simulate"],
                            ["emulate", "Emulate"],
                        ] as const
                    ).map(([value, label]) => (
                        <Link
                            key={value}
                            to={`/${gameNumber}/crafting/${value}`}
                            aria-current={mode === value ? "page" : undefined}
                            className={`border-b-2 px-5 py-3 text-sm font-medium ${mode === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
                <DisplaySettings
                    value={preferences}
                    onChange={setPreferences}
                    storageError={storageError}
                />
                {catalog.game === "poe2" ? (
                    <p className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                        PoE 2 uses the weights extracted from this client build. These are not
                        empirically measured server weights, so calculated odds may differ from the
                        game.
                    </p>
                ) : null}
                {error ? (
                    <div
                        role="alert"
                        className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                    >
                        {error}
                    </div>
                ) : null}
                {notice ? (
                    <p role="status" className="text-sm text-muted-foreground">
                        {notice}
                    </p>
                ) : null}
                {draftError ? (
                    <p role="alert" className="text-sm text-destructive">
                        {draftError}
                    </p>
                ) : null}
                <div
                    className={`grid grid-cols-1 items-start lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(360px,1fr)_340px] ${preferences.compact ? "gap-3 [&>div]:space-y-3 [&>div>section]:p-3 [&>div>details]:p-3" : "gap-5"}`}
                >
                    <div className="min-w-0 space-y-4">
                        <section
                            className="space-y-4 rounded-lg border border-border bg-card p-4"
                            aria-label="Item settings"
                        >
                            <h2 className="font-semibold">Starting item</h2>
                            <CatalogPicker
                                id="crafting-base"
                                label="Item base"
                                options={baseOptions}
                                value={baseOptions.find(
                                    (entry) => entry.id === project.item.baseId,
                                )}
                                onSelect={(baseId) =>
                                    safely(() => {
                                        const next = initialProject(engine);
                                        restore({
                                            ...next,
                                            item: engine.createItem(baseId, project.item.level),
                                            prices: project.prices,
                                            seed: project.seed,
                                        });
                                    })
                                }
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <label className="space-y-1 text-xs">
                                    Item level
                                    <input
                                        className={controlClass}
                                        type="number"
                                        min={Math.max(1, chest?.minimumLevel ?? 1)}
                                        max={chest?.maximumLevel ?? 100}
                                        value={project.item.level}
                                        onChange={(event) =>
                                            safely(() =>
                                                setItem({
                                                    ...project.item,
                                                    level: Number(event.target.value),
                                                }),
                                            )
                                        }
                                    />
                                </label>
                                <label className="space-y-1 text-xs">
                                    Rarity
                                    <select
                                        className={controlClass}
                                        value={project.item.rarity}
                                        onChange={(event) =>
                                            safely(() =>
                                                setItem({
                                                    ...project.item,
                                                    rarity: event.target
                                                        .value as CraftingItem["rarity"],
                                                }),
                                            )
                                        }
                                    >
                                        {base.rarities.map((rarity) => (
                                            <option key={rarity} value={rarity}>
                                                {rarity}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            {chest ? (
                                <p
                                    className="text-xs text-muted-foreground"
                                    role="note"
                                    aria-label="Strongbox crafting scope"
                                >
                                    Models ordinary Strongbox affixes. Encounter properties and
                                    dropped contents are separate from the affix calculation.
                                    Special encounters and Atlas changes are not modeled.
                                </p>
                            ) : null}
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={Boolean(project.item.unidentified)}
                                    disabled={!engine.identificationSupported(project.item)}
                                    onChange={(event) =>
                                        safely(() => {
                                            setItem({
                                                ...project.item,
                                                unidentified: event.target.checked
                                                    ? true
                                                    : undefined,
                                            });
                                            if (event.target.checked) {
                                                const wisdom = catalog.crafting.currencies.find(
                                                    (entry) => entry.action === "identify",
                                                )!;
                                                change({
                                                    method: { kind: "currency", id: wisdom.id },
                                                });
                                            }
                                        })
                                    }
                                />
                                Unidentified starting item
                            </label>
                            <p className="text-xs text-muted-foreground">
                                Choose magic or rare equipment with no explicit modifiers to model
                                identification. Known modifiers must be removed first. Hidden
                                special drop modifiers are not modeled.
                            </p>
                            <fieldset
                                className="space-y-2"
                                disabled={Boolean(
                                    project.item.destroyed || project.item.allflameCopies,
                                )}
                            >
                                <legend className="text-xs">Item flags</legend>
                                <div className="flex flex-wrap gap-3">
                                    {craftingFlags(catalog.game).map(({ key, label }) => (
                                        <label
                                            key={key}
                                            className="flex items-center gap-2 text-xs"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={Boolean(project.item[key])}
                                                onChange={(event) =>
                                                    safely(() =>
                                                        setItem(
                                                            setCraftingFlag(
                                                                engine,
                                                                project.item,
                                                                key,
                                                                event.target.checked,
                                                            ),
                                                            `Edit ${label.toLowerCase()} state`,
                                                        ),
                                                    )
                                                }
                                            />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {catalog.game === "poe1"
                                        ? "Corrupted and Mirrored replace one another."
                                        : "Corrupted, Mirrored and Sanctified replace one another. Clearing corruption or Sanctification removes its value multipliers."}{" "}
                                    Corruption-only outcomes must be removed before clearing
                                    Corrupted.
                                </p>
                            </fieldset>
                            <ClusterEditor
                                engine={engine}
                                item={project.item}
                                onChange={(item) =>
                                    safely(() => setItem(item, "Edit Cluster Jewel"))
                                }
                            />
                            <QualityEditor
                                engine={engine}
                                item={project.item}
                                onChange={(item) => safely(() => setItem(item, "Edit quality"))}
                            />
                            <BaseDefenceEditor
                                engine={engine}
                                item={project.item}
                                onChange={(item) =>
                                    safely(() => setItem(item, "Edit base defences"))
                                }
                            />
                            <MemoryEditor
                                engine={engine}
                                item={project.item}
                                onChange={(item) =>
                                    safely(() => setItem(item, "Edit memory state"))
                                }
                            />
                            <AllflameEditor
                                engine={engine}
                                item={project.item}
                                onChange={(item) =>
                                    safely(() => setItem(item, "Edit intangibility"))
                                }
                            />
                            <BlightEditor
                                engine={engine}
                                item={project.item}
                                onChange={(item) => safely(() => setItem(item, "Edit Blight map"))}
                            />
                            <SocketEditor
                                engine={engine}
                                item={project.item}
                                onChange={(item) => safely(() => setItem(item, "Edit sockets"))}
                            />
                            {catalog.crafting.influences.some(
                                (entry) => entry.itemClass === base.item_class,
                            ) ? (
                                <details>
                                    <summary className="cursor-pointer text-xs text-muted-foreground">
                                        Influences
                                    </summary>
                                    {engine.hasFixedInfluences(project.item) ? (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            All influences are fixed by this item's implicit
                                            modifier.
                                        </p>
                                    ) : null}
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        {catalog.crafting.influences
                                            .filter((entry) => entry.itemClass === base.item_class)
                                            .map((influence) => (
                                                <label
                                                    key={influence.influence}
                                                    className="flex items-center gap-2 text-xs"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        disabled={engine.hasFixedInfluences(
                                                            project.item,
                                                        )}
                                                        checked={engine
                                                            .effectiveInfluences(project.item)
                                                            .includes(influence.influence)}
                                                        onChange={(event) =>
                                                            safely(() =>
                                                                setItem({
                                                                    ...project.item,
                                                                    influences: event.target.checked
                                                                        ? [
                                                                              ...project.item
                                                                                  .influences,
                                                                              influence.influence,
                                                                          ]
                                                                        : project.item.influences.filter(
                                                                              (entry) =>
                                                                                  entry !==
                                                                                  influence.influence,
                                                                          ),
                                                                }),
                                                            )
                                                        }
                                                    />
                                                    {influence.name}
                                                </label>
                                            ))}
                                    </div>
                                </details>
                            ) : null}
                        </section>
                        <RevealPanel
                            engine={engine}
                            item={project.item}
                            onSelect={(index) =>
                                safely(() =>
                                    setItem(
                                        engine.selectUnrevealed(project.item, index),
                                        "Select unrevealed affix",
                                    ),
                                )
                            }
                            onReveal={(omens) =>
                                safely(() => {
                                    const current = history[cursor]!;
                                    const revealed = engine.prepareReveal(
                                        project.item,
                                        { kind: "reveal", preferred: [], omens },
                                        seededRandom(project.seed + current.actions),
                                    );
                                    const spending = { ...current.spending };
                                    for (const cost of revealed.cost)
                                        spending[cost.id] = (spending[cost.id] ?? 0) + cost.amount;
                                    setItem(
                                        revealed.item,
                                        "Revealed choices",
                                        spending,
                                        current.actions + 1,
                                    );
                                })
                            }
                            onReroll={() =>
                                safely(() =>
                                    setItem(
                                        engine.rerollReveal(
                                            project.item,
                                            seededRandom(project.seed + history[cursor]!.actions),
                                        ),
                                        "Rerolled reveal choices",
                                        history[cursor]!.spending,
                                        history[cursor]!.actions + 1,
                                    ),
                                )
                            }
                            onChoose={(id) =>
                                safely(() =>
                                    setItem(
                                        engine.chooseRevealed(
                                            project.item,
                                            id,
                                            seededRandom(project.seed + history[cursor]!.actions),
                                        ),
                                        "Chose revealed modifier",
                                        history[cursor]!.spending,
                                        history[cursor]!.actions + 1,
                                    ),
                                )
                            }
                        />
                        <AllflameCopies
                            engine={engine}
                            item={project.item}
                            onChoose={(index) =>
                                safely(() => {
                                    const selected = engine.chooseAllflame(project.item, index);
                                    const current = history[cursor]!;
                                    const spending = { ...current.spending };
                                    for (const cost of project.item.allflameCost!)
                                        spending[cost.id] = (spending[cost.id] ?? 0) + cost.amount;
                                    setItem(
                                        selected,
                                        `Kept Allflame copy ${index + 1}`,
                                        spending,
                                        current.actions + 1,
                                    );
                                })
                            }
                        />
                        <PassiveEditor
                            engine={engine}
                            item={project.item}
                            onSelect={(id) =>
                                safely(() =>
                                    setItem(
                                        engine.setStartingPassive(project.item, id),
                                        "Set allocated passive",
                                    ),
                                )
                            }
                        />
                        <ItemCard
                            engine={engine}
                            item={project.item}
                            onChange={
                                project.item.destroyed
                                    ? undefined
                                    : (item) => safely(() => setItem(item))
                            }
                        />
                        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
                            {mode !== "simulate" ? (
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={project.useProcess}
                                        onChange={(event) =>
                                            change({ useProcess: event.target.checked })
                                        }
                                    />
                                    Combine crafting steps
                                </label>
                            ) : null}
                            <MethodPicker
                                engine={engine}
                                item={project.item}
                                value={project.method}
                                inventory={inventory}
                                onChange={(method) => change({ method })}
                            />
                            <Button
                                className="w-full"
                                disabled={
                                    busy ||
                                    (project.item.destroyed &&
                                        !useProcess &&
                                        !["generate", "genesis"].includes(project.method.kind))
                                }
                                onClick={useProcess ? () => run("emulate-process") : apply}
                            >
                                {useProcess ? "Apply process" : "Apply craft"}
                            </Button>
                            <div className="flex gap-2">
                                <Button
                                    className="flex-1"
                                    variant="outline"
                                    size="sm"
                                    disabled={cursor === 0}
                                    onClick={() => {
                                        setCursor(cursor - 1);
                                        change({ item: history[cursor - 1]!.item });
                                    }}
                                >
                                    Undo
                                </Button>
                                <Button
                                    className="flex-1"
                                    variant="outline"
                                    size="sm"
                                    disabled={cursor === history.length - 1}
                                    onClick={() => {
                                        setCursor(cursor + 1);
                                        change({ item: history[cursor + 1]!.item });
                                    }}
                                >
                                    Redo
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        safely(() =>
                                            setItem(
                                                engine.createItem(
                                                    project.item.baseId,
                                                    project.item.level,
                                                ),
                                                "Reset item",
                                                {},
                                                0,
                                                1,
                                            ),
                                        )
                                    }
                                >
                                    Reset
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {history[cursor]!.label} · {history[cursor]!.actions} crafts
                            </p>
                            <details className="rounded-md border border-border p-3">
                                <summary className="cursor-pointer text-sm">
                                    Actions history
                                </summary>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    The latest 100 changes and their starting state are kept for
                                    this session. Use Undo and Redo to change the current state.
                                </p>
                                <ol
                                    aria-label="Item history"
                                    className="mt-3 max-h-72 list-decimal space-y-3 overflow-y-auto pl-6 text-xs"
                                    reversed
                                >
                                    {history
                                        .map((entry, index) => (
                                            <li
                                                key={entry.id}
                                                aria-current={index === cursor ? "step" : undefined}
                                                className={
                                                    index > cursor
                                                        ? "text-muted-foreground"
                                                        : undefined
                                                }
                                            >
                                                <p>{entry.label}</p>
                                                <p className="text-muted-foreground">
                                                    {entry.actions} crafts
                                                    {index === cursor
                                                        ? " · Current"
                                                        : index > cursor
                                                          ? " · Undone"
                                                          : ""}
                                                </p>
                                            </li>
                                        ))
                                        .reverse()}
                                </ol>
                            </details>
                            <Button
                                className="w-full"
                                variant="ghost"
                                size="sm"
                                disabled={history.length === 1}
                                onClick={clearHistory}
                                title="Keep the current item and clear undo/redo, craft counts and currency spending."
                            >
                                Clear history and spending
                            </Button>
                        </section>
                        {cursor > 0 ? (
                            <LastChanges
                                engine={engine}
                                before={history[cursor - 1]!.item}
                                after={history[cursor]!.item}
                            />
                        ) : null}
                        <InventoryStorage
                            engine={engine}
                            project={project}
                            library={library}
                            onChange={(inventory, inventoryTabs) =>
                                change({ inventory, inventoryTabs })
                            }
                            onLoad={(item, name) => safely(() => setItem(item, `Loaded ${name}`))}
                        />
                        {Object.keys(history[cursor]!.spending).length ||
                        project.baseCost !== undefined ? (
                            <details className="rounded-lg border border-border p-4">
                                <summary className="cursor-pointer text-sm">
                                    Emulator spending
                                </summary>
                                <dl className="mt-3 space-y-2 text-xs">
                                    {project.baseCost !== undefined ? (
                                        <>
                                            <div className="flex justify-between gap-2">
                                                <dt>Starting items used</dt>
                                                <dd className="font-mono">
                                                    {history[cursor]!.baseItems}
                                                </dd>
                                            </div>
                                            <div className="flex justify-between gap-2">
                                                <dt>Starting item spending (chaos)</dt>
                                                <dd className="font-mono">
                                                    {(
                                                        history[cursor]!.baseItems *
                                                        project.baseCost
                                                    ).toLocaleString(undefined, {
                                                        maximumSignificantDigits: 6,
                                                    })}
                                                </dd>
                                            </div>
                                        </>
                                    ) : null}
                                    {Object.entries(history[cursor]!.spending).map(
                                        ([id, amount]) => (
                                            <div key={id} className="flex justify-between gap-2">
                                                <dt>{engine.costName(id)}</dt>
                                                <dd className="font-mono">
                                                    {amount.toLocaleString()}
                                                </dd>
                                            </div>
                                        ),
                                    )}
                                </dl>
                            </details>
                        ) : null}
                    </div>
                    <div className="min-w-0 space-y-5">
                        {useProcess ? (
                            <ProcessEditor
                                engine={engine}
                                project={project}
                                inventory={inventory}
                                routes={processRun?.routes ?? result?.routes}
                                attempts={
                                    processRun || result?.kind === "exact-process"
                                        ? 1
                                        : (result?.trials ?? 1)
                                }
                                routeLabel={
                                    processRun
                                        ? "Emulated process"
                                        : result?.kind === "exact-process"
                                          ? "Exact within the model"
                                          : `${result?.trials ?? 0} sampled attempts`
                                }
                                activeStep={busy ? processRun?.nextStep : undefined}
                                onChange={(steps, presentationOnly) =>
                                    presentationOnly
                                        ? setProject((current) => ({ ...current, steps }))
                                        : change({ steps })
                                }
                            />
                        ) : null}
                        <ModBrowser
                            layout={preferences.modifierLayout}
                            filterEffect={preferences.filterEffect}
                            showTagFilter={preferences.showTagFilter}
                            showWeightPercentages={preferences.showWeightPercentages}
                            engine={engine}
                            item={project.item}
                            method={project.method}
                            target={project.target}
                            onTarget={(target) => change({ target })}
                            onAdd={(id, source) =>
                                safely(() => {
                                    setItem(
                                        engine.addStartingMod(
                                            project.item,
                                            id,
                                            seededRandom(project.seed),
                                            source,
                                        ),
                                    );
                                })
                            }
                        />
                    </div>
                    <div className="min-w-0 space-y-4 lg:col-span-2 xl:col-span-1">
                        <TargetEditor
                            engine={engine}
                            item={project.item}
                            target={project.target}
                            onChange={(target) => change({ target })}
                        />
                        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
                            <h2 className="font-semibold">
                                {mode === "simulate" ? "Run process" : "Calculate chances"}
                            </h2>
                            {!useProcess ? (
                                <div className="space-y-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            change({
                                                useProcess: true,
                                                steps: [
                                                    {
                                                        id: `step-${crypto.randomUUID()}`,
                                                        method: structuredClone(project.method),
                                                        condition: structuredClone(project.target),
                                                        onSuccess: "success",
                                                        onFailure: "restart",
                                                    },
                                                ],
                                            });
                                            setNotice(
                                                "Process created from the calculator. Edit its step and routes in Crafting process.",
                                            );
                                        }}
                                    >
                                        {project.steps.length
                                            ? "Replace process from calculator"
                                            : "Create process from calculator"}
                                    </Button>
                                    <p className="text-xs text-muted-foreground">
                                        Copies the selected method and requirements into one step. A
                                        miss restarts with the current item, up to the process step
                                        limit. Item cost applies again on each restart.
                                        {project.steps.length
                                            ? " Replaces the existing process."
                                            : ""}
                                    </p>
                                </div>
                            ) : null}
                            <div className="grid grid-cols-2 gap-3">
                                {mode !== "simulate" ||
                                project.simulationLimit?.kind !== "manual" ? (
                                    <label className="space-y-1 text-xs">
                                        {project.simulationLimit?.kind === "manual"
                                            ? "Calculator trials"
                                            : project.simulationLimit
                                              ? "Maximum trials"
                                              : "Trials"}
                                        <input
                                            className={controlClass}
                                            type="number"
                                            min={1}
                                            max={1000000}
                                            value={project.iterations}
                                            onChange={(event) =>
                                                change({ iterations: Number(event.target.value) })
                                            }
                                        />
                                    </label>
                                ) : null}
                                <label className="space-y-1 text-xs">
                                    Random seed
                                    <input
                                        className={controlClass}
                                        type="number"
                                        min={0}
                                        max={4294967295}
                                        value={project.seed}
                                        onChange={(event) =>
                                            change({ seed: Number(event.target.value) })
                                        }
                                    />
                                </label>
                            </div>
                            <label className="block space-y-1 text-xs">
                                Stop simulation after
                                <select
                                    className={controlClass}
                                    value={project.simulationLimit?.kind ?? "trials"}
                                    onChange={(event) => {
                                        const kind = event.target.value;
                                        change({
                                            simulationLimit:
                                                kind === "successes" || kind === "actions"
                                                    ? {
                                                          kind,
                                                          count:
                                                              project.simulationLimit &&
                                                              project.simulationLimit.kind !==
                                                                  "manual"
                                                                  ? project.simulationLimit.count
                                                                  : 100,
                                                      }
                                                    : kind === "manual"
                                                      ? { kind }
                                                      : undefined,
                                        });
                                    }}
                                >
                                    <option value="trials">Trial count</option>
                                    <option value="successes">Successful items</option>
                                    <option value="actions">Simulation actions</option>
                                    <option value="manual">Until stopped</option>
                                </select>
                            </label>
                            {project.simulationLimit?.kind === "manual" ? (
                                <p className="text-xs text-muted-foreground">
                                    Runs until you stop it, with no trial target. Each process trial
                                    keeps its step limit, and stored outcomes keep their storage
                                    limit.
                                    {mode !== "simulate"
                                        ? " Calculator trials apply only to Calculate odds."
                                        : null}
                                </p>
                            ) : project.simulationLimit ? (
                                <>
                                    <label className="block space-y-1 text-xs">
                                        {project.simulationLimit.kind === "successes"
                                            ? "Successful item target"
                                            : "Simulation action limit"}
                                        <input
                                            className={controlClass}
                                            type="number"
                                            min={1}
                                            max={1000000}
                                            value={project.simulationLimit.count}
                                            onChange={(event) =>
                                                change({
                                                    simulationLimit: {
                                                        kind:
                                                            project.simulationLimit?.kind ===
                                                            "successes"
                                                                ? "successes"
                                                                : "actions",
                                                        count: Number(event.target.value),
                                                    },
                                                })
                                            }
                                        />
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                        Stops at this target or the maximum trial count. Every
                                        process step counts as one action, including condition
                                        checks. An unfinished trial is reported separately. These
                                        limits apply to simulation; Calculate odds uses the full
                                        trial count when sampling is needed.
                                    </p>
                                </>
                            ) : null}
                            {useProcess ? (
                                <label className="block space-y-1 text-xs">
                                    Maximum steps per trial
                                    <input
                                        className={controlClass}
                                        type="number"
                                        min={1}
                                        max={10000}
                                        value={project.maxActions}
                                        onChange={(event) =>
                                            change({ maxActions: Number(event.target.value) })
                                        }
                                    />
                                </label>
                            ) : null}
                            <label className="block space-y-1 text-xs">
                                Store outcomes
                                <select
                                    className={controlClass}
                                    value={project.sampleStorage?.mode ?? "preview"}
                                    onChange={(event) => {
                                        const mode = event.target.value;
                                        change({
                                            sampleStorage:
                                                mode === "all" ||
                                                mode === "successes" ||
                                                mode === "none"
                                                    ? {
                                                          mode,
                                                          limit:
                                                              project.sampleStorage?.limit ?? 100,
                                                      }
                                                    : undefined,
                                        });
                                    }}
                                >
                                    <option value="preview">
                                        Preview: 10 outcomes, including first success
                                    </option>
                                    <option value="successes">Successful items</option>
                                    <option value="all">All completed trials</option>
                                    <option value="none">None</option>
                                </select>
                            </label>
                            {project.sampleStorage && project.sampleStorage.mode !== "none" ? (
                                <label className="block space-y-1 text-xs">
                                    Maximum stored outcomes
                                    <input
                                        className={controlClass}
                                        type="number"
                                        min={1}
                                        max={1000}
                                        value={project.sampleStorage.limit}
                                        onChange={(event) =>
                                            change({
                                                sampleStorage: {
                                                    mode: project.sampleStorage!.mode,
                                                    limit: Number(event.target.value),
                                                },
                                            })
                                        }
                                    />
                                </label>
                            ) : null}
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={project.successDistribution ?? false}
                                    onChange={(event) =>
                                        change({ successDistribution: event.target.checked })
                                    }
                                />
                                Successful item affix distribution
                            </label>
                            <p className="text-xs text-muted-foreground">
                                Statistics include every completed trial, regardless of how many
                                items are stored. Distribution tables group tiers across all
                                successful items.
                            </p>
                            {busy ? (
                                <>
                                    <Button
                                        className="w-full"
                                        variant="outline"
                                        onClick={() => {
                                            worker.current?.terminate();
                                            worker.current = null;
                                            setBusy(false);
                                            setProcessRun(undefined);
                                            setCancelled(emulationSteps === undefined);
                                            if (emulationSteps !== undefined)
                                                setNotice(
                                                    "Process stopped. The current item and spending were left unchanged.",
                                                );
                                        }}
                                    >
                                        {emulationSteps === undefined
                                            ? "Stop simulation"
                                            : "Stop process"}
                                    </Button>
                                    <progress
                                        aria-label={
                                            emulationSteps === undefined
                                                ? "Simulation progress"
                                                : "Process progress"
                                        }
                                        className="h-2 w-full accent-primary"
                                        value={
                                            continuous
                                                ? undefined
                                                : (emulationSteps ?? result?.trials ?? 0)
                                        }
                                        max={
                                            emulationSteps === undefined
                                                ? project.iterations
                                                : project.maxActions
                                        }
                                    />
                                    <p role="status" className="text-xs text-muted-foreground">
                                        {emulationSteps === undefined
                                            ? continuous
                                                ? `${result?.trials.toLocaleString() ?? 0} completed trials · Running until stopped`
                                                : `${result?.trials.toLocaleString() ?? 0} / ${project.iterations.toLocaleString()} trials`
                                            : `${emulationSteps.toLocaleString()} steps completed`}
                                    </p>
                                    {emulationSteps === undefined &&
                                    result?.simulationLimit &&
                                    result.simulationLimit.kind !== "manual" ? (
                                        <p role="status" className="text-xs text-muted-foreground">
                                            {(result.simulationLimit.kind === "successes"
                                                ? result.successes
                                                : (result.totalSteps ?? 0) +
                                                  (result.unfinished?.steps ?? 0)
                                            ).toLocaleString()}{" "}
                                            / {result.simulationLimit.count.toLocaleString()}{" "}
                                            {result.simulationLimit.kind === "successes"
                                                ? "successful items"
                                                : "simulation actions"}
                                        </p>
                                    ) : null}
                                </>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        onClick={() =>
                                            run(mode === "simulate" ? "process" : "calculate")
                                        }
                                    >
                                        {mode === "simulate" ? "Run simulation" : "Calculate odds"}
                                    </Button>
                                    {mode !== "simulate" ? (
                                        <Button variant="outline" onClick={() => run("sample")}>
                                            Mass simulate
                                        </Button>
                                    ) : null}
                                </div>
                            )}
                            {cancelled ? (
                                <p role="status" className="text-xs text-muted-foreground">
                                    Stopped. Results show only completed trials.
                                </p>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                                Calculations enumerate small outcome sets exactly. Larger sets use
                                the trial count and report a sampling interval.
                            </p>
                        </section>
                        <details className="rounded-lg border border-border bg-card p-4">
                            <summary className="cursor-pointer text-sm font-medium">
                                Custom prices in chaos
                            </summary>
                            <div className="mt-3 space-y-3">
                                {useProcess ? (
                                    <Field>
                                        <FieldLabel htmlFor="crafting-base-cost">
                                            Starting item cost (chaos)
                                        </FieldLabel>
                                        <Input
                                            id="crafting-base-cost"
                                            aria-describedby="crafting-base-cost-description"
                                            type="number"
                                            min={0}
                                            step="any"
                                            placeholder="Excluded"
                                            value={project.baseCost ?? ""}
                                            onChange={(event) =>
                                                change({
                                                    baseCost:
                                                        event.target.value === ""
                                                            ? undefined
                                                            : Number(event.target.value),
                                                })
                                            }
                                        />
                                        <FieldDescription id="crafting-base-cost-description">
                                            Processes count one starting item and each restart that
                                            restores it. In the emulator, later crafts reuse the
                                            current item. Blank excludes this cost; zero prices it
                                            as free.
                                        </FieldDescription>
                                    </Field>
                                ) : null}
                                {costs.map((cost) => (
                                    <label key={cost.id} className="block space-y-1 text-xs">
                                        {cost.name}
                                        <input
                                            className={controlClass}
                                            type="number"
                                            min={0}
                                            step="any"
                                            placeholder="Not priced"
                                            value={project.prices[cost.id] ?? ""}
                                            onChange={(event) => {
                                                const prices = { ...project.prices };
                                                if (event.target.value === "")
                                                    delete prices[cost.id];
                                                else prices[cost.id] = Number(event.target.value);
                                                change({ prices });
                                            }}
                                        />
                                    </label>
                                ))}
                            </div>
                        </details>
                        {result ? (
                            <CraftingResults
                                engine={engine}
                                result={result}
                                onUse={(item) => safely(() => setItem(item, "Simulation sample"))}
                            />
                        ) : null}
                    </div>
                </div>
                {catalog.game === "poe1" && mode === "calculate" && !base.strongbox ? (
                    <FossilOptimizerPanel
                        engine={engine}
                        project={project}
                        onChoose={(method) => change({ method })}
                        onPrices={(prices) => change({ prices })}
                    />
                ) : null}
                <ItemTextPanel
                    engine={engine}
                    item={project.item}
                    onImport={(item) => safely(() => setItem(item, "Imported item text"))}
                />
                <details className="rounded-lg border border-border bg-card p-4">
                    <summary className="cursor-pointer font-medium">Save, load, and export</summary>
                    <label className="mt-4 flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={autoSave}
                            onChange={(event) => {
                                setAutoSave(event.target.checked);
                                setDraftReady(true);
                            }}
                        />
                        Automatically save this draft
                    </label>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Restores this item and crafting setup for this game and build. History,
                        spending and results start fresh after a reload. Turning this off removes
                        the automatic draft; named projects are kept.
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="space-y-3">
                            <label className="block space-y-1 text-sm">
                                Project name
                                <input
                                    className={controlClass}
                                    value={saveName}
                                    maxLength={80}
                                    onChange={(event) => setSaveName(event.target.value)}
                                />
                            </label>
                            <Button
                                variant="outline"
                                onClick={() =>
                                    safely(() => {
                                        if (!saveName.trim())
                                            throw new Error("Enter a project name.");
                                        const records = JSON.parse(
                                            localStorage.getItem(storageKey) ?? "{}",
                                        );
                                        records[saveName.trim()] = validateProject(
                                            catalog,
                                            project,
                                        );
                                        localStorage.setItem(storageKey, JSON.stringify(records));
                                        setSaved(Object.keys(records));
                                        setNotice("Project saved in this browser.");
                                    })
                                }
                            >
                                Save project
                            </Button>
                        </div>
                        <div className="space-y-3">
                            <label className="block space-y-1 text-sm">
                                Saved project
                                <select
                                    className={controlClass}
                                    value={selectedSave}
                                    onChange={(event) => setSelectedSave(event.target.value)}
                                >
                                    <option value="">Choose a saved project</option>
                                    {saved.map((name) => (
                                        <option key={name} value={name}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <Button
                                variant="outline"
                                disabled={!selectedSave}
                                onClick={() =>
                                    safely(() =>
                                        restore(
                                            JSON.parse(localStorage.getItem(storageKey) ?? "{}")[
                                                selectedSave
                                            ],
                                        ),
                                    )
                                }
                            >
                                Load project
                            </Button>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                            variant="outline"
                            onClick={() =>
                                safely(() => {
                                    const data = JSON.stringify(
                                        validateProject(catalog, project),
                                        null,
                                        2,
                                    );
                                    const url = URL.createObjectURL(
                                        new Blob([data], { type: "application/json" }),
                                    );
                                    const link = document.createElement("a");
                                    link.href = url;
                                    link.download = `crafting-${catalog.game}-${catalog.patch}.json`;
                                    link.click();
                                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                                })
                            }
                        >
                            Export JSON
                        </Button>
                        <Button variant="outline" onClick={() => file.current?.click()}>
                            Import JSON
                        </Button>
                        <input
                            ref={file}
                            className="hidden"
                            aria-label="Import crafting project"
                            type="file"
                            accept="application/json,.json"
                            onChange={async (event) => {
                                const selected = event.target.files?.[0];
                                if (!selected) return;
                                if (selected.size > 2_000_000) {
                                    setError("Project files must be smaller than 2 MB.");
                                    return;
                                }
                                try {
                                    const data = JSON.parse(await selected.text());
                                    safely(() => restore(data));
                                } catch {
                                    setError("The selected file is not valid JSON.");
                                }
                                event.target.value = "";
                            }}
                        />
                    </div>
                </details>
                <details className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">
                        Data sources and model coverage
                    </summary>
                    <div className="mt-3 space-y-2">
                        <p>
                            Bases, modifiers, stat ranges, ordinary weights, recipes, and currency
                            names are generated from client build {catalog.patch}. PoE 1 Grasping
                            Mail weights and Heist eligibility use the approved PoE Wiki exceptions
                            described below. No Craft of Exile or PoEDB dataset is fetched.
                        </p>
                        <p>
                            The catalog includes craftable records found in the client, including
                            legacy content. Client records do not establish whether an item
                            currently drops in a league.
                        </p>
                        <p>
                            Server rules are modeled separately: ordinary PoE 1 rare rolls use 4/5/6
                            modifiers with weights 8/3/1; magic rolls use one or two modifiers
                            equally. Actual server distributions may differ. Unsupported crafts
                            report an error.
                        </p>
                        <p>
                            {catalog.game === "poe1"
                                ? "Available now: common currencies, Tainted Catalysts, bench metamods and socket counts, essences, fossils and optimizer, Harvest tag crafts, influence and more/less-likely reforges, elemental conversions and quality enchantments, influence and Eldritch currencies, Awakener donor transfers, generic unveils, imprints, beast affix swaps, Vaal and double map corruption with tier requirements, guaranteed map corruption implicits, flask crafts, level 20/30 Aspects, and amulet, ring and eligible belt anointments."
                                : "Available now: common and tiered currencies, ordinary and perfect essences, supported corrupted essences and alloys, all 26 Liquid Emotion jewel recipes, amulet instilling, Sanctification, directional and selected other omens, Waystone reward exclusions, desecration bones and reveal choices."}{" "}
                            Both games include base-quality currency and catalyst application with
                            per-use spending and quality requirements, conditional processes, item
                            inventory and undo history. PoE 1 also supports tainted armour and
                            weapon quality rolls. Vaal Orbs corrupt equipment, flasks and jewels in
                            both games, including PoE 2 jewel value rerolls. PoE 1 also supports
                            Locus of Corruption and the reference's six-affix equipment reroll.
                            Unique-jewel and white-socket branches leave modeled properties
                            unchanged. Unique transformations and gem colours are not stored. PoE 1
                            retains known socket links and supports bench and beast link guarantees;
                            random Fusing outcomes remain unsupported. PoE 2 also supports Waystone
                            corruption and tier requirements, equipment corruption, Omen of
                            Corruption and Artificer socket creation, Ancient Infusers, Architect's
                            Orbs and all four quality Infusers, with socket and corruption
                            requirements and item-text persistence. Additional league-specific
                            crafting is being implemented.
                        </p>
                        <p>
                            Reveal choices use weighted sampling without repeating modifier groups.
                            Prefix and suffix veils are equally likely when both fit. These are
                            modeled server rules. Beastcraft prices cover the complete recipe.
                        </p>
                        {catalog.game === "poe1" ? (
                            <p>
                                Memory-strand setup and Unravelling use the supplied empirical model
                                with extracted modifier weights. Foulborn adds a tier rating of 75.
                                Remembrance uses the research's observed five-strand buckets.
                                Consuming crafts filter tiers before subtracting a sampled cost
                                derived from the extracted action cost. Exalted affix-count
                                adjustments are estimates. Unravelling special or crafted tiers
                                remain unsupported. Memory Influenced Map setup and Orb of Intention
                                track extracted enchantment values and use limits. Map drops and
                                memory-map corruption transformations remain unmodeled.
                            </p>
                        ) : null}
                        {catalog.game === "poe1" ? (
                            <p>
                                Opulent blocks tagless new modifiers. Fractured Fossil rerolls then
                                fractures one modifier, chosen equally in this model. It requires a
                                fracturable base without influence or existing fractures. Target
                                groups can require the wanted modifiers to be fractured.
                            </p>
                        ) : null}
                        {catalog.game === "poe2" ? (
                            <p>
                                Desecration requests 1/2/3 Abyss-exclusive choices with 80%/15%/5%
                                probability, then fills up to three with ordinary modifiers. These
                                probabilities follow the reference model, not extracted server
                                values. Each source uses client weights; Breach outcomes join the
                                fill pool. A Lich guarantee counts within the exclusive choices.
                                Ordinary revealed modifiers retain desecrated status, including for
                                Omen of Light.
                            </p>
                        ) : null}
                        {catalog.game === "poe2" ? (
                            <p>
                                Putrefaction corrupts the item and supports multiple sequential
                                reveals using the same source-count model. Bone tier floors and
                                special pools do not apply. Counts use the displayed model, not
                                extracted server probabilities. Use an unrevealed-modifier count of
                                zero to finish a reveal loop.
                            </p>
                        ) : null}
                        {catalog.game === "poe1" ? (
                            <p>
                                Awakener transfers sample one modifier per influence equally and
                                retain one at random if their groups conflict. Transferred modifiers
                                retain their donor's level eligibility; additional rolls use the
                                target's item level. Modifiers unavailable on the target base remain
                                unsupported.
                            </p>
                        ) : (
                            <p>
                                Essence and Liquid Emotion outcomes exclude existing conflicting
                                groups before removal. A full guaranteed affix side restricts
                                removal to that side unless a Crystallisation omen overrides it.
                                Other eligible outcomes can fill the opened side when the selected
                                outcome cannot fit. Crafts with an impossible removal branch are
                                rejected before randomness. Essence of the Breach increases maximum
                                catalyst quality; quality is retained when its modifier is removed.
                                Existing Delirium allocations support editing, targets and item
                                text; random Delirium outcomes are out of scope because selection
                                weights are unknown. Essence of the Abyss applies its extracted
                                Mark, which ordinary desecration replaces on the same affix side.
                                Liquid Emotions use extracted jewel-specific guarantees with modeled
                                uniform removal and equal compatible-outcome chances. Potent effects
                                adjust affix strength and capacity. Removing a capacity modifier
                                retains existing affixes; new rolls still obey the current limits.
                            </p>
                        )}
                        <p>
                            Anointing supports one enchantment on eligible equipment and up to three
                            or nine oils on Blighted or Blight-ravaged Maps. Multiple-anointment
                            equipment and unique items remain unsupported.
                        </p>
                        {catalog.game === "poe1" ? (
                            <p>
                                Grasping Mail generation uses PoE Wiki Breachlord weights and the
                                approximate 50%/33%/17% distribution for 1/2/3 special modifiers.
                                Modern ring composition weights each eligible Breachlord pool;
                                legacy rings use the combined modifier weights. Special modifiers
                                are exclusive when recombined and cannot roll with ordinary
                                currency. Heist enchantments support manual selection with
                                build-derived values, magnitude effects, crafted capacity and socket
                                restrictions. Random Tempering and Tailoring odds remain unknown.
                                Synthesis is out of scope.
                            </p>
                        ) : null}
                        {catalog.game === "poe1" ? (
                            <p>
                                Harvest quality enchantments preserve affixes and replace the
                                existing enchantment. Final defence and weapon properties include
                                quality replacement and applicable local bonuses. Flat Life and
                                resistance totals include their supported quality enchantments;
                                character-wide effects remain unmodeled.
                            </p>
                        ) : null}
                        <p className="break-all font-mono text-xs">
                            Catalog source: {catalog.manifestSha256}
                        </p>
                    </div>
                </details>
            </div>
        </CraftingDisplay>
    );
}
