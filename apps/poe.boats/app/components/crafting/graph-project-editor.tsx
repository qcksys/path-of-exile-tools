import { itemQuerySchema } from "@poe-tools/item-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { CraftingEngine } from "~/lib/crafting-engine";
import { liveExchangePrices } from "~/lib/crafting-exchange";
import { livePurchasePrices } from "~/lib/crafting-market";
import { availableCorrection } from "~/lib/crafting-rulesets";
import type { CraftingCatalog } from "~/schemas/crafting";
import { type CraftingGraph, craftingGraphSchema } from "~/schemas/crafting-graph";
import {
    type CraftingGraphResult,
    craftingGraphResultSchema,
} from "~/schemas/crafting-graph-result";
import { craftingMarketRefreshResultSchema } from "~/schemas/crafting-market";
import type { CraftingRuleset, CraftingRulesetIndex } from "~/schemas/crafting-rulesets";
import type { CraftingDraft } from "~/schemas/crafting-workspace";
import { ExchangePricePicker } from "./exchange-price-picker";
import { GraphCanvas } from "./graph-canvas";
import { GraphNodeEditor, GraphPriceInput } from "./graph-node-editor";
import { GraphQueryEditor, graphControl } from "./graph-query-editor";
import { GraphSamples } from "./graph-samples";
import { ProcessCostHistory } from "./process-cost-history";

export function GraphProjectEditor({
    project,
    currentCatalog,
    ruleset,
    index,
    onChange,
    onCopy,
    onExport,
}: {
    project: CraftingDraft;
    currentCatalog?: CraftingCatalog;
    ruleset: CraftingRuleset;
    index: CraftingRulesetIndex;
    onChange: (graph: CraftingGraph) => void;
    onCopy: () => void;
    onExport: () => void;
}) {
    const graph = project.graph;
    const [catalog, setCatalog] = useState<CraftingCatalog>();
    const [selected, setSelected] = useState(graph.entry);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    const [marketStatus, setMarketStatus] = useState({
        revision: 0,
        pending: false,
        issues: [] as string[],
    });
    const change = useRef(onChange);
    change.current = onChange;
    const hasMarketPrices = livePurchasePrices(graph).length + liveExchangePrices(graph).length > 0;
    const [calculation, setCalculation] = useState<{
        revision: number;
        result: CraftingGraphResult;
    }>();
    const worker = useRef<Worker | null>(null);
    const revision = useRef(project.revision);
    revision.current = project.revision;
    const engine = useMemo(() => (catalog ? new CraftingEngine(catalog) : undefined), [catalog]);
    useEffect(() => {
        if (!hasMarketPrices) return;
        const refresh = () => setRefreshTick((tick) => tick + 1);
        const timer = window.setInterval(refresh, 60_000);
        window.addEventListener("focus", refresh);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", refresh);
        };
    }, [hasMarketPrices]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: The refresh counter triggers the same request on focus, timer and explicit retry.
    useEffect(() => {
        const started = project.revision;
        if (!hasMarketPrices) {
            setMarketStatus({ revision: started, pending: false, issues: [] });
            return;
        }
        if (!engine) return;
        const controller = new AbortController();
        setMarketStatus({ revision: started, pending: true, issues: [] });
        void (async () => {
            try {
                const response = await fetch("/api/v1/crafting/market/refresh", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ graph }),
                    signal: controller.signal,
                });
                if (!response.ok)
                    throw new Error(
                        "Live market prices could not be refreshed. Retry or enter a manual price before calculating.",
                    );
                const result = craftingMarketRefreshResultSchema.parse(await response.json());
                if (controller.signal.aborted || revision.current !== started) return;
                setMarketStatus({ revision: started, pending: false, issues: result.issues });
                if (
                    JSON.stringify(result.graph) !==
                    JSON.stringify(craftingGraphSchema.parse(graph))
                )
                    change.current(result.graph);
            } catch (error) {
                if (!controller.signal.aborted && revision.current === started)
                    setMarketStatus({
                        revision: started,
                        pending: false,
                        issues: [error instanceof Error ? error.message : "Market refresh failed."],
                    });
            }
        })();
        return () => controller.abort();
    }, [engine, graph, hasMarketPrices, project.revision, refreshTick]);
    const fail = useCallback(
        (error: unknown) => setError(error instanceof Error ? error.message : String(error)),
        [],
    );
    const update = (next: CraftingGraph) => {
        try {
            onChange(next);
            setError("");
        } catch (error) {
            fail(error);
        }
    };
    const latest = availableCorrection(index, graph);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Catalog identity comes from the pinned ruleset, not editable graph fields.
    useEffect(() => {
        if (
            currentCatalog &&
            ruleset.craftingSha256 === currentCatalog.craftingSha256 &&
            ruleset.manifestSha256 === currentCatalog.manifestSha256
        ) {
            setCatalog(currentCatalog);
            return;
        }
        setCatalog(undefined);
        const loader = new Worker("/game-data/history/worker.mjs", { type: "module" });
        loader.onmessage = ({ data }) => {
            if (data.type === "catalog") setCatalog(data.catalog);
            if (data.type === "error") fail(data.error);
        };
        loader.onerror = (event) => fail(event.message);
        loader.postMessage({ type: "catalog", graph });
        return () => loader.terminate();
    }, [ruleset, currentCatalog, fail]);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Any draft revision invalidates the running calculation.
    useEffect(() => {
        worker.current?.terminate();
        worker.current = null;
        setBusy(false);
        return () => worker.current?.terminate();
    }, [project.revision]);
    const result = calculation?.result;
    const stale = calculation && calculation.revision !== project.revision;
    const node = graph.nodes.find((entry) => entry.id === selected) ?? graph.nodes[0]!;
    const select = useCallback((id: string) => setSelected(id), []);
    const costs = useMemo(() => {
        if (!engine) return [];
        const entries = graph.nodes.flatMap((node) => {
            try {
                return node.kind === "craft" ? engine.costs(node.method) : [];
            } catch {
                return [];
            }
        });
        return [...new Map(entries.map((entry) => [entry.id, entry.name])).entries()];
    }, [engine, graph.nodes]);
    function run() {
        worker.current?.terminate();
        const next = new Worker("/game-data/history/worker.mjs", { type: "module" });
        worker.current = next;
        setBusy(true);
        setError("");
        const started = project.revision;
        next.onmessage = ({ data }) => {
            if (revision.current !== started) return;
            if (data.type === "error") {
                fail(data.error);
                setBusy(false);
            } else if (data.result) {
                const parsed = craftingGraphResultSchema.safeParse(data.result);
                if (parsed.success) setCalculation({ revision: started, result: parsed.data });
                else fail("The calculation returned an invalid result.");
                if (data.type === "done" || !parsed.success) {
                    setBusy(false);
                    next.terminate();
                }
            }
        };
        next.onerror = (event) => {
            fail(event.message);
            setBusy(false);
        };
        next.postMessage({ type: "calculate", graph });
    }
    function addCraft() {
        if (!engine) return;
        const method = engine.catalog.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_magic",
        )!;
        const id = crypto.randomUUID();
        update({
            ...graph,
            entry: id,
            nodes: [
                ...graph.nodes,
                {
                    id,
                    kind: "craft",
                    name: "Craft item",
                    output: itemQuerySchema.parse({ game: graph.game }),
                    inputs: [{ id: "item", name: "Item 1", source: graph.entry }],
                    method: { kind: "currency", id: method.id },
                    branches: [],
                    ordering: "automatic",
                    fallback: { kind: "return" },
                },
            ],
        });
        setSelected(id);
    }
    async function adopt(target: CraftingRuleset) {
        try {
            const response = await fetch("/api/v1/crafting/rulesets/adopt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ graph, era: target.era, revision: target.revision }),
            });
            const data = await response.json();
            if (!response.ok)
                throw new Error(
                    data && typeof data === "object" && "error" in data
                        ? String(data.error)
                        : "This revision could not be applied.",
                );
            if (!data || typeof data !== "object" || !("graph" in data))
                throw new Error("The revision returned no project.");
            update(craftingGraphSchema.parse(data.graph));
        } catch (error) {
            fail(error);
        }
    }
    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <Label className="block min-w-64 flex-1 text-xs text-muted-foreground">
                    Project name
                    <Input
                        key={graph.name}
                        className={`${graphControl} mt-1 text-xl font-semibold text-foreground`}
                        defaultValue={graph.name}
                        onBlur={(event) => {
                            if (event.target.value.trim() && event.target.value !== graph.name)
                                update({ ...graph, name: event.target.value });
                        }}
                    />
                </Label>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={onCopy}>
                        Duplicate project
                    </Button>
                    <Button variant="outline" onClick={onExport}>
                        Export project
                    </Button>
                    <Button
                        onClick={run}
                        disabled={
                            busy ||
                            (hasMarketPrices &&
                                (marketStatus.revision !== project.revision ||
                                    marketStatus.pending ||
                                    marketStatus.issues.length > 0))
                        }
                    >
                        {busy ? "Calculating…" : "Calculate process"}
                    </Button>
                    {busy && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                worker.current?.terminate();
                                setBusy(false);
                            }}
                        >
                            Stop
                        </Button>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                    {ruleset.label} · {ruleset.revision} · draft revision {project.revision}
                </span>
                {latest && (
                    <Button size="sm" variant="outline" onClick={() => void adopt(latest)}>
                        Correction available · adopt {latest.revision}
                    </Button>
                )}
            </div>
            <ProcessCostHistory graph={graph} />
            <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Crafting version</summary>
                <form
                    key={`${ruleset.era}:${ruleset.revision}`}
                    className="mt-2 flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const selected = new FormData(event.currentTarget).get("revision");
                        const target = index.revisions.find(
                            (entry) =>
                                entry.game === graph.game &&
                                `${entry.era}:${entry.revision}` === selected,
                        );
                        if (target) void adopt(target);
                    }}
                >
                    <Label>
                        Retained era and revision
                        <FormSelect
                            name="revision"
                            className={graphControl}
                            defaultValue={`${ruleset.era}:${ruleset.revision}`}
                        >
                            {index.revisions
                                .filter((entry) => entry.game === graph.game)
                                .map((entry) => (
                                    <FormSelectItem
                                        key={`${entry.era}:${entry.revision}`}
                                        value={`${entry.era}:${entry.revision}`}
                                    >
                                        {entry.label} · {entry.revision}
                                    </FormSelectItem>
                                ))}
                        </FormSelect>
                    </Label>
                    <Button type="submit" variant="outline" size="sm">
                        Apply selected version
                    </Button>
                    <p className="w-full">
                        Opening this project preserves its saved rules. Changing version validates
                        the process and requires a new calculation.
                    </p>
                </form>
            </details>
            {error && (
                <p
                    role="alert"
                    className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm"
                >
                    {error}
                </p>
            )}
            {hasMarketPrices && (
                <section
                    className="rounded border border-border p-3 text-xs"
                    aria-label="Live market prices"
                >
                    <p>
                        {marketStatus.pending
                            ? "Refreshing market prices…"
                            : marketStatus.issues.length
                              ? "Market prices need attention."
                              : "Market prices refreshed. Refreshes every minute and when returning to this window."}
                    </p>
                    {marketStatus.issues.map((issue) => (
                        <p key={issue} role="alert">
                            {issue}
                        </p>
                    ))}
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={marketStatus.pending}
                        onClick={() => setRefreshTick((tick) => tick + 1)}
                    >
                        Refresh market prices
                    </Button>
                </section>
            )}
            <section className="grid gap-3 sm:grid-cols-3" aria-label="Process estimate">
                {[
                    [
                        "Expected cost",
                        result?.meanCost === null || !result
                            ? "Unresolved"
                            : `${result.meanCost.toFixed(2)} ${graph.currency}`,
                    ],
                    [
                        "Target probability",
                        result?.probability === null || !result
                            ? "Not calculated"
                            : `${(result.probability * 100).toFixed(1)}%`,
                    ],
                    [
                        "Net after explicit sales",
                        result?.meanProfit === null || !result
                            ? "Unresolved"
                            : `${result.meanProfit.toFixed(2)} ${graph.currency}`,
                    ],
                ].map(([label, value]) => (
                    <div key={label} className="rounded border border-border bg-card px-4 py-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 font-mono text-xl">{value}</p>
                    </div>
                ))}
            </section>
            {stale && (
                <p role="status" className="text-sm text-amber-600">
                    The project changed. Recalculate to update these estimates.
                </p>
            )}
            {result && (
                <div className="text-xs text-muted-foreground">
                    <p>
                        {result.trials.toLocaleString()} sampled trials ·{" "}
                        {result.meanActions?.toFixed(1) ?? "?"} expected actions ·{" "}
                        {result.complete ? "Completed estimate" : "Incomplete estimate"}
                    </p>
                    {result.missingPrices.length > 0 && (
                        <p>
                            Missing prices:{" "}
                            {result.missingPrices
                                .map((id) => {
                                    try {
                                        return engine?.costName(id) ?? id;
                                    } catch {
                                        return id;
                                    }
                                })
                                .join(", ")}
                        </p>
                    )}
                    {Object.entries(result.errors).map(([message, count]) => (
                        <p key={message} role="alert">
                            {message} ({count} trials)
                        </p>
                    ))}
                    {result.excludedRecovery > 0 && (
                        <p>
                            {result.excludedRecovery} discarded or unpriced recoveries; these are
                            not verified zero-value items.
                        </p>
                    )}
                </div>
            )}
            {engine && result && !stale && !busy && (
                <GraphSamples
                    key={calculation?.revision}
                    engine={engine}
                    graph={graph}
                    result={result}
                    ruleset={ruleset}
                />
            )}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
                <div className="min-w-0 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={addCraft} disabled={!engine}>
                            Add craft step
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const source = graph.nodes.find((node) => node.kind === "acquire");
                                if (!source) return;
                                const id = crypto.randomUUID();
                                update({
                                    ...graph,
                                    nodes: [
                                        ...graph.nodes,
                                        {
                                            ...structuredClone(source),
                                            id,
                                            name: "Additional input",
                                            position: undefined,
                                        },
                                    ],
                                });
                                setSelected(id);
                            }}
                        >
                            Add item input
                        </Button>
                        <span className="self-center text-xs text-muted-foreground">
                            Connect outputs to inputs. Dashed lines return recoverable items.
                        </span>
                    </div>
                    <GraphCanvas
                        graph={graph}
                        selected={node.id}
                        onSelect={select}
                        onChange={update}
                        result={stale ? undefined : result}
                        onError={fail}
                    />
                    <details className="rounded-lg border border-border p-4" open>
                        <summary className="cursor-pointer text-sm font-semibold">
                            Prices & calculation
                        </summary>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <Label className="block text-xs">
                                Sampled trials
                                <Input
                                    className={graphControl}
                                    type="number"
                                    min="1"
                                    max="100000"
                                    value={graph.iterations}
                                    onChange={(event) =>
                                        update({ ...graph, iterations: Number(event.target.value) })
                                    }
                                />
                            </Label>
                            <Label className="block text-xs">
                                Maximum steps per trial
                                <Input
                                    className={graphControl}
                                    type="number"
                                    min="1"
                                    max="1000000"
                                    value={graph.maxSteps}
                                    onChange={(event) =>
                                        update({ ...graph, maxSteps: Number(event.target.value) })
                                    }
                                />
                            </Label>
                            {costs.map(([id, name]) => (
                                <GraphPriceInput
                                    key={id}
                                    label={name}
                                    currency={graph.currency}
                                    value={graph.prices[id] ?? null}
                                    onChange={(price) => {
                                        const prices = { ...graph.prices };
                                        if (price) prices[id] = price;
                                        else delete prices[id];
                                        update({ ...graph, prices });
                                    }}
                                />
                            ))}
                        </div>
                        <ExchangePricePicker graph={graph} entries={costs} onChange={update} />
                    </details>
                    {catalog && (
                        <details className="rounded-lg border border-border p-4">
                            <summary className="cursor-pointer text-sm font-semibold">
                                Terminal outcomes ({graph.outcomes.length})
                            </summary>
                            <p className="mt-2 text-xs text-muted-foreground">
                                Only specified properties matter. More specific queries route first
                                unless you choose manual order.
                            </p>
                            <div className="mt-4 space-y-4">
                                {graph.outcomes.map((outcome, i) => (
                                    <section
                                        key={outcome.id}
                                        className="space-y-3 border-t border-border pt-3"
                                    >
                                        <Input
                                            key={outcome.name}
                                            aria-label="Outcome name"
                                            className={graphControl}
                                            defaultValue={outcome.name}
                                            onBlur={(event) => {
                                                if (event.target.value.trim())
                                                    update({
                                                        ...graph,
                                                        outcomes: graph.outcomes.map((entry) =>
                                                            entry.id === outcome.id
                                                                ? {
                                                                      ...entry,
                                                                      name: event.target.value,
                                                                  }
                                                                : entry,
                                                        ),
                                                    });
                                            }}
                                        />
                                        <GraphQueryEditor
                                            label="Outcome requirements"
                                            ruleset={graph.ruleset}
                                            catalog={catalog}
                                            value={outcome.query}
                                            onChange={(query) =>
                                                update({
                                                    ...graph,
                                                    outcomes: graph.outcomes.map((entry) =>
                                                        entry.id === outcome.id
                                                            ? { ...entry, query }
                                                            : entry,
                                                    ),
                                                })
                                            }
                                        />
                                        <Label className="flex gap-2 text-xs">
                                            <Checkbox
                                                checked={outcome.success}
                                                onCheckedChange={(checked) =>
                                                    update({
                                                        ...graph,
                                                        outcomes: graph.outcomes.map((entry) =>
                                                            entry.id === outcome.id
                                                                ? {
                                                                      ...entry,
                                                                      success: checked,
                                                                  }
                                                                : entry,
                                                        ),
                                                    })
                                                }
                                            />
                                            Count as a successful result
                                        </Label>
                                        <Label className="block text-xs">
                                            Disposition
                                            <FormSelect
                                                className={graphControl}
                                                value={outcome.disposition}
                                                onValueChange={(selectedValue) =>
                                                    update({
                                                        ...graph,
                                                        outcomes: graph.outcomes.map((entry) =>
                                                            entry.id === outcome.id
                                                                ? {
                                                                      ...entry,
                                                                      disposition:
                                                                          selectedValue as typeof outcome.disposition,
                                                                  }
                                                                : entry,
                                                        ),
                                                    })
                                                }
                                            >
                                                <FormSelectItem value="keep">Keep</FormSelectItem>
                                                <FormSelectItem value="sell">Sell</FormSelectItem>
                                                <FormSelectItem value="discard">
                                                    Discard
                                                </FormSelectItem>
                                            </FormSelect>
                                        </Label>
                                        {outcome.disposition === "sell" && (
                                            <GraphPriceInput
                                                label="Sale price"
                                                currency={graph.currency}
                                                value={
                                                    graph.prices[`outcome:${outcome.id}`] ??
                                                    outcome.price
                                                }
                                                onChange={(price) => {
                                                    const prices = { ...graph.prices };
                                                    delete prices[`outcome:${outcome.id}`];
                                                    update({
                                                        ...graph,
                                                        prices,
                                                        outcomes: graph.outcomes.map((entry) =>
                                                            entry.id === outcome.id
                                                                ? { ...entry, price }
                                                                : entry,
                                                        ),
                                                    });
                                                }}
                                            />
                                        )}
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={i === 0}
                                            onClick={() => {
                                                const outcomes = [...graph.outcomes];
                                                outcomes.splice(
                                                    i - 1,
                                                    0,
                                                    outcomes.splice(i, 1)[0]!,
                                                );
                                                update({
                                                    ...graph,
                                                    outcomes,
                                                    outcomeOrdering: "manual",
                                                });
                                            }}
                                        >
                                            Move outcome up
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={i === graph.outcomes.length - 1}
                                            onClick={() => {
                                                const outcomes = [...graph.outcomes];
                                                outcomes.splice(
                                                    i + 1,
                                                    0,
                                                    outcomes.splice(i, 1)[0]!,
                                                );
                                                update({
                                                    ...graph,
                                                    outcomes,
                                                    outcomeOrdering: "manual",
                                                });
                                            }}
                                        >
                                            Move outcome down
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={graph.outcomes.length === 1}
                                            onClick={() => {
                                                const referenced = graph.nodes.some(
                                                    (node) =>
                                                        node.kind === "craft" &&
                                                        [
                                                            node.fallback,
                                                            ...node.branches.map(
                                                                (branch) => branch.destination,
                                                            ),
                                                        ].some(
                                                            (destination) =>
                                                                destination.kind === "terminal" &&
                                                                destination.outcomeId ===
                                                                    outcome.id,
                                                        ),
                                                );
                                                if (referenced) {
                                                    fail(
                                                        "Redirect branches that finish at this outcome before removing it.",
                                                    );
                                                    return;
                                                }
                                                const prices = { ...graph.prices };
                                                delete prices[`outcome:${outcome.id}`];
                                                update({
                                                    ...graph,
                                                    prices,
                                                    outcomes: graph.outcomes.filter(
                                                        (entry) => entry.id !== outcome.id,
                                                    ),
                                                });
                                            }}
                                        >
                                            Remove outcome
                                        </Button>
                                    </section>
                                ))}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        update({
                                            ...graph,
                                            outcomes: [
                                                ...graph.outcomes,
                                                {
                                                    id: crypto.randomUUID(),
                                                    name: `Outcome ${graph.outcomes.length + 1}`,
                                                    query: itemQuerySchema.parse({
                                                        game: graph.game,
                                                    }),
                                                    success: false,
                                                    disposition: "discard",
                                                    price: null,
                                                },
                                            ],
                                        })
                                    }
                                >
                                    Add terminal outcome
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        update({ ...graph, outcomeOrdering: "automatic" })
                                    }
                                >
                                    {graph.outcomeOrdering === "automatic"
                                        ? "Automatic outcome ordering"
                                        : "Restore automatic outcome ordering"}
                                </Button>
                            </div>
                        </details>
                    )}
                </div>
                <div className="min-w-0">
                    {engine ? (
                        <GraphNodeEditor
                            onError={fail}
                            key={node.id}
                            graph={graph}
                            node={node}
                            engine={engine}
                            ruleset={ruleset}
                            onChange={update}
                            result={stale ? undefined : result}
                        />
                    ) : (
                        <p role="status">Loading this revision's item catalog…</p>
                    )}
                </div>
            </div>
        </div>
    );
}
