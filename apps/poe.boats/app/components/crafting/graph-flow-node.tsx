import { Handle, type Node, type NodeProps, Position, useUpdateNodeInternals } from "@xyflow/react";
import { GitBranchIcon, PencilIcon, XIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useMemo } from "react";
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
import { modifierLevelText } from "~/lib/crafting-modifier-details";
import { cleanModText, rolledModText } from "~/lib/crafting-text";
import { cn } from "~/lib/utils";
import type { CraftingGraph, GraphNode, GraphOutcome } from "~/schemas/crafting-graph";
import type { CraftingGraphResult } from "~/schemas/crafting-graph-result";
import { GraphHelp } from "./graph-help";
import { ItemCardPopover } from "./item-card-popover";

function GraphHandle({ help, ...props }: ComponentProps<typeof Handle> & { help: string }) {
    return (
        <GraphHelp content={help}>
            <Handle {...props} tabIndex={0} aria-label={props["aria-label"] ?? help} />
        </GraphHelp>
    );
}

export type CraftingFlowNode = Node<
    {
        graph: CraftingGraph;
        engine: CraftingEngine;
        step?: GraphNode;
        outcome?: GraphOutcome;
        result?: CraftingGraphResult;
        active: boolean;
        select: (section?: "step" | "outcomes") => void;
        editing?: boolean;
        editor?: ReactNode;
        close?: () => void;
    },
    "crafting"
>;

export function FlowStep({ id, data }: NodeProps<CraftingFlowNode>) {
    const { engine, graph, step, outcome, result } = data;
    const update = useUpdateNodeInternals();
    useEffect(() => update(id), [id, step, update, data.editing]);
    const stageItem = useMemo(
        () =>
            step
                ? (result?.samples.find((sample) => sample.nodeItems?.[step.id])?.nodeItems?.[
                      step.id
                  ] ?? graphPreviewItem(engine, graph, step.id))
                : null,
        [engine, graph, result, step],
    );
    const editor = data.editing && (
        <div className="nodrag nopan nowheel max-h-[360px] scroll-pt-12 overflow-y-auto border-t">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-3 py-2 text-sm font-semibold">
                Edit {step?.name ?? outcome?.name}
                <GraphHelp content="Close these editing controls. Changes are saved to your local project as you edit.">
                    <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Close node editor"
                        onClick={data.close}
                    >
                        <XIcon />
                    </Button>
                </GraphHelp>
            </div>
            {data.editor}
        </div>
    );
    if (outcome) {
        const observed = result?.outcomes.find((entry) => entry.id === outcome.id);
        const sample = result?.samples.find((entry) => entry.outcomeId === outcome.id)?.item;
        return (
            <div
                className={cn(
                    "w-80 rounded-lg border-2 bg-card p-4 shadow-md",
                    data.editing && "w-[520px]",
                    outcome.success ? "border-emerald-500/60" : "border-rose-500/60",
                )}
            >
                <GraphHandle
                    type="target"
                    position={Position.Left}
                    id="outcome"
                    isConnectable={false}
                    help="Terminal outcome: incoming lines show which crafts finish here. Use the edit icon to set item requirements, success status, disposition and sale price."
                />
                <Badge variant="outcome">
                    {outcome.success ? "Positive outcome" : "Negative outcome"}
                </Badge>
                <GraphHelp content="Edit this terminal outcome's item requirements, success status, disposition and sale price here in the graph.">
                    <Button
                        size="icon-sm"
                        variant="ghost"
                        className="nodrag float-right"
                        aria-label={`Edit outcome ${outcome.name}`}
                        onClick={() => data.select("outcomes")}
                    >
                        <PencilIcon />
                    </Button>
                </GraphHelp>
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
                {!data.editing && <QueryLines lines={graphQueryText(engine, outcome.query)} />}
                {editor}
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
                data.editing && "w-[520px]",
                step.kind === "acquire" ? "border-chart-1/60" : "border-chart-2/60",
                data.active && "ring-2 ring-primary/50",
            )}
        >
            <div className="flex cursor-grab items-center justify-between border-b px-3 py-2 active:cursor-grabbing">
                <Badge variant={step.kind === "acquire" ? "acquisition" : "craft"}>
                    {step.kind === "acquire" ? "Acquisition" : "Craft"}
                </Badge>
                {graph.entry === id && <Badge variant="outcome">Final step</Badge>}
                <GraphHelp content="Edit this step's item, craft, inputs and requirements directly inside this node.">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="nodrag h-6 text-xs"
                        onClick={() => data.select("step")}
                        aria-label={`Edit ${step.name}`}
                    >
                        <PencilIcon className="size-3" /> Edit
                    </Button>
                </GraphHelp>
                <GraphHelp
                    content={
                        step.kind === "craft"
                            ? "Specify outcomes for this craft: match item properties and choose whether to continue, recover, discard, sell or finish. Routes are checked in the configured order."
                            : "Specify which item properties this acquisition must supply and choose the final production step."
                    }
                >
                    <Button
                        size="icon-sm"
                        variant="ghost"
                        className="nodrag"
                        aria-label={`Edit outcomes for ${step.name}`}
                        onClick={() => data.select("outcomes")}
                    >
                        <GitBranchIcon />
                    </Button>
                </GraphHelp>
            </div>
            <ItemCardPopover
                engine={engine}
                item={() => stageItem}
                label={step.name}
                note={
                    sample
                        ? "Sampled item from a trial at this step; other results can differ."
                        : step.kind === "acquire"
                          ? "Prepared purchase. Price is independent of the modifier rolls."
                          : stageItem
                            ? "Target illustration at minimum rolls. Other modifiers can vary. Sampled items appear after the initial calculation."
                            : "Generating a sampled item for this stage. No modifier state is assumed before this step has been sampled."
                }
            >
                {baseId && (
                    <CatalogItemArt id={baseId} game={graph.game} className="size-9 shrink-0" />
                )}
                <span className="py-1 font-semibold">{step.name}</span>
            </ItemCardPopover>
            {stageItem && !data.editing && (
                <div className="border-t px-3 py-2 text-xs" data-stage-mods>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {sample
                            ? "Sampled item"
                            : step.kind === "acquire"
                              ? "Purchased item"
                              : "Target modifiers"}{" "}
                        · {stageItem.rarity}
                    </p>
                    {stageItem.mods.map((rolled, index) => {
                        const mod = engine.mod(rolled.id);
                        const text = cleanModText(
                            rolledModText(engine.catalog, rolled, stageItem) ??
                                mod.text ??
                                mod.name,
                        );
                        return (
                            <GraphHelp
                                key={`${rolled.id}:${index}`}
                                content={`${text}\n${mod.generation_type} · ${mod.name} · ${modifierLevelText(engine, rolled.id)}${rolled.essence || mod.is_essence_only ? " · Essence modifier" : ""}${rolled.crafted ? " · Bench crafted" : ""}\nRaw rolls: ${rolled.values.join(", ")}. Hover the item name for its full properties, modifier details and imprint.`}
                            >
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="nodrag block h-auto cursor-help p-0 text-left text-[11px] whitespace-pre-line text-[var(--item-mod)]"
                                >
                                    {text}
                                </Button>
                            </GraphHelp>
                        );
                    })}
                    {!stageItem.mods.length && (
                        <p className="text-muted-foreground">
                            No explicit modifiers at this stage.
                        </p>
                    )}
                    {stageItem.memoryStrands !== undefined && (
                        <GraphHelp content="Remaining memory strands on this sampled item. Strand spending since the stored imprint controls whether the helical recipe restores its checkpoint.">
                            <Button
                                type="button"
                                variant="ghost"
                                className="nodrag mt-1 block h-auto p-0 text-left text-[11px] text-muted-foreground"
                            >
                                Memory strands: {stageItem.memoryStrands}
                            </Button>
                        </GraphHelp>
                    )}
                </div>
            )}
            {ports.map((port, index) => (
                <GraphHandle
                    key={port.id}
                    type="target"
                    id={port.id}
                    position={Position.Left}
                    style={{ top: 60 + index * 24 }}
                    isConnectable={step.kind === "craft"}
                    aria-label={`${step.name} ${port.name}`}
                    help={`${port.name}: consumes an item from this connection. Drag a producing step's right connector here to change the source. Input requirements are checked before crafting.`}
                />
            ))}
            {ports.map((port, index) => (
                <GraphHandle
                    key={`recovery-${port.id}`}
                    type="target"
                    id={`recovery-${port.id}`}
                    position={Position.Bottom}
                    style={{ left: 30 + index * 24 }}
                    isConnectable={false}
                    help={`Recovery input: a surviving item is reused for ${port.name}, avoiding a fresh acquisition.`}
                />
            ))}
            <GraphHandle
                type="source"
                id="item"
                position={Position.Right}
                help="Item output: drag to another step's input to supply the item produced here. The outcome icon above edits how results are routed."
            />
            <GraphHandle
                type="source"
                id="retry"
                position={Position.Bottom}
                style={{ left: "85%" }}
                isConnectable={false}
                help="Retry output: amber routes reuse surviving items; red routes discard or sell the result and recreate consumed inputs. Drag a line label to adjust its path."
            />
            <GraphHandle
                type="target"
                id="restart"
                position={Position.Bottom}
                style={{ left: "50%" }}
                isConnectable={false}
                help="Restart input: a failed downstream craft needs this input acquired or produced again."
            />
            <div hidden={data.editing} className="space-y-2 border-t px-3 py-2 text-xs">
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
                                        <GraphHelp
                                            content={
                                                chance === null
                                                    ? "This step has not been sampled yet. Unknown is different from a measured zero. The initial calculation runs in the background."
                                                    : `${result?.visits[id]?.branches[branch.id] ?? 0} of ${result?.visits[id]?.visits ?? 0} visits took this route. This is a sampled conditional frequency, including repeat visits and skipped crafts. Zero observed results do not prove zero probability.`
                                            }
                                        >
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className="nodrag h-auto shrink-0 cursor-help p-0 font-mono text-xs text-inherit"
                                            >
                                                {chance === null
                                                    ? "Not sampled"
                                                    : `${(chance * 100).toFixed(1)}%`}
                                            </Button>
                                        </GraphHelp>
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
            {editor}
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
                <li key={`${index}:${line}`}>
                    <GraphHelp
                        content={`${line}\nAND requires all conditions; OR requires at least one; NOT excludes matching items. Only listed properties constrain a match. Counts and ranges include their endpoints.`}
                    >
                        <Button
                            type="button"
                            variant="ghost"
                            className="nodrag h-auto cursor-help p-0 text-left text-[11px] whitespace-normal"
                        >
                            {line}
                        </Button>
                    </GraphHelp>
                </li>
            ))}
        </ul>
    );
}
