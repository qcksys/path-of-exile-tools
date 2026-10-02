import {
    Background,
    Controls,
    type Edge,
    Handle,
    MarkerType,
    type Node,
    type NodeProps,
    Position,
    ReactFlow,
    type ReactFlowInstance,
} from "@xyflow/react";
import { Box, GitMerge } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ModifierIcons, ModifierLegend } from "~/components/recombinator/modifier-icons";
import { matchesTarget, type RecombinatorStepResult } from "~/lib/recombinator";
import type { RecombinatorDraft } from "~/lib/recombinator-plan";
import {
    connectTreeStep,
    isValidTreeConnection,
    layoutRecombinatorTree,
    type TreeAffix,
} from "~/lib/recombinator-tree";
import "@xyflow/react/dist/style.css";
import "./crafting-tree.css";

type CraftNode = Node<
    {
        name: string;
        kind: "item" | "step";
        index: number;
        affixes: TreeAffix[];
        active: boolean;
        outcomes?: number;
        chance?: number;
        hasTarget: boolean;
        select: () => void;
    },
    "craft"
>;

function CraftingNode({ data }: NodeProps<CraftNode>) {
    return (
        <div
            className={`h-full rounded-xl border bg-card shadow-sm ${data.active ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
        >
            {data.kind === "step" ? (
                <>
                    <Handle
                        id="left"
                        type="target"
                        position={Position.Left}
                        style={{ top: "35%", background: "var(--mod-prefix)" }}
                        aria-label={`Step ${data.index + 1} input A connector`}
                    />
                    <Handle
                        id="right"
                        type="target"
                        position={Position.Left}
                        style={{ top: "75%", background: "var(--mod-suffix)" }}
                        aria-label={`Step ${data.index + 1} input B connector`}
                    />
                    <span className="pointer-events-none absolute -left-5 top-[26%] font-mono text-[10px] text-mod-prefix">
                        A
                    </span>
                    <span className="pointer-events-none absolute -left-5 top-[66%] font-mono text-[10px] text-mod-suffix">
                        B
                    </span>
                </>
            ) : null}
            <button
                type="button"
                onClick={data.select}
                aria-label={`${data.kind === "item" ? "Edit item" : "Inspect step"} ${data.index + 1}: ${data.name}`}
                aria-pressed={data.kind === "step" ? data.active : undefined}
                className="nodrag pointer-events-auto h-full w-full rounded-xl px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-ring"
            >
                <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {data.kind === "item" ? (
                        <Box className="size-3" />
                    ) : (
                        <GitMerge className="size-3" />
                    )}
                    {data.kind === "item" ? "Item" : "Step"} {data.index + 1}
                </span>
                <span className="mb-1 block truncate text-sm font-semibold" title={data.name}>
                    {data.name || "Unnamed"}
                </span>
                {data.kind === "item" ? (
                    <span className="block text-[11px] leading-5">
                        {data.affixes.length ? (
                            data.affixes.slice(0, 6).map(({ affix, side }) => (
                                <span
                                    key={`${side}-${affix.id}`}
                                    className={`flex items-center gap-1 ${side === "prefixes" ? "text-mod-prefix" : "text-mod-suffix"}`}
                                >
                                    <span className="font-mono text-[9px] opacity-70">
                                        {side === "prefixes" ? "P" : "S"}
                                    </span>
                                    <ModifierIcons affix={affix} />
                                    <span className="truncate" title={affix.label ?? affix.id}>
                                        {affix.label ?? affix.id}
                                    </span>
                                </span>
                            ))
                        ) : (
                            <span className="text-muted-foreground">No modifiers entered</span>
                        )}
                    </span>
                ) : (
                    <span className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                        <span>
                            {data.outcomes === undefined
                                ? "Calculate to see odds"
                                : `${data.outcomes} outcomes`}
                        </span>
                        {data.chance !== undefined && data.hasTarget ? (
                            <span
                                className="font-mono text-foreground"
                                title="Target chance through this step"
                            >
                                {(data.chance * 100).toLocaleString("en-US", {
                                    maximumFractionDigits: 2,
                                })}
                                % target
                            </span>
                        ) : null}
                    </span>
                )}
            </button>
            <Handle
                id="output"
                type="source"
                position={Position.Right}
                aria-label={`${data.kind === "item" ? "Item" : "Step"} ${data.index + 1} output connector`}
            />
        </div>
    );
}

const nodeTypes = { craft: CraftingNode };

export function CraftingTree({
    draft,
    results,
    selectedStep,
    required,
    exact,
    onEdit,
    onSelect,
}: {
    draft: RecombinatorDraft;
    results?: RecombinatorStepResult[];
    selectedStep: string;
    required: string[];
    exact: boolean;
    onEdit: (draft: RecombinatorDraft) => void;
    onSelect: (id: string, kind: "item" | "step") => void;
}) {
    const [instance, setInstance] = useState<ReactFlowInstance<CraftNode, Edge> | null>(null);
    const layout = useMemo(() => layoutRecombinatorTree(draft), [draft]);
    const topology = JSON.stringify(layout.nodes.map(({ id, x, y, height }) => [id, x, y, height]));
    useEffect(() => {
        if (topology && instance) void instance.fitView({ padding: 0.12, maxZoom: 1 });
    }, [instance, topology]);
    const nodes: CraftNode[] = layout.nodes.map((node) => {
        const outcomes = results?.find((result) => result.id === node.id)?.outcomes;
        return {
            id: node.id,
            type: "craft",
            position: { x: node.x, y: node.y },
            width: node.width,
            height: node.height,
            style: { width: node.width, height: node.height },
            data: {
                ...node,
                active: node.kind === "step" && selectedStep === node.id,
                outcomes: outcomes?.length,
                hasTarget: required.length > 0 || exact,
                chance: outcomes?.reduce(
                    (sum, outcome) =>
                        sum +
                        (matchesTarget(outcome.item, required, exact) ? outcome.probability : 0),
                    0,
                ),
                select: () => onSelect(node.id, node.kind),
            },
        };
    });
    const edges: Edge[] = layout.edges.map((edge) => {
        const color = edge.targetHandle === "left" ? "var(--mod-prefix)" : "var(--mod-suffix)";
        return {
            ...edge,
            sourceHandle: "output",
            type: "smoothstep",
            selectable: false,
            style: { stroke: color, strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color },
            ariaLabel: `${draft.items.find((item) => item.id === edge.source)?.name ?? draft.steps.find((step) => step.id === edge.source)?.name} to ${draft.steps.find((step) => step.id === edge.target)?.name}, input ${edge.targetHandle === "left" ? "A" : "B"}`,
        };
    });

    return (
        <section
            aria-labelledby="tree-heading"
            className="overflow-hidden rounded-xl border border-border"
        >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
                <div>
                    <h2 id="tree-heading" className="flex items-center gap-2 font-semibold">
                        <GitMerge className="size-4" />
                        Crafting tree
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Drag an output to A or B to replace that input. Select a step to inspect it.
                        Pan and zoom to explore.
                    </p>
                </div>
                <ModifierLegend />
            </div>
            <div className="recombinator-flow h-[460px] sm:h-[520px]" data-testid="crafting-tree">
                <ReactFlow<CraftNode, Edge>
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onInit={setInstance}
                    nodesDraggable={false}
                    elementsSelectable={false}
                    edgesReconnectable={false}
                    deleteKeyCode={null}
                    minZoom={0.15}
                    maxZoom={1.5}
                    fitView
                    fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
                    preventScrolling={false}
                    isValidConnection={(connection) =>
                        isValidTreeConnection(draft, {
                            ...connection,
                            targetHandle: connection.targetHandle ?? null,
                        })
                    }
                    onConnect={(connection) => onEdit(connectTreeStep(draft, connection))}
                >
                    <Background gap={20} size={1} />
                    <Controls
                        showInteractive={false}
                        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
                    />
                </ReactFlow>
            </div>
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                <span className="text-mod-prefix">Blue → input A</span> ·{" "}
                <span className="text-mod-suffix">Green → input B</span>. Connections can only use
                starting items or earlier steps. Repeated sources mean independent runs.
            </p>
        </section>
    );
}
