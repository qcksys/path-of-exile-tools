import {
    Background,
    BaseEdge,
    type Edge,
    type EdgeProps,
    Handle,
    MarkerType,
    type Node,
    type NodeProps,
    Panel,
    Position,
    ReactFlow,
    type ReactFlowInstance,
    useNodesState,
    useUpdateNodeInternals,
} from "@xyflow/react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import type { CraftingEngine } from "~/lib/crafting-engine";
import {
    connectProcessSteps,
    processBranches,
    processDestinationId,
    processStepId,
    processStepName,
    validProcessConnection,
} from "~/lib/crafting-flow";
import { type CraftingRoutes, craftingBranchCount, craftingRoute } from "~/lib/crafting-routes";
import type { CraftingStep } from "~/schemas/crafting";
import "@xyflow/react/dist/style.css";
import "./process-flow.css";

type ProcessNode = Node<
    {
        label: string;
        detail: string;
        kind: "start" | "step" | "terminal";
        visits?: number;
        active?: boolean;
        select?: () => void;
        outputs?: { id: string; label: string }[];
    },
    "process"
>;

function ProcessFlowNode({ id, data }: NodeProps<ProcessNode>) {
    const updateNodeInternals = useUpdateNodeInternals();
    const handles = JSON.stringify(data.outputs);
    // biome-ignore lint/correctness/useExhaustiveDependencies: React Flow must remeasure when handle order or count changes.
    useEffect(() => {
        updateNodeInternals(id);
    }, [id, handles, updateNodeInternals]);
    return (
        <div
            className={`relative rounded-lg border bg-card p-3 shadow-sm ${data.active ? "ring-2 ring-primary" : "border-border"}`}
            style={data.outputs ? { minHeight: data.outputs.length * 30 + 40 } : undefined}
        >
            {data.kind !== "start" ? (
                <Handle
                    id="in"
                    type="target"
                    position={Position.Left}
                    aria-label={`${data.label} input`}
                />
            ) : null}
            {data.select ? (
                <Button
                    variant="ghost"
                    size="sm"
                    className="nodrag h-auto w-full justify-start whitespace-normal px-0 text-left"
                    onClick={data.select}
                >
                    Edit {data.label}
                </Button>
            ) : (
                <p className="font-semibold text-sm">{data.label}</p>
            )}
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground" title={data.detail}>
                {data.detail}
            </p>
            {data.visits !== undefined ? (
                <p className="mt-2 font-mono text-xs">
                    {data.visits.toLocaleString(undefined, { maximumSignificantDigits: 4 })} visits
                    / attempt
                </p>
            ) : null}
            {data.kind === "start" ? (
                <Handle
                    id="next"
                    type="source"
                    position={Position.Right}
                    aria-label="Process entry output"
                />
            ) : null}
            {data.kind === "step" && data.outputs ? (
                data.outputs.map((output, index) => (
                    <div key={output.id}>
                        <Handle
                            id={output.id}
                            type="source"
                            position={Position.Right}
                            style={{
                                top: `${(100 * (index + 1)) / (data.outputs!.length + 1)}%`,
                                background:
                                    output.id === "fail"
                                        ? "var(--destructive)"
                                        : "var(--mod-suffix)",
                            }}
                            aria-label={`${data.label} ${output.label} output`}
                        />
                        <span
                            className="pointer-events-none absolute -right-16 -translate-y-1/2 text-[10px]"
                            style={{ top: `${(100 * (index + 1)) / (data.outputs!.length + 1)}%` }}
                        >
                            {output.label}
                        </span>
                    </div>
                ))
            ) : data.kind === "step" ? (
                <>
                    <Handle
                        id="pass"
                        type="source"
                        position={Position.Right}
                        style={{ top: "35%", background: "var(--mod-suffix)" }}
                        aria-label={`${data.label} pass output`}
                    />
                    <Handle
                        id="fail"
                        type="source"
                        position={Position.Right}
                        style={{ top: "75%", background: "var(--destructive)" }}
                        aria-label={`${data.label} fail output`}
                    />
                    <span className="pointer-events-none absolute -right-9 top-[24%] text-[10px] text-mod-suffix">
                        PASS
                    </span>
                    <span className="pointer-events-none absolute -right-9 top-[65%] text-[10px] text-destructive">
                        FAIL
                    </span>
                </>
            ) : null}
        </div>
    );
}

function LoopEdge({ sourceX, sourceY, targetX, targetY, label, ...props }: EdgeProps) {
    return (
        <BaseEdge
            {...props}
            path={`M ${sourceX} ${sourceY} C ${sourceX + 140} ${sourceY + 210}, ${targetX - 140} ${targetY + 210}, ${targetX} ${targetY}`}
            label={label}
            labelX={(sourceX + targetX) / 2}
            labelY={Math.max(sourceY, targetY) + 150}
        />
    );
}

const nodeTypes = { process: ProcessFlowNode };
const edgeTypes = { loop: LoopEdge };

export default function ProcessFlow({
    engine,
    steps,
    onChange,
    onSelect,
    routes,
    attempts = 1,
    activeStep,
    selectedStep,
}: {
    engine: CraftingEngine;
    steps: CraftingStep[];
    onChange: (steps: CraftingStep[], presentationOnly?: boolean) => void;
    onSelect: (id: string) => void;
    routes?: CraftingRoutes;
    attempts?: number;
    activeStep?: string;
    selectedStep?: string;
}) {
    const [instance, setInstance] = useState<ReactFlowInstance<ProcessNode, Edge> | null>(null);
    const layout = useMemo<ProcessNode[]>(
        () => [
            {
                id: "start",
                type: "process",
                position: { x: -300, y: 0 },
                draggable: false,
                data: {
                    label: "Starting item",
                    detail: "Connect to the first step",
                    kind: "start",
                },
            },
            ...steps.map(
                (step, index): ProcessNode => ({
                    id: processStepId(step.id),
                    type: "process",
                    position: step.position ?? {
                        x: 0,
                        y: steps
                            .slice(0, index)
                            .reduce(
                                (sum, entry) =>
                                    sum +
                                    Math.max(230, ((entry.branches?.length ?? 1) + 1) * 30 + 100),
                                0,
                            ),
                    },
                    style: { width: 230 },
                    data: {
                        label: processStepName(step, index),
                        detail:
                            step.description ||
                            (step.method
                                ? engine.methodName(step.method)
                                : "Check item without spending currency"),
                        kind: "step",
                        active: step.id === activeStep || step.id === selectedStep,
                        visits: routes
                            ? (craftingRoute(routes, step.id)?.visits ?? 0) / Math.max(1, attempts)
                            : undefined,
                        select: () => onSelect(step.id),
                        outputs: step.branches
                            ? [
                                  ...step.branches.map((branch, index) => ({
                                      id: branch.id,
                                      label: `Route ${index + 1}`,
                                  })),
                                  { id: "fail", label: "Fallback" },
                              ]
                            : undefined,
                    },
                }),
            ),
            ...(
                [
                    ["success", "Finish", "Final requirements must also pass"],
                    ["failure", "Failure", "End this attempt"],
                    ["restart", "Restart", "Restore the starting item; retain spending"],
                ] as const
            ).map(
                ([id, label, detail], index): ProcessNode => ({
                    id,
                    type: "process",
                    position: { x: 620, y: index * 180 },
                    draggable: false,
                    style: { width: 220 },
                    data: { label, detail, kind: "terminal" },
                }),
            ),
        ],
        [steps, engine, routes, attempts, activeStep, selectedStep, onSelect],
    );
    const [nodes, setNodes, onNodesChange] = useNodesState<ProcessNode>(layout);
    useEffect(
        () =>
            setNodes((current) =>
                layout.map((node) => ({
                    ...node,
                    selected: current.find((entry) => entry.id === node.id)?.selected,
                })),
            ),
        [layout, setNodes],
    );
    const edges: Edge[] = steps.flatMap((step) =>
        [
            ...processBranches(step).map((branch, index) => ({
                ...branch,
                label: step.branches ? `Route ${index + 1}` : "Pass",
                count: step.branches
                    ? craftingBranchCount(craftingRoute(routes, step.id), branch.id)
                    : (craftingRoute(routes, step.id)?.passed ?? 0),
            })),
            {
                id: "fail",
                destination: step.onFailure,
                label: step.branches ? "Fallback" : "Fail",
                count: craftingRoute(routes, step.id)?.failed ?? 0,
            },
        ].map((branch): Edge => {
            const passed = branch.id !== "fail";
            const color = passed ? "var(--mod-suffix)" : "var(--destructive)";
            const visits = craftingRoute(routes, step.id)?.visits ?? 0;
            return {
                id: JSON.stringify([step.id, branch.id]),
                source: processStepId(step.id),
                target: processDestinationId(branch.destination),
                sourceHandle: branch.id,
                targetHandle: "in",
                type: branch.destination === step.id ? "loop" : "smoothstep",
                label: `${branch.label}${routes ? ` · ${(visits ? (100 * branch.count) / visits : 0).toLocaleString(undefined, { maximumSignificantDigits: 3 })}%` : ""}`,
                animated: step.id === activeStep,
                reconnectable: "target",
                selectable: false,
                style: {
                    stroke: color,
                    strokeWidth: 2,
                    ...(passed ? {} : { strokeDasharray: "6 4" }),
                },
                markerEnd: { type: MarkerType.ArrowClosed, color },
            };
        }),
    );
    if (steps[0])
        edges.unshift({
            id: "entry",
            source: "start",
            sourceHandle: "next",
            target: processStepId(steps[0].id),
            targetHandle: "in",
            type: "smoothstep",
            selectable: false,
            reconnectable: "target",
            markerEnd: { type: MarkerType.ArrowClosed },
        });
    return (
        <section aria-label="Process flowchart" className="space-y-2">
            <p className="text-xs text-muted-foreground">
                Drag a route output to a step or terminal. Drag the starting connection to change
                the first step. Move steps to arrange the diagram; select one to edit it. Loops stop
                at the configured step limit.
            </p>
            <div className="crafting-process-flow h-[440px] overflow-hidden rounded-lg border sm:h-[520px]">
                <ReactFlow<ProcessNode, Edge>
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onInit={setInstance}
                    onNodesChange={(changes) => {
                        onNodesChange(changes);
                        const positions = new Map(
                            changes.flatMap((change) =>
                                change.type === "position" && !change.dragging && change.position
                                    ? [[change.id, change.position] as const]
                                    : [],
                            ),
                        );
                        if (positions.size)
                            onChange(
                                steps.map((step) => ({
                                    ...step,
                                    position:
                                        positions.get(processStepId(step.id)) ?? step.position,
                                })),
                                true,
                            );
                    }}
                    isValidConnection={(connection) => validProcessConnection(steps, connection)}
                    onConnect={(connection) => onChange(connectProcessSteps(steps, connection))}
                    onReconnect={(_, connection) =>
                        onChange(connectProcessSteps(steps, connection))
                    }
                    deleteKeyCode={null}
                    fitView
                    fitViewOptions={{ maxZoom: 0.9, padding: 0.2 }}
                    minZoom={0.1}
                    maxZoom={1.5}
                    preventScrolling={false}
                >
                    <Background gap={20} size={1} />
                    <Panel position="bottom-left" className="flex gap-1">
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="Zoom in process"
                            onClick={() => void instance?.zoomIn()}
                        >
                            <ZoomIn />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="Zoom out process"
                            onClick={() => void instance?.zoomOut()}
                        >
                            <ZoomOut />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="Fit process flow"
                            onClick={() => void instance?.fitView({ maxZoom: 0.9, padding: 0.2 })}
                        >
                            <Maximize />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                onChange(
                                    steps.map((step) => ({ ...step, position: undefined })),
                                    true,
                                )
                            }
                        >
                            Reset layout
                        </Button>
                    </Panel>
                </ReactFlow>
            </div>
            <p className="text-xs text-muted-foreground">
                Solid green: matching route. Dashed red: no condition matched. Percentages are per
                visit; step errors end the attempt separately. Use the route dropdowns below for
                keyboard editing.
            </p>
        </section>
    );
}
