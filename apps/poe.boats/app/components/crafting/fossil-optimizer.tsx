import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { usesAllflame } from "~/lib/crafting-allflame";
import type { CraftingEngine } from "~/lib/crafting-engine";
import {
    type FossilOptimization,
    fossilCombinations,
    mergeFossilOptimizations,
} from "~/lib/crafting-optimizer";
import { hasCraftingRequirements } from "~/lib/crafting-simulation";
import type { CraftingMethod, CraftingProject } from "~/schemas/crafting";
import { controlClass } from "./method-picker";
import { TangledFossilPicker } from "./tangled-fossil-picker";

function duration(seconds: number) {
    const rounded = Math.ceil(seconds);
    if (rounded < 60) return `${rounded}s`;
    if (rounded < 3600) return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
    return `${Math.floor(rounded / 3600)}h ${Math.floor((rounded % 3600) / 60)}m`;
}

export function FossilOptimizerPanel({
    engine,
    project,
    onChoose,
    onPrices,
}: {
    engine: CraftingEngine;
    project: CraftingProject;
    onChoose: (method: CraftingMethod) => void;
    onPrices: (prices: Record<string, number>) => void;
}) {
    const fossils = useMemo(() => engine.availableFossils(project.item), [engine, project.item]);
    const [excluded, setExcluded] = useState<string[]>([]);
    const [tangledChoice, setTangledChoice] = useState<string>();
    const [maxSockets, setMaxSockets] = useState(1);
    const [trials, setTrials] = useState(1000);
    const [workerCount, setWorkerCount] = useState(1);
    const [sort, setSort] = useState("attempts");
    const [result, setResult] = useState<FossilOptimization>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const workers = useRef(new Set<Worker>());
    const started = useRef(0);
    const [elapsed, setElapsed] = useState(0);
    const included = fossils.filter((entry) => !excluded.includes(entry.id));
    const tangled = included.some((entry) => entry.randomOutcomes.length)
        ? (tangledChoice ??
          (project.method.kind === "fossils" ? project.method.tangled : undefined) ??
          fossils.find((entry) => entry.randomOutcomes.length)?.randomOutcomes[0])
        : undefined;
    const combinations = fossilCombinations(
        included.map((entry) => entry.id),
        maxSockets,
    ).length;
    const action =
        project.item.rarity === "normal" ? "delve_currency_upgrade" : "delve_currency_reroll";
    const allflame = project.method.kind === "fossils" && usesAllflame(project.method);
    const rules = engine.catalog.crafting.allflame;
    const allflameCurrencies = new Set(rules?.currencies.map((entry) => entry.currency));
    const costs = [
        ...included,
        ...engine.catalog.crafting.currencies.filter(
            (entry) =>
                entry.action === action &&
                Number(entry.id.at(-1)) <= maxSockets &&
                (!allflame || allflameCurrencies.has(entry.id)),
        ),
        ...(allflame && rules ? [{ id: rules.sulphur, name: engine.costName(rules.sulphur) }] : []),
    ];

    // biome-ignore lint/correctness/useExhaustiveDependencies: A change to any search input invalidates this worker and its results.
    useEffect(() => {
        setResult(undefined);
        setBusy(false);
        setError("");
        setElapsed(0);
        return () => {
            for (const worker of workers.current) worker.terminate();
            workers.current.clear();
        };
    }, [engine, project, excluded, maxSockets, trials, tangled, workerCount]);

    useEffect(() => {
        if (!busy) return;
        const timer = setInterval(
            () => setElapsed((performance.now() - started.current) / 1000),
            1000,
        );
        return () => clearInterval(timer);
    }, [busy]);

    function stop() {
        for (const worker of workers.current) worker.terminate();
        workers.current.clear();
        setElapsed((performance.now() - started.current) / 1000);
        setBusy(false);
    }

    function start() {
        if (!hasCraftingRequirements(project.target)) {
            setError("Choose at least one target modifier or item requirement.");
            return;
        }
        stop();
        const instances = new Set<Worker>();
        workers.current = instances;
        const count = Math.min(workerCount, combinations);
        const results: FossilOptimization[] = Array.from({ length: count }, (_, index) => ({
            completed: 0,
            total: Math.ceil((combinations - index) / count),
            failed: 0,
            errors: [],
            byAttempts: [],
            byCost: [],
        }));
        setError("");
        setResult(mergeFossilOptimizations(results));
        started.current = performance.now();
        setElapsed(0);
        setBusy(true);
        try {
            for (let index = 0; index < count; index++) {
                const instance = new Worker(
                    new URL("../../lib/crafting.worker.ts", import.meta.url),
                    {
                        type: "module",
                    },
                );
                instances.add(instance);
                const active = () => workers.current === instances && instances.has(instance);
                instance.onmessage = (event) => {
                    if (!active()) return;
                    if (event.data.type === "error") {
                        setError(event.data.message);
                        stop();
                        return;
                    }
                    results[index] = event.data.result;
                    setResult(mergeFossilOptimizations(results));
                    setElapsed((performance.now() - started.current) / 1000);
                    if (event.data.type === "done") {
                        instance.terminate();
                        instances.delete(instance);
                        if (!instances.size) setBusy(false);
                    }
                };
                instance.onerror = (event) => {
                    if (!active()) return;
                    setError(event.message || "The optimizer could not start.");
                    stop();
                };
                instance.postMessage({
                    type: "optimize",
                    catalog: engine.catalog,
                    project,
                    options: {
                        fossils: included.map((entry) => entry.id),
                        maxSockets,
                        trials,
                        logic:
                            project.method.kind === "fossils" ? project.method.logic : "additive",
                        allflame: allflame ? true : undefined,
                        tangled,
                        partition: { index, count },
                    },
                });
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : "The optimizer could not start.");
            stop();
        }
    }

    return (
        <details className="rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer font-medium">Fossil optimizer</summary>
            <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                    Compare fossil combinations by chance of success or estimated cost. Each
                    combination uses the same starting item and requirements.
                </p>
                {allflame ? (
                    <p role="note" className="text-sm text-muted-foreground">
                        Uses Allflame from the selected fossil method. Each trial keeps the first
                        copy meeting your requirements. Cost includes sulphur for this item's class
                        and level; chosen combinations retain Allflame.
                    </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                    <Label className="block space-y-1 text-sm">
                        Maximum resonator sockets
                        <FormSelect
                            className={controlClass}
                            value={maxSockets}
                            onValueChange={(selectedValue) => setMaxSockets(Number(selectedValue))}
                        >
                            {[1, 2, 3, 4].map((size) => (
                                <FormSelectItem key={size} value={size}>
                                    {size}
                                </FormSelectItem>
                            ))}
                        </FormSelect>
                    </Label>
                    <Label className="block space-y-1 text-sm">
                        Trials per combination
                        <Input
                            className={controlClass}
                            type="number"
                            min={100}
                            max={100000}
                            step={100}
                            value={trials}
                            onChange={(event) => setTrials(Number(event.target.value))}
                        />
                    </Label>
                    <Label className="block space-y-1 text-sm">
                        Optimizer workers
                        <FormSelect
                            className={controlClass}
                            value={workerCount}
                            onValueChange={(selectedValue) => setWorkerCount(Number(selectedValue))}
                        >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                                <FormSelectItem key={count} value={count}>
                                    {count}
                                </FormSelectItem>
                            ))}
                        </FormSelect>
                    </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                    More workers use more CPU and memory. Worker count does not change seeded
                    results. Up to one worker per combination runs.
                </p>
                <fieldset className="grid max-h-48 gap-2 overflow-y-auto rounded border p-3 sm:grid-cols-2">
                    <legend className="px-1 text-sm">Included fossils</legend>
                    {fossils.map((entry) => (
                        <Label key={entry.id} className="flex gap-2 text-sm">
                            <Checkbox
                                checked={!excluded.includes(entry.id)}
                                onCheckedChange={(checked) =>
                                    setExcluded(
                                        checked
                                            ? excluded.filter((id) => id !== entry.id)
                                            : [...excluded, entry.id],
                                    )
                                }
                            />
                            {entry.name}
                        </Label>
                    ))}
                </fieldset>
                {tangled ? (
                    <TangledFossilPicker
                        catalog={engine.catalog}
                        value={tangled}
                        onChange={setTangledChoice}
                    />
                ) : null}
                <details>
                    <summary className="cursor-pointer text-sm">Optimizer prices in chaos</summary>
                    <div className="mt-3 grid max-h-60 gap-3 overflow-y-auto sm:grid-cols-2">
                        {costs.map((entry) => (
                            <Label key={entry.id} className="block space-y-1 text-xs">
                                {entry.name}
                                <Input
                                    className={controlClass}
                                    type="number"
                                    min={0}
                                    step="any"
                                    placeholder="Not priced"
                                    value={project.prices[entry.id] ?? ""}
                                    onChange={(event) => {
                                        const prices = { ...project.prices };
                                        if (event.target.value === "") delete prices[entry.id];
                                        else prices[entry.id] = Number(event.target.value);
                                        onPrices(prices);
                                    }}
                                />
                            </Label>
                        ))}
                    </div>
                </details>
                <p className="text-xs text-muted-foreground">
                    {combinations.toLocaleString()} combinations ·{" "}
                    {(combinations * trials).toLocaleString()} total trials. Larger searches may
                    take several minutes. Rankings are sampled estimates; compare the 95% intervals
                    before choosing.
                </p>
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                <div className="flex gap-2">
                    <Button
                        disabled={
                            busy ||
                            !included.length ||
                            !["normal", "rare"].includes(project.item.rarity)
                        }
                        onClick={start}
                    >
                        Compare fossils
                    </Button>
                    {busy ? (
                        <Button variant="outline" onClick={stop}>
                            Stop optimizer
                        </Button>
                    ) : null}
                </div>
                {result ? (
                    <div className="space-y-3">
                        <p role="status" className="text-sm">
                            {result.completed.toLocaleString()} / {result.total.toLocaleString()}{" "}
                            combinations completed
                            {result.failed ? ` · ${result.failed} unavailable` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Elapsed {duration(elapsed)}
                            {result.completed > 0 && elapsed > 0
                                ? ` · ${(result.completed / elapsed).toFixed(2)} combinations/s`
                                : ""}
                            {busy
                                ? result.completed > 0 && elapsed > 0
                                    ? ` · Estimated remaining ${duration(((result.total - result.completed) * elapsed) / result.completed)}`
                                    : " · Estimating remaining time…"
                                : result.completed < result.total
                                  ? " · Partial results — optimizer stopped"
                                  : " · Complete"}
                        </p>
                        <Label className="block space-y-1 text-sm">
                            Rank combinations by
                            <FormSelect
                                className={controlClass}
                                value={sort}
                                onValueChange={(selectedValue) => setSort(selectedValue)}
                            >
                                <FormSelectItem value="attempts">
                                    Fewest expected attempts
                                </FormSelectItem>
                                <FormSelectItem value="cost">Lowest expected cost</FormSelectItem>
                            </FormSelect>
                        </Label>
                        {sort === "cost" && !result.byCost.length ? (
                            <p className="text-sm text-muted-foreground">
                                Cost ranking needs a price for every ingredient and at least one
                                observed success.
                            </p>
                        ) : null}
                        <ol className="space-y-2">
                            {(sort === "cost" ? result.byCost : result.byAttempts).map((entry) => (
                                <li
                                    key={entry.method.ids.join("|")}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
                                >
                                    <div>
                                        <p className="text-sm font-medium">
                                            {engine.methodName(entry.method)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {(entry.probability * 100).toFixed(2)}% · 95% interval{" "}
                                            {(entry.interval[0] * 100).toFixed(2)}–
                                            {(entry.interval[1] * 100).toFixed(2)}% ·{" "}
                                            {entry.probability
                                                ? `${(1 / entry.probability).toFixed(1)} attempts`
                                                : "No successes observed"}
                                            {entry.costPerSuccess !== null
                                                ? ` · ${entry.costPerSuccess.toFixed(2)} chaos per success`
                                                : ""}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onChoose(entry.method)}
                                    >
                                        Use combination
                                    </Button>
                                </li>
                            ))}
                        </ol>
                        {result.errors.length ? (
                            <details>
                                <summary className="cursor-pointer text-sm">
                                    Unavailable combinations
                                </summary>
                                <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                                    {result.errors.map((message) => (
                                        <li key={message}>{message}</li>
                                    ))}
                                </ul>
                            </details>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </details>
    );
}
