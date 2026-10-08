import { itemQuerySchema } from "@poe-tools/item-query";
import { decodeCohortPriceReference, decodeExchangePriceReference } from "@poe-tools/market";
import { useEffect, useId, useMemo, useRef } from "react";
import { CatalogPicker } from "~/components/recombinator/catalog-item-editor";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { connectGraphInput, removeGraphNode } from "~/lib/crafting-graph-authoring";
import { replaceGraphMethod } from "~/lib/crafting-graph-method";
import { bindCohortPurchasePrice } from "~/lib/crafting-market";
import { rulesetAllowsConditionalSteps, rulesetAllowsMethod } from "~/lib/crafting-rulesets";
import { decodeCraftingSourceReference } from "~/lib/crafting-sources";
import { craftingItemOptions } from "~/lib/item-presentation";
import type { CraftingMethod } from "~/schemas/crafting";
import type { CraftingPrice } from "~/schemas/crafting-economy";
import type { CraftingGraph, GraphDestination, GraphNode } from "~/schemas/crafting-graph";
import type { CraftingGraphResult } from "~/schemas/crafting-graph-result";
import type { CraftingRuleset } from "~/schemas/crafting-rulesets";
import { ExchangePricePicker } from "./exchange-price-picker";
import { GraphMethodEditor } from "./graph-method-editor";
import { GraphQueryEditor, graphControl } from "./graph-query-editor";
import { GraphTradeSearch } from "./graph-trade-search";
import { ItemCard } from "./item-card";
import { MarketPricePicker } from "./market-price-picker";
import { NnnEssences } from "./nnn-essences";
import { PurchaseItemWorkbench } from "./purchase-item-workbench";

function methodKey(method: CraftingMethod) {
    return method.kind === "fossils"
        ? `fossils:${method.ids.join(",")}`
        : `${method.kind}:${"id" in method ? method.id : JSON.stringify(method)}`;
}

export function GraphPriceInput({
    value,
    currency,
    onChange,
    label,
}: {
    value: CraftingPrice | null;
    currency: string;
    onChange: (price: CraftingPrice | null) => void;
    label: string;
}) {
    return (
        <Label className="block space-y-1 text-xs">
            {label} ({currency})
            <Input
                className={graphControl}
                type="number"
                min="0"
                step="any"
                placeholder="Unknown"
                value={value?.amount ?? ""}
                onChange={(event) =>
                    onChange(
                        event.target.value === ""
                            ? null
                            : {
                                  amount: Number(event.target.value),
                                  currency,
                                  source: "manual",
                                  confidence: null,
                              },
                    )
                }
            />
            <span className="block text-muted-foreground">
                {value?.source === "market"
                    ? `Market estimate · ${value.observedAt ? new Date(value.observedAt).toLocaleString() : "unknown observation time"} · ${value.confidence === null ? "unknown confidence" : `${(value.confidence * 100).toFixed(0)}% data confidence`} · edit to override`
                    : value
                      ? "Manual price"
                      : "Unpriced; excluded from a complete cost estimate"}
            </span>
            {value?.source === "market" && decodeCraftingSourceReference(value.cohortId) && (
                <span className="block text-muted-foreground">
                    poe.ninja listing estimate · time shown is retrieval time · complete recipe
                    includes the selected rare-beast assumption where applicable · historical source
                    unavailable
                </span>
            )}
            {value?.source === "market" &&
                decodeExchangePriceReference(value.cohortId)?.window === "adaptive-v1" && (
                    <span className="block text-muted-foreground">
                        Adaptive exchange: 1-, 6- or 24-hour estimate. Time shown is the latest
                        observation.
                    </span>
                )}
            {value?.source === "market" &&
                decodeCohortPriceReference(value.cohortId)?.window === "adaptive-v1" && (
                    <span className="block text-muted-foreground">
                        Adaptive equipment: 1-, 6- or 24-hour estimate. Time shown is the latest
                        observation.
                    </span>
                )}
            {value?.source === "market" &&
                decodeCohortPriceReference(value.cohortId)?.assumption ===
                    "display-equivalent-v1" && (
                    <span className="block text-muted-foreground">
                        Donor-family assumption: this configured item represents the purchase.
                        Actual modifier identity and crafting eligibility may differ.
                    </span>
                )}
        </Label>
    );
}

export function GraphDestinationEditor({
    value,
    graph,
    onChange,
}: {
    value: GraphDestination;
    graph: CraftingGraph;
    onChange: (destination: GraphDestination) => void;
}) {
    const choices: { label: string; destination: GraphDestination }[] = [
        { label: "Pass item forward", destination: { kind: "return" } },
        { label: "Discard / excluded recovery", destination: { kind: "discard" } },
        {
            label: "Sell",
            destination: { kind: "sell", price: value.kind === "sell" ? value.price : null },
        },
        ...graph.outcomes.map((outcome) => ({
            label: `Finish: ${outcome.name}`,
            destination: { kind: "terminal" as const, outcomeId: outcome.id },
        })),
        ...graph.nodes.flatMap((node) =>
            node.kind === "craft"
                ? node.inputs.map((input) => ({
                      label: `Recover → ${node.name} / ${input.name}`,
                      destination: { kind: "recover" as const, nodeId: node.id, inputId: input.id },
                  }))
                : [],
        ),
    ];
    return (
        <div className="space-y-2">
            <Label className="block text-xs">
                Route result
                <FormSelect
                    className={graphControl}
                    value={JSON.stringify(value)}
                    onValueChange={(selectedValue) =>
                        onChange(
                            choices.find(
                                (choice) => JSON.stringify(choice.destination) === selectedValue,
                            )!.destination,
                        )
                    }
                >
                    {choices.map((choice) => (
                        <FormSelectItem
                            key={JSON.stringify(choice.destination)}
                            value={JSON.stringify(choice.destination)}
                        >
                            {choice.label}
                        </FormSelectItem>
                    ))}
                </FormSelect>
            </Label>
            {value.kind === "sell" && (
                <GraphPriceInput
                    label="Sale revenue"
                    currency={graph.currency}
                    value={value.price}
                    onChange={(price) => onChange({ ...value, price })}
                />
            )}
        </div>
    );
}

export function GraphNodeEditor({
    graph,
    node,
    engine,
    ruleset,
    onChange,
    result,
    onError,
    initialSection = "step",
}: {
    graph: CraftingGraph;
    node: GraphNode;
    engine: CraftingEngine;
    ruleset: CraftingRuleset;
    onChange: (graph: CraftingGraph) => void;
    result?: CraftingGraphResult;
    onError: (error: unknown) => void;
    initialSection?: "step" | "outcomes";
}) {
    const editorRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const target =
            initialSection === "outcomes"
                ? editor.querySelector<HTMLElement>(
                      node.kind === "craft" ? "[data-route-editor]" : "[data-output-editor]",
                  )
                : editor;
        if (target instanceof HTMLDetailsElement) target.open = true;
        target?.scrollIntoView?.({ block: "nearest" });
    }, [initialSection, node.kind]);
    const uid = useId();
    const bases = useMemo(
        () =>
            craftingItemOptions(engine.catalog).filter((option) =>
                engine.catalog.bases[option.id]!.rarities.includes("normal"),
            ),
        [engine],
    );
    const update = (next: GraphNode) =>
        onChange({
            ...graph,
            nodes: graph.nodes.map((entry) => (entry.id === node.id ? next : entry)),
        });
    const methods = useMemo(() => {
        const data = engine.catalog.crafting;
        const options: { method: CraftingMethod; label: string }[] = [
            ...data.currencies.map((entry) => ({
                method: { kind: "currency" as const, id: entry.id },
                label: entry.name,
            })),
            ...[...data.essences, ...data.poe2Essences].map((entry) => ({
                method: { kind: "essence" as const, id: entry.id },
                label: entry.name,
            })),
            ...data.bench.map((entry) => ({
                method: { kind: "bench" as const, id: entry.id },
                label: `Bench · ${engine.methodName({ kind: "bench", id: entry.id })}`,
            })),
            ...data.harvest.map((entry) => ({
                method: { kind: "harvest" as const, id: entry.id },
                label: `Harvest · ${entry.name}`,
            })),
            { method: { kind: "recombine", id: "recombine" }, label: "Recombine two items" },
            { method: { kind: "socket_jewel", id: "socket_jewel" }, label: "Socket Jewel" },
            { method: { kind: "remove_jewel", id: "remove_jewel" }, label: "Remove Jewel" },
        ];
        if (
            node.kind === "craft" &&
            !options.some((entry) => methodKey(entry.method) === methodKey(node.method))
        )
            options.unshift({ method: node.method, label: engine.methodName(node.method) });
        return options
            .filter((entry) => rulesetAllowsMethod(ruleset, entry.method))
            .map((entry) => ({
                ...entry,
                id: methodKey(entry.method),
                itemId: "id" in entry.method ? entry.method.id : undefined,
            }));
    }, [engine, ruleset, node]);
    const reorder = (from: number, to: number) => {
        if (
            node.kind !== "craft" ||
            from < 0 ||
            from >= node.branches.length ||
            to < 0 ||
            to >= node.branches.length
        )
            return;
        const branches = [...node.branches];
        branches.splice(to, 0, branches.splice(from, 1)[0]!);
        update({ ...node, ordering: "manual", branches });
    };
    return (
        <section
            ref={editorRef}
            aria-label="Selected step editor"
            className="space-y-5 rounded-lg border border-border bg-card p-4"
        >
            <div className="flex items-center gap-2">
                <Label className="block min-w-0 flex-1 text-xs">
                    Step name
                    <Input
                        key={node.name}
                        defaultValue={node.name}
                        className={graphControl}
                        onBlur={(event) => {
                            if (event.target.value.trim() && event.target.value !== node.name)
                                update({ ...node, name: event.target.value });
                        }}
                    />
                </Label>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                        try {
                            onChange(removeGraphNode(graph, node.id));
                        } catch (error) {
                            onError(error);
                        }
                    }}
                >
                    Remove step
                </Button>
            </div>
            <Button
                variant="outline"
                aria-pressed={graph.entry === node.id}
                onClick={() => onChange({ ...graph, entry: node.id })}
            >
                Use this as the final production step
            </Button>
            {node.kind === "acquire" ? (
                <>
                    <Label className="block text-xs">
                        Acquisition choice
                        <FormSelect
                            className={graphControl}
                            value={
                                node.choice.mode === "automatic"
                                    ? "automatic"
                                    : node.choice.alternativeId
                            }
                            onValueChange={(selectedValue) =>
                                update({
                                    ...node,
                                    choice:
                                        selectedValue === "automatic"
                                            ? { mode: "automatic" }
                                            : { mode: "pinned", alternativeId: selectedValue },
                                })
                            }
                        >
                            <FormSelectItem value="automatic">
                                Automatic · lowest known expected cost
                            </FormSelectItem>
                            {node.alternatives.map((entry) => (
                                <FormSelectItem key={entry.id} value={entry.id}>
                                    Pin: {entry.name}
                                </FormSelectItem>
                            ))}
                        </FormSelect>
                    </Label>
                    {node.alternatives.map((alternative) => {
                        const estimate = result?.acquisitions[node.id]?.alternatives.find(
                            (entry) => entry.id === alternative.id,
                        );
                        const set = (next: typeof alternative) =>
                            update({
                                ...node,
                                alternatives: node.alternatives.map((entry) =>
                                    entry.id === alternative.id ? next : entry,
                                ),
                            });
                        return (
                            <div
                                key={alternative.id}
                                className="space-y-3 rounded border border-border p-3"
                            >
                                <div className="flex justify-between gap-2">
                                    <h3 className="text-sm font-medium">{alternative.name}</h3>
                                    {node.alternatives.length > 1 && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                                update({
                                                    ...node,
                                                    choice: { mode: "automatic" },
                                                    alternatives: node.alternatives.filter(
                                                        (entry) => entry.id !== alternative.id,
                                                    ),
                                                })
                                            }
                                        >
                                            Remove alternative
                                        </Button>
                                    )}
                                </div>
                                {alternative.kind === "purchase" ? (
                                    <>
                                        <PurchaseItemWorkbench
                                            graph={graph}
                                            nodeId={node.id}
                                            alternativeId={alternative.id}
                                            item={alternative.item}
                                            catalog={engine.catalog}
                                            onChange={onChange}
                                        />
                                        <CatalogPicker
                                            id={`${uid}-${alternative.id}-base`}
                                            label="Purchased base"
                                            options={bases}
                                            value={bases.find(
                                                (entry) => entry.id === alternative.item.baseId,
                                            )}
                                            onSelect={(baseId) => {
                                                try {
                                                    set({
                                                        ...alternative,
                                                        item: engine.createItem(
                                                            baseId,
                                                            alternative.item.level,
                                                        ),
                                                    });
                                                } catch (error) {
                                                    onError(error);
                                                }
                                            }}
                                        />
                                        <Label className="block text-xs">
                                            Purchased item level
                                            <Input
                                                type="number"
                                                min="1"
                                                max="100"
                                                className={graphControl}
                                                value={alternative.item.level}
                                                onChange={(event) =>
                                                    set({
                                                        ...alternative,
                                                        item: {
                                                            ...alternative.item,
                                                            level: Number(event.target.value),
                                                        },
                                                    })
                                                }
                                            />
                                        </Label>
                                        <Label className="block text-xs">
                                            Purchased item rarity
                                            <FormSelect
                                                className={graphControl}
                                                value={alternative.item.rarity}
                                                onValueChange={(selectedValue) =>
                                                    set({
                                                        ...alternative,
                                                        item: {
                                                            ...alternative.item,
                                                            rarity: selectedValue as typeof alternative.item.rarity,
                                                        },
                                                    })
                                                }
                                            >
                                                <FormSelectItem value="normal">
                                                    Normal
                                                </FormSelectItem>
                                                <FormSelectItem value="magic">Magic</FormSelectItem>
                                                <FormSelectItem value="rare">Rare</FormSelectItem>
                                            </FormSelect>
                                        </Label>
                                        <GraphPriceInput
                                            label="Purchase price"
                                            currency={graph.currency}
                                            value={
                                                graph.prices[
                                                    `purchase:${node.id}:${alternative.id}`
                                                ] ?? alternative.price
                                            }
                                            onChange={(price) => {
                                                const prices = { ...graph.prices };
                                                delete prices[
                                                    `purchase:${node.id}:${alternative.id}`
                                                ];
                                                onChange({
                                                    ...graph,
                                                    prices,
                                                    nodes: graph.nodes.map((entry) =>
                                                        entry.id === node.id
                                                            ? {
                                                                  ...node,
                                                                  alternatives:
                                                                      node.alternatives.map(
                                                                          (entry) =>
                                                                              entry.id ===
                                                                              alternative.id
                                                                                  ? {
                                                                                        ...alternative,
                                                                                        price,
                                                                                    }
                                                                                  : entry,
                                                                      ),
                                                              }
                                                            : entry,
                                                    ),
                                                });
                                            }}
                                        />
                                        <MarketPricePicker
                                            engine={engine}
                                            item={alternative.item}
                                            requirements={node.output}
                                            league={graph.league}
                                            currency={graph.currency}
                                            price={
                                                graph.prices[
                                                    `purchase:${node.id}:${alternative.id}`
                                                ] ?? alternative.price
                                            }
                                            onLeagueChange={(league) =>
                                                onChange({ ...graph, league: league || undefined })
                                            }
                                            onSelect={(candidate) => {
                                                try {
                                                    onChange(
                                                        bindCohortPurchasePrice(
                                                            graph,
                                                            engine,
                                                            node.id,
                                                            alternative.id,
                                                            candidate,
                                                        ),
                                                    );
                                                } catch (error) {
                                                    onError(error);
                                                }
                                            }}
                                        />
                                        <ItemCard
                                            engine={engine}
                                            item={alternative.item}
                                            label="Purchased item"
                                            onChange={(item) => set({ ...alternative, item })}
                                        />
                                        <NnnEssences
                                            engine={engine}
                                            item={alternative.item}
                                            prices={Object.fromEntries(
                                                Object.entries(graph.prices)
                                                    .filter(
                                                        ([, price]) =>
                                                            price.currency === graph.currency,
                                                    )
                                                    .map(([id, price]) => [id, price.amount]),
                                            )}
                                            currency={graph.currency}
                                            priceControls={(sources) => (
                                                <ExchangePricePicker
                                                    graph={graph}
                                                    entries={sources.map((source) => [
                                                        source.id,
                                                        source.name,
                                                    ])}
                                                    onChange={onChange}
                                                />
                                            )}
                                            onSelect={(id) => {
                                                const stepId = crypto.randomUUID();
                                                onChange({
                                                    ...graph,
                                                    entry: stepId,
                                                    nodes: [
                                                        ...graph.nodes.map((entry) =>
                                                            entry.id === node.id
                                                                ? {
                                                                      ...node,
                                                                      choice: {
                                                                          mode: "pinned" as const,
                                                                          alternativeId:
                                                                              alternative.id,
                                                                      },
                                                                  }
                                                                : entry,
                                                        ),
                                                        {
                                                            id: stepId,
                                                            name: engine.methodName({
                                                                kind: "essence",
                                                                id,
                                                            }),
                                                            kind: "craft",
                                                            method: { kind: "essence", id },
                                                            inputs: [
                                                                {
                                                                    id: "item",
                                                                    name: "Base",
                                                                    source: node.id,
                                                                },
                                                            ],
                                                            output: itemQuerySchema.parse({
                                                                game: graph.game,
                                                            }),
                                                            branches: [],
                                                            ordering: "automatic",
                                                            fallback: { kind: "return" },
                                                        },
                                                    ],
                                                });
                                            }}
                                        />
                                    </>
                                ) : (
                                    <Label className="block text-xs">
                                        Produce using
                                        <FormSelect
                                            className={graphControl}
                                            value={alternative.nodeId}
                                            onValueChange={(selectedValue) =>
                                                set({ ...alternative, nodeId: selectedValue })
                                            }
                                        >
                                            {graph.nodes
                                                .filter((entry) => entry.id !== node.id)
                                                .map((entry) => (
                                                    <FormSelectItem key={entry.id} value={entry.id}>
                                                        {entry.name}
                                                    </FormSelectItem>
                                                ))}
                                        </FormSelect>
                                    </Label>
                                )}
                                {estimate && (
                                    <p className="text-xs text-muted-foreground">
                                        {estimate.expectedCost === null
                                            ? "Cost unresolved"
                                            : `${estimate.expectedCost.toFixed(2)} ${graph.currency}`}{" "}
                                        ·{" "}
                                        {estimate.guaranteed
                                            ? "Guaranteed purchase"
                                            : "Estimated crafting cost"}{" "}
                                        · {estimate.expectedActions ?? "?"} expected actions
                                    </p>
                                )}
                            </div>
                        );
                    })}
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={graph.nodes.length < 2}
                        onClick={() =>
                            update({
                                ...node,
                                alternatives: [
                                    ...node.alternatives,
                                    {
                                        kind: "production",
                                        id: crypto.randomUUID(),
                                        name: "Craft this input",
                                        nodeId: graph.nodes.find((entry) => entry.id !== node.id)!
                                            .id,
                                    },
                                ],
                            })
                        }
                    >
                        Compare a crafting route
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={
                            !node.alternatives.some(
                                (alternative) => alternative.kind === "purchase",
                            )
                        }
                        onClick={() => {
                            const source = node.alternatives.find(
                                (alternative) => alternative.kind === "purchase",
                            );
                            if (source)
                                update({
                                    ...node,
                                    alternatives: [
                                        ...node.alternatives,
                                        {
                                            ...structuredClone(source),
                                            id: crypto.randomUUID(),
                                            name: `Purchase option ${node.alternatives.length + 1}`,
                                            price: null,
                                        },
                                    ],
                                });
                        }}
                    >
                        Compare another purchase
                    </Button>
                </>
            ) : (
                <>
                    <CatalogPicker
                        id={`${uid}-method`}
                        label="Crafting method"
                        options={methods}
                        value={methods.find((entry) => entry.id === methodKey(node.method))}
                        onSelect={(id) => {
                            const method = methods.find((entry) => entry.id === id)!.method;
                            try {
                                onChange(
                                    replaceGraphMethod(engine, ruleset, {
                                        graph,
                                        nodeId: node.id,
                                        expectedMethod: node.method,
                                        method,
                                    }),
                                );
                            } catch (error) {
                                onError(error);
                            }
                        }}
                    />
                    <GraphMethodEditor
                        key={node.id}
                        graph={graph}
                        node={node}
                        engine={engine}
                        onChange={onChange}
                    />
                    {rulesetAllowsConditionalSteps(ruleset) && (
                        <div className="space-y-3 rounded border border-border p-3">
                            <Label className="flex gap-2 text-sm">
                                <Checkbox
                                    checked={Boolean(node.applyWhen)}
                                    onCheckedChange={(checked) =>
                                        update({
                                            ...node,
                                            applyWhen: checked
                                                ? itemQuerySchema.parse({ game: graph.game })
                                                : undefined,
                                        })
                                    }
                                />
                                Only apply when the first input matches
                            </Label>
                            {node.applyWhen && (
                                <>
                                    <p className="text-xs text-muted-foreground">
                                        Otherwise, route the first item unchanged without spending
                                        currency or acquiring a second input. Unknown matches stop
                                        the estimate. Result routes and output requirements still
                                        apply.
                                    </p>
                                    <GraphQueryEditor
                                        label="Apply condition"
                                        ruleset={graph.ruleset}
                                        catalog={engine.catalog}
                                        value={node.applyWhen}
                                        onChange={(applyWhen) => update({ ...node, applyWhen })}
                                    />
                                </>
                            )}
                            {result && (result.visits[node.id]?.skipped ?? 0) > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    Skipped {result.visits[node.id]!.skipped} times in{" "}
                                    {result.trials} trials.
                                </p>
                            )}
                        </div>
                    )}
                    {node.method.kind === "recombine" && (
                        <p className="text-xs text-muted-foreground">
                            Uses the retained empirical count model. Ordinary modifier copies have
                            equal selection weight; with an exclusive modifier, selection uses
                            extracted weights. Non-native modifiers count toward the pool but cannot
                            survive on an ineligible base. These are modeled probabilities.
                        </p>
                    )}
                    {(node.method.kind === "currency" || node.method.kind === "essence") &&
                        ruleset.availability.allflame && (
                            <Label className="flex gap-2 text-xs">
                                <Checkbox
                                    checked={Boolean(node.method.allflame)}
                                    onCheckedChange={(checked) => {
                                        if (
                                            node.method.kind !== "currency" &&
                                            node.method.kind !== "essence"
                                        )
                                            return;
                                        update({
                                            ...node,
                                            method: {
                                                ...node.method,
                                                allflame: checked ? true : undefined,
                                            },
                                        });
                                    }}
                                />
                                Use Allflame variant where supported
                            </Label>
                        )}
                    {node.inputs.map((port) => (
                        <details key={port.id} open className="rounded border border-border p-3">
                            <summary className="text-sm font-medium">
                                {port.name} · consumed by this step
                            </summary>
                            <Label className="mt-2 block text-xs">
                                Item source
                                <FormSelect
                                    className={graphControl}
                                    value={port.source}
                                    onValueChange={(selectedValue) => {
                                        try {
                                            onChange(
                                                connectGraphInput(
                                                    graph,
                                                    node.id,
                                                    port.id,
                                                    selectedValue,
                                                ),
                                            );
                                        } catch (error) {
                                            onError(error);
                                        }
                                    }}
                                >
                                    {graph.nodes
                                        .filter((entry) => entry.id !== node.id)
                                        .map((entry) => (
                                            <FormSelectItem key={entry.id} value={entry.id}>
                                                {entry.name}
                                            </FormSelectItem>
                                        ))}
                                </FormSelect>
                            </Label>
                            <div className="mt-3">
                                <GraphQueryEditor
                                    label={`${port.name} requirements`}
                                    ruleset={graph.ruleset}
                                    catalog={engine.catalog}
                                    value={
                                        port.query ?? itemQuerySchema.parse({ game: graph.game })
                                    }
                                    onChange={(query) =>
                                        update({
                                            ...node,
                                            inputs: node.inputs.map((entry) =>
                                                entry.id === port.id ? { ...entry, query } : entry,
                                            ),
                                        })
                                    }
                                />
                            </div>
                        </details>
                    ))}
                    <div className="flex items-center justify-between" data-route-editor>
                        <h3 className="text-sm font-semibold">Result routes</h3>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => update({ ...node, ordering: "automatic" })}
                        >
                            {node.ordering === "automatic"
                                ? "Automatic ordering"
                                : "Restore automatic order"}
                        </Button>
                    </div>
                    {node.branches.map((branch, index) => (
                        <details
                            key={branch.id}
                            className="rounded border border-border p-3"
                            draggable
                            onDragStart={(event) =>
                                event.dataTransfer.setData("text/plain", String(index))
                            }
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                                event.preventDefault();
                                const from = Number(event.dataTransfer.getData("text/plain"));
                                if (Number.isInteger(from)) reorder(from, index);
                            }}
                        >
                            <summary className="cursor-pointer text-sm">
                                {index + 1}. {branch.name}
                            </summary>
                            <div className="mt-3 space-y-3">
                                <Input
                                    key={branch.name}
                                    className={graphControl}
                                    aria-label="Branch name"
                                    defaultValue={branch.name}
                                    onBlur={(event) => {
                                        if (event.target.value.trim())
                                            update({
                                                ...node,
                                                branches: node.branches.map((entry) =>
                                                    entry.id === branch.id
                                                        ? { ...entry, name: event.target.value }
                                                        : entry,
                                                ),
                                            });
                                    }}
                                />
                                <GraphQueryEditor
                                    label="Matching result"
                                    ruleset={graph.ruleset}
                                    value={branch.query}
                                    catalog={engine.catalog}
                                    onChange={(query) =>
                                        update({
                                            ...node,
                                            branches: node.branches.map((entry) =>
                                                entry.id === branch.id
                                                    ? { ...entry, query }
                                                    : entry,
                                            ),
                                        })
                                    }
                                />
                                <GraphDestinationEditor
                                    graph={graph}
                                    value={branch.destination}
                                    onChange={(destination) =>
                                        update({
                                            ...node,
                                            branches: node.branches.map((entry) =>
                                                entry.id === branch.id
                                                    ? { ...entry, destination }
                                                    : entry,
                                            ),
                                        })
                                    }
                                />
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!index}
                                        onClick={() => reorder(index, index - 1)}
                                    >
                                        Move up
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={index === node.branches.length - 1}
                                        onClick={() => reorder(index, index + 1)}
                                    >
                                        Move down
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                            update({
                                                ...node,
                                                branches: node.branches.filter(
                                                    (entry) => entry.id !== branch.id,
                                                ),
                                            })
                                        }
                                    >
                                        Remove route
                                    </Button>
                                </div>
                            </div>
                        </details>
                    ))}
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            update({
                                ...node,
                                branches: [
                                    ...node.branches,
                                    {
                                        id: crypto.randomUUID(),
                                        name: `Result ${node.branches.length + 1}`,
                                        query: itemQuerySchema.parse({ game: graph.game }),
                                        destination: { kind: "return" },
                                    },
                                ],
                            })
                        }
                    >
                        Add result route
                    </Button>
                    <div className="space-y-2 border-t border-border pt-3">
                        <p className="text-xs font-medium">All other results</p>
                        <GraphDestinationEditor
                            graph={graph}
                            value={node.fallback}
                            onChange={(fallback) => update({ ...node, fallback })}
                        />
                    </div>
                </>
            )}
            <details className="border-t border-border pt-3" data-output-editor>
                <summary className="cursor-pointer text-sm">Output requirements</summary>
                <div className="mt-3">
                    <GraphQueryEditor
                        label="Output item"
                        ruleset={graph.ruleset}
                        value={node.output}
                        catalog={engine.catalog}
                        onChange={(output) => update({ ...node, output })}
                    />
                    <GraphTradeSearch
                        query={node.output}
                        catalog={engine.catalog}
                        league={graph.league}
                        onLeagueChange={(league) =>
                            onChange({ ...graph, league: league || undefined })
                        }
                    />
                </div>
            </details>
        </section>
    );
}
