import {
    Background,
    BaseEdge,
    Controls,
    type Edge,
    type EdgeProps,
    MarkerType,
    ReactFlow,
    type ReactFlowInstance,
    useNodesState,
} from "@xyflow/react";
import { ExpandIcon, MaximizeIcon, MinimizeIcon, NetworkIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { connectGraphInput } from "~/lib/crafting-graph-authoring";
import {
    graphBranchChance,
    graphChanceWidth,
    layoutCraftingGraph,
} from "~/lib/crafting-graph-presentation";
import { cn } from "~/lib/utils";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import type { CraftingGraphResult } from "~/schemas/crafting-graph-result";
import { type CraftingFlowNode, FlowStep } from "./graph-flow-node";
import "@xyflow/react/dist/style.css";

const nodeTypes = { crafting: FlowStep };
function RetryEdge({ sourceX, sourceY, targetX, targetY, data, ...props }: EdgeProps) {
    const lane = Math.max(sourceY, targetY, Number(data?.bottom ?? 0)) + Number(data?.offset ?? 60);
    const right = Number(data?.sourceRight ?? sourceX) + 40;
    const left = Number(data?.targetLeft ?? targetX) - 40;
    return (
        <BaseEdge
            {...props}
            path={`M ${sourceX} ${sourceY} L ${sourceX} ${sourceY + 24} L ${right} ${sourceY + 24} L ${right} ${lane} L ${left} ${lane} L ${left} ${targetY + 24} L ${targetX} ${targetY + 24} L ${targetX} ${targetY}`}
            labelX={(right + left) / 2}
            labelY={lane}
        />
    );
}
const edgeTypes = { retry: RetryEdge };

export function GraphCanvas({
    graph,
    engine,
    selected,
    onSelect,
    onChange,
    result,
    onError,
    fullWidth = false,
    onFullWidthChange,
}: {
    graph: CraftingGraph;
    engine: CraftingEngine;
    selected: string;
    onSelect: (id: string) => void;
    onChange: (graph: CraftingGraph) => void;
    result?: CraftingGraphResult;
    onError: (error: unknown) => void;
    fullWidth?: boolean;
    onFullWidthChange?: (value: boolean) => void;
}) {
    const [fullscreen, setFullscreen] = useState(false);
    const [flow, setFlow] = useState<ReactFlowInstance<CraftingFlowNode, Edge> | null>(null);
    const positions = useMemo(() => layoutCraftingGraph(graph), [graph]);
    const retries = graph.nodes.reduce(
        (count, node) =>
            node.kind === "acquire"
                ? count
                : count +
                  [...node.branches.map((branch) => branch.destination), node.fallback].reduce(
                      (count, destination) =>
                          count +
                          (destination.kind === "recover"
                              ? 1
                              : ["discard", "sell"].includes(destination.kind)
                                ? node.inputs.length
                                : 0),
                      0,
                  ),
        0,
    );
    const projected = useMemo(
        (): CraftingFlowNode[] => [
            ...graph.nodes.map((step) => ({
                id: step.id,
                type: "crafting" as const,
                position: step.position ?? positions.get(step.id)!,
                data: {
                    graph,
                    engine,
                    step,
                    result,
                    active: selected === step.id,
                    select: () => {
                        onSelect(step.id);
                        setFullscreen(false);
                    },
                },
            })),
            ...graph.outcomes.map((outcome, index) => ({
                id: `outcome:${outcome.id}`,
                type: "crafting" as const,
                draggable: false,
                connectable: false,
                position: {
                    x: Math.max(...Array.from(positions.values(), (position) => position.x)) + 560,
                    y: 30 + index * 400,
                },
                data: { graph, engine, outcome, result, active: false, select: () => {} },
            })),
            {
                id: "routing-bounds",
                type: "crafting",
                position: { x: 30, y: 500 + retries * 28 },
                draggable: false,
                selectable: false,
                focusable: false,
                connectable: false,
                style: { opacity: 0, pointerEvents: "none" },
                data: { graph, engine, active: false, select: () => {} },
            },
        ],
        [graph, engine, positions, result, selected, onSelect, retries],
    );
    const [nodes, setNodes, onNodesChange] = useNodesState<CraftingFlowNode>(projected);
    useEffect(
        () =>
            setNodes((current) =>
                projected.map((node) => ({
                    ...node,
                    position:
                        node.data.step?.position ??
                        current.find((entry) => entry.id === node.id)?.position ??
                        node.position,
                    measured: current.find((entry) => entry.id === node.id)?.measured,
                })),
            ),
        [projected, setNodes],
    );
    const dimensions = nodes.map((node) => `${node.id}:${node.measured?.height ?? 0}`).join(";");
    useEffect(() => {
        if (!flow) return;
        const current = flow.getNodes();
        if (current.some((node) => !node.measured?.height)) return;
        const heights = new Map(current.map((node) => [node.id, node.measured!.height!]));
        const layout = layoutCraftingGraph(graph, heights);
        for (const step of graph.nodes) if (step.position) layout.set(step.id, step.position);
        const outcomeX = Math.max(...Array.from(layout.values(), (position) => position.x)) + 560;
        let outcomeY = 30;
        for (const outcome of graph.outcomes) {
            const id = `outcome:${outcome.id}`;
            layout.set(id, { x: outcomeX, y: outcomeY });
            outcomeY += (heights.get(id) ?? 300) + 100;
        }
        const bottom = Math.max(
            ...Array.from(layout, ([id, position]) => position.y + (heights.get(id) ?? 360)),
        );
        layout.set("routing-bounds", { x: 30, y: bottom + 70 + retries * 28 });
        setNodes((current) =>
            current.map((node) => ({ ...node, position: layout.get(node.id) ?? node.position })),
        );
        const frame = requestAnimationFrame(() => void flow.fitView({ padding: 0.12, maxZoom: 1 }));
        return () => cancelAnimationFrame(frame);
    }, [dimensions, flow, graph, setNodes, retries]);
    const edges = useMemo(() => {
        const edges: Edge[] = [];
        const add = (edge: Edge, color: string, chance: number | null = null, retry = false) =>
            edges.push({
                ...edge,
                type: retry ? "retry" : "smoothstep",
                style: {
                    stroke: color,
                    strokeWidth: graphChanceWidth(chance),
                    ...(retry ? { strokeDasharray: "6 4" } : {}),
                },
                markerEnd: { type: MarkerType.ArrowClosed, color },
                labelStyle: { fill: "var(--foreground)", fontSize: 11 },
                labelBgStyle: { fill: "var(--card)" },
                data: {
                    offset: 45 + edges.filter((edge) => edge.type === "retry").length * 28,
                    bottom: Math.max(
                        ...nodes
                            .filter((node) => node.id !== "routing-bounds")
                            .map((node) => node.position.y + (node.measured?.height ?? 360)),
                    ),
                    sourceRight:
                        (nodes.find((node) => node.id === edge.source)?.position.x ?? 0) + 320,
                    targetLeft: nodes.find((node) => node.id === edge.target)?.position.x ?? 0,
                },
            });
        for (const node of graph.nodes) {
            if (node.kind === "acquire") {
                for (const option of node.alternatives)
                    if (option.kind === "production")
                        add(
                            {
                                id: `${node.id}:alternative:${option.id}`,
                                source: option.nodeId,
                                target: node.id,
                                sourceHandle: "item",
                                targetHandle: option.id,
                                label: option.name,
                            },
                            "var(--chart-1)",
                        );
                continue;
            }
            for (const input of node.inputs) {
                const source = graph.nodes.find((node) => node.id === input.source);
                const chance =
                    source?.kind === "craft"
                        ? [...source.branches, { id: "fallback", destination: source.fallback }]
                              .filter((branch) => branch.destination.kind === "return")
                              .reduce<number | null>((total, branch) => {
                                  const chance = graphBranchChance(result, source.id, branch.id);
                                  return chance === null ? null : (total ?? 0) + chance;
                              }, null)
                        : null;
                add(
                    {
                        id: `${node.id}:input:${input.id}`,
                        source: input.source,
                        target: node.id,
                        sourceHandle: "item",
                        targetHandle: input.id,
                        label: `${input.name}${chance === null ? "" : ` · ${(chance * 100).toFixed(1)}% continue`}`,
                    },
                    "#059669",
                    chance,
                );
            }
            for (const branch of [
                ...node.branches,
                { id: "fallback", name: "Other results", destination: node.fallback },
            ]) {
                const destination = branch.destination;
                const chance = graphBranchChance(result, node.id, branch.id);
                const label = `${branch.name} · ${chance === null ? "chance unknown" : `${(chance * 100).toFixed(1)}%`}`;
                if (destination.kind === "recover")
                    add(
                        {
                            id: `${node.id}:recovery:${branch.id}`,
                            source: node.id,
                            target: destination.nodeId,
                            sourceHandle: "retry",
                            targetHandle: `recovery-${destination.inputId}`,
                            label: `Recover · ${chance === null ? "?" : `${(chance * 100).toFixed(1)}%`}`,
                        },
                        "#d97706",
                        chance,
                        true,
                    );
                if (destination.kind === "discard" || destination.kind === "sell")
                    for (const port of node.inputs)
                        add(
                            {
                                id: `${node.id}:restart:${branch.id}:${port.id}`,
                                source: node.id,
                                target: port.source,
                                sourceHandle: "retry",
                                targetHandle: "restart",
                                label: `${destination.kind === "sell" ? "Sell" : "Miss"} · ${chance === null ? "?" : `${(chance * 100).toFixed(1)}%`} → recreate ${port.name}`,
                            },
                            "#e11d48",
                            chance,
                            true,
                        );
                if (destination.kind === "terminal")
                    add(
                        {
                            id: `${node.id}:terminal:${branch.id}`,
                            source: node.id,
                            target: `outcome:${destination.outcomeId}`,
                            sourceHandle: "item",
                            targetHandle: "outcome",
                            label,
                        },
                        graph.outcomes.find((outcome) => outcome.id === destination.outcomeId)
                            ?.success
                            ? "#059669"
                            : "#e11d48",
                        chance,
                    );
            }
        }
        for (const outcome of graph.outcomes) {
            const chance =
                result?.outcomes.find((entry) => entry.id === outcome.id)?.probability ?? null;
            add(
                {
                    id: `final:${outcome.id}`,
                    source: graph.entry,
                    target: `outcome:${outcome.id}`,
                    sourceHandle: "item",
                    targetHandle: "outcome",
                    label: `${outcome.name} · ${chance === null ? "chance unknown" : `${(chance * 100).toFixed(1)}% of trials`}`,
                },
                outcome.success ? "#059669" : "#e11d48",
                chance,
            );
        }
        return edges;
    }, [graph, result, nodes]);
    const canvas = (
        <section
            className={cn(
                "min-h-0 rounded-lg border border-border bg-muted/20 [--xy-controls-button-background-color:var(--card)] [--xy-controls-button-color:var(--foreground)] [--xy-controls-button-border-color:var(--border)] [--xy-controls-button-background-color-hover:var(--muted)]",
                fullscreen ? "flex-1" : "h-[640px]",
            )}
            aria-label="Crafting project graph"
        >
            <ReactFlow<CraftingFlowNode>
                proOptions={{ hideAttribution: true }}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onInit={setFlow}
                onNodesChange={onNodesChange}
                edgesReconnectable={false}
                deleteKeyCode={null}
                fitView
                minZoom={0.03}
                maxZoom={1.5}
                onConnect={(connection) => {
                    try {
                        if (connection.targetHandle)
                            onChange(
                                connectGraphInput(
                                    graph,
                                    connection.target,
                                    connection.targetHandle,
                                    connection.source,
                                ),
                            );
                    } catch (error) {
                        onError(error);
                    }
                }}
                onNodeDragStop={(_, node) =>
                    onChange({
                        ...graph,
                        nodes: graph.nodes.map((entry) =>
                            entry.id === node.id ? { ...entry, position: node.position } : entry,
                        ),
                    })
                }
            >
                <Background gap={24} color="var(--border)" />
                <Controls />
            </ReactFlow>
        </section>
    );
    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <fieldset className="flex flex-wrap gap-2" aria-label="Graph color legend">
                    <Badge variant="acquisition">Acquisitions</Badge>
                    <Badge variant="craft">Crafting steps</Badge>
                    <Badge variant="recovery">Recovery · amber dashed</Badge>
                    <Badge variant="outcome">Success · green</Badge>
                    <span className="text-xs text-rose-600 dark:text-rose-400">
                        Miss / recreate · red dashed
                    </span>
                </fieldset>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            onChange({
                                ...graph,
                                nodes: graph.nodes.map((node) => ({
                                    ...node,
                                    position: undefined,
                                })),
                            })
                        }
                    >
                        <NetworkIcon />
                        Auto arrange
                    </Button>
                    {onFullWidthChange && (
                        <Button
                            variant="outline"
                            size="sm"
                            aria-pressed={fullWidth}
                            onClick={() => onFullWidthChange(!fullWidth)}
                        >
                            {fullWidth ? <MinimizeIcon /> : <ExpandIcon />}Full width
                        </Button>
                    )}
                    <Dialog open={fullscreen} onOpenChange={setFullscreen}>
                        <DialogTrigger render={<Button variant="outline" size="sm" />}>
                            <MaximizeIcon />
                            Fullscreen graph
                        </DialogTrigger>
                        <DialogContent className="flex h-dvh max-w-none flex-col rounded-none sm:max-w-none">
                            <DialogTitle>Crafting project graph</DialogTitle>
                            <p className="text-xs text-muted-foreground">
                                Hover or focus an item to preview it. Click an item to pin its card.
                                Select Edit to return to the step editor.
                            </p>
                            {fullscreen && canvas}
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                Line width shows sampled branch frequency per visit; final outcomes use completed
                trials. ? means uncalculated. Dashed red paths recreate consumed inputs; amber paths
                reuse surviving items.
            </p>
            {!fullscreen && canvas}
        </div>
    );
}
