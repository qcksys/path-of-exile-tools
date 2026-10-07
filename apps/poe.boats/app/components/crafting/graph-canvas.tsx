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
import { useEffect, useMemo } from "react";
import { connectGraphInput } from "~/lib/crafting-graph-authoring";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import type { CraftingGraphResult } from "~/schemas/crafting-graph-result";
import "@xyflow/react/dist/style.css";

type FlowNode = Node<
    {
        label: string;
        kind: string;
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
            className={`w-56 rounded-lg border bg-card shadow-md ${data.active ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
        >
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>{data.kind === "acquire" ? "Acquisition" : "Craft"}</span>
                {data.final && <span className="text-primary">Final step</span>}
            </div>
            <button
                type="button"
                className="nodrag w-full px-3 py-3 text-left text-sm font-semibold"
                onClick={data.select}
                aria-label={`Edit ${data.label}`}
            >
                {data.label}
            </button>
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
}: {
    graph: CraftingGraph;
    selected: string;
    onSelect: (id: string) => void;
    onChange: (graph: CraftingGraph) => void;
    result?: CraftingGraphResult;
    onError: (error: unknown) => void;
}) {
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
                        select: () => onSelect(node.id),
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
                                    style: { stroke: "var(--chart-4)", strokeDasharray: "6 4" },
                                    markerEnd: { type: MarkerType.ArrowClosed },
                                },
                            ]
                          : [],
                  )
                : [];
        return [...production, ...recovery].map((edge) => ({
            ...edge,
            labelStyle: { fill: "var(--foreground)" },
            labelBgStyle: { fill: "var(--card)" },
        }));
    });
    return (
        <section
            className="h-[480px] rounded-lg border border-border bg-muted/20 [--xy-controls-button-background-color:var(--card)] [--xy-controls-button-color:var(--foreground)] [--xy-controls-button-border-color:var(--border)] [--xy-controls-button-background-color-hover:var(--muted)]"
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
}
