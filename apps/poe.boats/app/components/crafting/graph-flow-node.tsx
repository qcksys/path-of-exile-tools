import { Handle, type Node, type NodeProps, Position, useUpdateNodeInternals } from "@xyflow/react";
import { useEffect } from "react";
import { CatalogItemArt } from "~/components/item-art";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { CraftingEngine } from "~/lib/crafting-engine";
import {
    graphBranchChance,
    graphDestinationText,
    graphPreviewItem,
    graphQueryText,
} from "~/lib/crafting-graph-presentation";
import { cn } from "~/lib/utils";
import type { CraftingGraph, GraphNode, GraphOutcome } from "~/schemas/crafting-graph";
import type { CraftingGraphResult } from "~/schemas/crafting-graph-result";
import { ItemCardPopover } from "./item-card-popover";

export type CraftingFlowNode = Node<
    {
        graph: CraftingGraph;
        engine: CraftingEngine;
        step?: GraphNode;
        outcome?: GraphOutcome;
        result?: CraftingGraphResult;
        active: boolean;
        select: () => void;
    },
    "crafting"
>;

export function FlowStep({ id, data }: NodeProps<CraftingFlowNode>) {
    const { engine, graph, step, outcome, result } = data;
    const update = useUpdateNodeInternals();
    useEffect(() => update(id), [id, step, update]);
    if (outcome) {
        const observed = result?.outcomes.find((entry) => entry.id === outcome.id);
        const sample = result?.samples.find((entry) => entry.outcomeId === outcome.id)?.item;
        return (
            <div
                className={cn(
                    "w-80 rounded-lg border-2 bg-card p-4 shadow-md",
                    outcome.success ? "border-emerald-500/60" : "border-rose-500/60",
                )}
            >
                <Handle type="target" position={Position.Left} id="outcome" />
                <Badge variant="outcome">
                    {outcome.success ? "Positive outcome" : "Negative outcome"}
                </Badge>
                <ItemCardPopover
                    engine={engine}
                    item={
                        sample ??
                        (() =>
                            graphPreviewItem(
                                engine,
                                {
                                    ...graph,
                                    nodes: graph.nodes.map((node) =>
                                        node.id === graph.entry
                                            ? { ...node, output: outcome.query }
                                            : node,
                                    ),
                                },
                                graph.entry,
                            ))
                    }
                    label={`Outcome: ${outcome.name}`}
                    note={
                        sample
                            ? "Sampled final item from a completed trial."
                            : "Target illustration; calculate for actual final items."
                    }
                >
                    <span className="my-2 font-semibold">{outcome.name}</span>
                </ItemCardPopover>
                <p className="font-mono text-xs">
                    {observed?.probability == null
                        ? "Chance not calculated"
                        : `${(observed.probability * 100).toFixed(1)}% of trials`}{" "}
                    · {outcome.disposition}
                </p>
                {outcome.disposition === "sell" && (
                    <p className="text-xs">
                        Sale:{" "}
                        {outcome.price
                            ? `${outcome.price.amount} ${outcome.price.currency}`
                            : "price unknown"}
                    </p>
                )}
                <QueryLines lines={graphQueryText(engine, outcome.query)} />
            </div>
        );
    }
    if (!step) return <span className="block size-px" aria-hidden="true" />;
    const ports =
        step.kind === "craft"
            ? step.inputs
            : step.alternatives.filter((option) => option.kind === "production");
    const sample = result?.samples.find((sample) => sample.nodeItems?.[step.id])?.nodeItems?.[
        step.id
    ];
    const baseId =
        sample?.baseId ??
        (step.kind === "acquire"
            ? step.alternatives.find((option) => option.kind === "purchase")?.item.baseId
            : undefined);
    const estimate = result?.estimates.find((entry) => entry.nodeId === id);
    const branches =
        step.kind === "craft"
            ? [
                  ...step.branches,
                  { id: "fallback", name: "All other results", destination: step.fallback },
              ]
            : [];
    return (
        <div
            className={cn(
                "w-80 rounded-lg border-t-4 border bg-card shadow-md",
                step.kind === "acquire" ? "border-chart-1/60" : "border-chart-2/60",
                data.active && "ring-2 ring-primary/50",
            )}
        >
            <div className="flex items-center justify-between border-b px-3 py-2">
                <Badge variant={step.kind === "acquire" ? "acquisition" : "craft"}>
                    {step.kind === "acquire" ? "Acquisition" : "Craft"}
                </Badge>
                {graph.entry === id && <Badge variant="outcome">Final step</Badge>}
                <Button
                    size="sm"
                    variant="ghost"
                    className="nodrag h-6 text-xs"
                    onClick={data.select}
                    aria-label={`Edit ${step.name}`}
                >
                    Edit
                </Button>
            </div>
            <ItemCardPopover
                engine={engine}
                item={sample ?? (() => graphPreviewItem(engine, graph, id))}
                label={step.name}
                note={
                    sample
                        ? "Sampled item from a trial at this step; other results can differ."
                        : step.kind === "acquire"
                          ? "Prepared purchase. Price is independent of the modifier rolls."
                          : "Target illustration at minimum rolls. Only explicit required modifiers are shown; unspecified properties and other rolls can vary. Calculate for actual sampled items."
                }
            >
                {baseId && (
                    <CatalogItemArt id={baseId} game={graph.game} className="size-9 shrink-0" />
                )}
                <span className="py-1 font-semibold">{step.name}</span>
            </ItemCardPopover>
            {ports.map((port, index) => (
                <Handle
                    key={port.id}
                    type="target"
                    id={port.id}
                    position={Position.Left}
                    style={{ top: 60 + index * 24 }}
                    isConnectable={step.kind === "craft"}
                    aria-label={`${step.name} ${port.name}`}
                />
            ))}
            {ports.map((port, index) => (
                <Handle
                    key={`recovery-${port.id}`}
                    type="target"
                    id={`recovery-${port.id}`}
                    position={Position.Bottom}
                    style={{ left: 30 + index * 24 }}
                    isConnectable={false}
                />
            ))}
            <Handle type="source" id="item" position={Position.Right} />
            <Handle
                type="source"
                id="retry"
                position={Position.Bottom}
                style={{ left: "85%" }}
                isConnectable={false}
            />
            <Handle
                type="target"
                id="restart"
                position={Position.Bottom}
                style={{ left: "50%" }}
                isConnectable={false}
            />
            <div className="space-y-2 border-t px-3 py-2 text-xs">
                {step.kind === "craft" ? (
                    <>
                        <p className="font-medium text-chart-2">{engine.methodName(step.method)}</p>
                        {step.inputs.map((input) => (
                            <div key={input.id}>
                                <b>{input.name}</b>:{" "}
                                {graph.nodes.find((node) => node.id === input.source)?.name}
                                {input.query && (
                                    <QueryLines lines={graphQueryText(engine, input.query)} />
                                )}
                            </div>
                        ))}
                        {Object.entries(step.method)
                            .filter(([key]) => !["kind", "id"].includes(key))
                            .map(([key, value]) => (
                                <p key={key}>
                                    <b>{key.replace(/([A-Z])/g, " $1")}</b>:{" "}
                                    {settingText(engine, value)}
                                </p>
                            ))}
                        {step.applyWhen && (
                            <div>
                                <b>Apply only when</b>
                                <QueryLines lines={graphQueryText(engine, step.applyWhen)} />
                            </div>
                        )}
                        <p className="text-muted-foreground">Branch order: {step.ordering}</p>
                    </>
                ) : (
                    <>
                        <p className="text-muted-foreground">
                            {step.choice.mode === "automatic"
                                ? "Compare acquisition costs"
                                : `Selected: ${step.alternatives.find((option) => step.choice.mode === "pinned" && option.id === step.choice.alternativeId)?.name}`}
                        </p>
                        {step.alternatives.map((option) => (
                            <p key={option.id}>
                                {option.name}:{" "}
                                {option.kind === "production"
                                    ? "Produced upstream"
                                    : option.price
                                      ? `${option.price.amount} ${option.price.currency}`
                                      : "price unknown"}
                            </p>
                        ))}
                    </>
                )}
                {step.output.groups.length > 0 && (
                    <div>
                        <b>Required output</b>
                        <QueryLines lines={graphQueryText(engine, step.output)} />
                    </div>
                )}
                {branches.length > 0 && (
                    <div className="space-y-2 border-t pt-2">
                        {branches.map((branch) => {
                            const chance = graphBranchChance(result, id, branch.id);
                            const tone =
                                branch.destination.kind === "return" ||
                                (branch.destination.kind === "terminal" &&
                                    graph.outcomes.some(
                                        (outcome) =>
                                            branch.destination.kind === "terminal" &&
                                            outcome.id === branch.destination.outcomeId &&
                                            outcome.success,
                                    ))
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : ["discard", "sell"].includes(branch.destination.kind)
                                      ? "text-rose-600 dark:text-rose-400"
                                      : "text-amber-700 dark:text-amber-400";
                            return (
                                <div
                                    key={branch.id}
                                    className="border-l-2 border-current pl-2"
                                    data-graph-branch={branch.id}
                                >
                                    <p
                                        className={cn(
                                            "flex justify-between gap-2 font-semibold",
                                            tone,
                                        )}
                                    >
                                        <span>{branch.name}</span>
                                        <span className="shrink-0 font-mono">
                                            {chance === null
                                                ? "?"
                                                : `${(chance * 100).toFixed(1)}%`}
                                        </span>
                                    </p>
                                    <p className="text-muted-foreground">
                                        {graphDestinationText(graph, branch.destination)}
                                    </p>
                                    {"query" in branch && (
                                        <QueryLines lines={graphQueryText(engine, branch.query)} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="border-t px-3 py-2 font-mono text-xs text-muted-foreground">
                {estimate?.expectedCost == null
                    ? estimate
                        ? "Cost unknown · missing prices"
                        : "Cost not calculated"
                    : `${estimate.expectedCost.toFixed(2)} ${graph.currency} / item`}
                {result?.visits[id] && ` · ${result.visits[id].visits} visits`}
            </div>
        </div>
    );
}

function settingText(engine: CraftingEngine, value: unknown): string {
    if (Array.isArray(value)) return value.map((entry) => settingText(engine, entry)).join(", ");
    if (value && typeof value === "object")
        return Object.entries(value)
            .map(
                ([key, entry]) =>
                    `${key.replace(/([A-Z])/g, " $1")}: ${settingText(engine, entry)}`,
            )
            .join("; ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return typeof value === "string"
        ? engine.catalog.mods[value]?.name || engine.catalog.bases[value]?.name || value
        : String(value ?? "None");
}

function QueryLines({ lines }: { lines: string[] }) {
    return (
        <ul className="space-y-1 break-words text-[11px] leading-relaxed text-muted-foreground">
            {lines.map((line, index) => (
                <li key={`${index}:${line}`}>{line}</li>
            ))}
        </ul>
    );
}
