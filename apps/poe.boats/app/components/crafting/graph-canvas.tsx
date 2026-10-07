import {
    Background,
    Controls,
    Handle,
    MarkerType,
    type Node,
    type NodeProps,
    Position,
    ReactFlow,
    useNodesState,
    useUpdateNodeInternals,
} from "@xyflow/react";
import { ExpandIcon, MaximizeIcon, MinimizeIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CatalogItemArt } from "~/components/item-art";
import { Badge } from "~/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { connectGraphInput } from "~/lib/crafting-graph-authoring";
import { cn } from "~/lib/utils";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import type { CraftingGraphResult } from "~/schemas/crafting-graph-result";
import "@xyflow/react/dist/style.css";
import { Button } from "~/components/ui/button";

type FlowNode = Node<
    {
        label: string;
        kind: string;
        baseId?: string;
        game: "poe1" | "poe2";
        ports: { id: string; name: string }[];
        active: boolean;
        final: boolean;
        cost: number | null;
        select: () => void;
    },
    "crafting"
>;
function CraftingFlowNode({ id, data }: NodeProps<FlowNode>) {
    const updateNodeInternals = useUpdateNodeInternals();
    useEffect(() => {
        if (data.ports) updateNodeInternals(id);
    }, [id, data.ports, updateNodeInternals]);
    return (
        <div
            className={cn(
                "w-56 rounded-lg border-t-4 border bg-card shadow-md",
                data.kind === "acquire" ? "border-chart-1/50" : "border-chart-2/50",
                data.active && "ring-2 ring-primary/50",
            )}
        >
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <Badge variant={data.kind === "acquire" ? "acquisition" : "craft"}>
                    {data.kind === "acquire" ? "Acquisition" : "Craft"}
                </Badge>
                {data.final && <Badge variant="outcome">Final step</Badge>}
            </div>
            <Button
                variant="ghost"
                type="button"
                className="nodrag h-auto min-h-12 w-full justify-start whitespace-normal px-3 py-3 text-left text-sm font-semibold"
                onClick={data.select}
                aria-label={`Edit ${data.label}`}
            >
                {data.baseId && (
                    <CatalogItemArt id={data.baseId} game={data.game} className="size-9" />
                )}
                {data.label}
            </Button>
            {data.ports.map((port, index) => (
                <Handle
                    key={port.id}
                    type="target"
                    id={port.id}
                    position={Position.Left}
                    style={{ top: 45 + index * 22 }}
                    isConnectable={data.kind === "craft"}
                    aria-label={`${data.label} ${port.name}`}
                />
            ))}
            <Handle
                type="source"
                id="item"
                position={Position.Right}
                aria-label={`${data.label} item output`}
            />
            <div className="border-t border-border px-3 py-2 font-mono text-xs text-muted-foreground">
                {data.cost === null ? "Cost not calculated" : `${data.cost.toFixed(2)} / item`}
            </div>
        </div>
    );
}
const nodeTypes = { crafting: CraftingFlowNode };

export function GraphCanvas({
    graph,
    selected,
    onSelect,
    onChange,
    result,
    onError,
    fullWidth = false,
    onFullWidthChange,
}: {
    graph: CraftingGraph;
    selected: string;
    onSelect: (id: string) => void;
    onChange: (graph: CraftingGraph) => void;
    result?: CraftingGraphResult;
    onError: (error: unknown) => void;
    fullWidth?: boolean;
    onFullWidthChange?: (value: boolean) => void;
}) {
    const [fullscreen, setFullscreen] = useState(false);
    const projected = useMemo(
        () =>
            graph.nodes.map(
                (node, index): FlowNode => ({
                    id: node.id,
                    type: "crafting",
                    position: node.position ?? {
                        x: (index % 3) * 300 + 30,
                        y: Math.floor(index / 3) * 210 + 30,
                    },
                    data: {
                        label: node.name,
                        kind: node.kind,
                        game: graph.game,
                        baseId:
                            node.kind === "acquire"
                                ? node.alternatives.find((option) => option.kind === "purchase")
                                      ?.item.baseId
                                : undefined,
                        active: selected === node.id,
                        final: graph.entry === node.id,
                        ports:
                            node.kind === "craft"
                                ? node.inputs
                                : node.alternatives.filter(
                                      (alternative) => alternative.kind === "production",
                                  ),
                        cost:
                            result?.estimates.find((entry) => entry.nodeId === node.id)
                                ?.expectedCost ?? null,
                        select: () => {
                            onSelect(node.id);
                            setFullscreen(false);
                        },
                    },
                }),
            ),
        [graph, selected, onSelect, result],
    );
    const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(projected);
    useEffect(() => setNodes(projected), [projected, setNodes]);
    const edges = graph.nodes.flatMap((node) => {
        const production =
            node.kind === "craft"
                ? node.inputs.map((port) => ({
                      id: `${node.id}:input:${port.id}`,
                      source: port.source,
                      target: node.id,
                      sourceHandle: "item",
                      targetHandle: port.id,
                      label: port.name,
                      markerEnd: { type: MarkerType.ArrowClosed },
                  }))
                : node.alternatives.flatMap((alternative) =>
                      alternative.kind === "production"
                          ? [
                                {
                                    id: `${node.id}:alternative:${alternative.id}`,
                                    source: alternative.nodeId,
                                    target: node.id,
                                    label: alternative.name,
                                    sourceHandle: "item",
                                    targetHandle: alternative.id,
                                    markerEnd: { type: MarkerType.ArrowClosed },
                                },
                            ]
                          : [],
                  );
        const recovery =
            node.kind === "craft"
                ? [
                      ...node.branches,
                      { id: "fallback", name: "Other results", destination: node.fallback },
                  ].flatMap((branch) =>
                      branch.destination.kind === "recover"
                          ? [
                                {
                                    id: `${node.id}:recovery:${branch.id}`,
                                    source: node.id,
                                    target: branch.destination.nodeId,
                                    sourceHandle: "item",
                                    targetHandle: branch.destination.inputId,
                                    label: `Recover: ${branch.name}`,
                                    style: {
                                        stroke: "var(--chart-4)",
                                        strokeWidth: 2,
                                        strokeDasharray: "6 4",
                                    },
                                    markerEnd: { type: MarkerType.ArrowClosed },
                                },
                            ]
                          : [],
                  )
                : [];
        return [...production, ...recovery].map((edge) => ({
            style: { stroke: "var(--chart-1)", strokeWidth: 2 },
            ...edge,
            labelStyle: { fill: "var(--foreground)" },
            labelBgStyle: { fill: "var(--card)" },
        }));
    });
    const canvas = (
        <section
            className={cn(
                "min-h-0 rounded-lg border border-border bg-muted/20 [--xy-controls-button-background-color:var(--card)] [--xy-controls-button-color:var(--foreground)] [--xy-controls-button-border-color:var(--border)] [--xy-controls-button-background-color-hover:var(--muted)]",
                fullscreen ? "flex-1" : "h-[480px]",
            )}
            aria-label="Crafting project graph"
        >
            <ReactFlow<FlowNode>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                edgesReconnectable={false}
                deleteKeyCode={null}
                fitView
                minZoom={0.25}
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
                    <Badge variant="recovery">Recovery · dashed</Badge>
                    <Badge variant="outcome">Final outcome</Badge>
                </fieldset>
                <div className="flex gap-2">
                    {onFullWidthChange && (
                        <Button
                            variant="outline"
                            size="sm"
                            aria-pressed={fullWidth}
                            onClick={() => onFullWidthChange(!fullWidth)}
                        >
                            {fullWidth ? <MinimizeIcon /> : <ExpandIcon />}
                            Full width
                        </Button>
                    )}
                    <Dialog open={fullscreen} onOpenChange={setFullscreen}>
                        <DialogTrigger render={<Button variant="outline" size="sm" />}>
                            <MaximizeIcon /> Fullscreen graph
                        </DialogTrigger>
                        <DialogContent className="flex h-dvh max-w-none flex-col rounded-none sm:max-w-none">
                            <DialogTitle>Crafting project graph</DialogTitle>
                            <p className="text-xs text-muted-foreground">
                                Select a node to return to its editor. Press Escape to exit
                                fullscreen.
                            </p>
                            {fullscreen && canvas}
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
            {!fullscreen && canvas}
        </div>
    );
}
