import {
    Background,
    type Edge,
    Handle,
    MarkerType,
    type Node,
    type NodeProps,
    Panel,
    Position,
    ReactFlow,
    type ReactFlowInstance,
} from "@xyflow/react";
import { Box, GitMerge, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CatalogItemArt } from "~/components/item-art";
import { ModifierIcons, ModifierLegend } from "~/components/recombinator/modifier-icons";
import { Button } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { matchesTarget, type RecombinatorStepResult } from "~/lib/recombinator";
import type { RecombinatorDraft } from "~/lib/recombinator-plan";
import {
    connectTreeStep,
    isValidTreeConnection,
    layoutRecombinatorTree,
    type TreeAffix,
} from "~/lib/recombinator-tree";
import { cn } from "~/lib/utils";
import "@xyflow/react/dist/style.css";
import "./crafting-tree.css";

type CraftNode = Node<
    {
        name: string;
        baseId?: string;
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
        <Card
            className={cn(
                "h-full gap-0 overflow-visible py-0",
                data.active && "ring-2 ring-primary",
            )}
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
            <Button
                variant="ghost"
                type="button"
                onClick={data.select}
                aria-label={`${data.kind === "item" ? "Edit item" : "Inspect step"} ${data.index + 1}: ${data.name}`}
                aria-pressed={data.kind === "step" ? data.active : undefined}
                className="nodrag pointer-events-auto block h-full w-full px-4 py-3 text-left whitespace-normal"
            >
                <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {data.kind === "item" ? (
                        <Box data-icon="inline-start" />
                    ) : (
                        <GitMerge data-icon="inline-start" />
                    )}
                    {data.kind === "item" ? "Item" : "Step"} {data.index + 1}
                </span>
                <span
                    className="mb-1 flex items-center gap-2 text-sm font-semibold"
                    title={data.name}
                >
                    {data.baseId && <CatalogItemArt id={data.baseId} game="poe1" />}
                    <span className="truncate">{data.name || "Unnamed"}</span>
                </span>
                {data.kind === "item" ? (
                    <span className="block text-[11px] leading-5">
                        {data.affixes.length ? (
                            data.affixes.slice(0, 6).map(({ affix, side }) => (
                                <span
                                    key={`${side}-${affix.id}`}
                                    className={cn(
                                        "flex items-center gap-1",
                                        side === "prefixes" ? "text-mod-prefix" : "text-mod-suffix",
                                    )}
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
            </Button>
            <Handle
                id="output"
                type="source"
                position={Position.Right}
                aria-label={`${data.kind === "item" ? "Item" : "Step"} ${data.index + 1} output connector`}
            />
        </Card>
    );
}

const nodeTypes = { craft: CraftingNode };

export function CraftingTree({
    draft,
    results,
    selectedStep,
    required,
    exact,
    requiredBase = "any",
    onEdit,
    onSelect,
}: {
    draft: RecombinatorDraft;
    results?: RecombinatorStepResult[];
    selectedStep: string;
    required: string[];
    exact: boolean;
    requiredBase?: string;
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
                baseId: draft.items.find((item) => item.id === node.id)?.catalog?.base.id,
                active: node.kind === "step" && selectedStep === node.id,
                outcomes: outcomes?.length,
                hasTarget: required.length > 0 || exact || requiredBase !== "any",
                chance: outcomes?.reduce(
                    (sum, outcome) =>
                        sum +
                        (matchesTarget(outcome.item, required, exact) &&
                        (requiredBase === "any" || outcome.item.base?.id === requiredBase)
                            ? outcome.probability
                            : 0),
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
        <Card aria-labelledby="tree-heading" className="gap-0">
            <CardHeader className="flex flex-wrap items-center justify-between gap-3 pb-3">
                <div>
                    <CardTitle id="tree-heading" className="flex items-center gap-2">
                        <GitMerge className="size-4" />
                        Crafting tree
                    </CardTitle>
                    <CardDescription>
                        Drag an output to A or B to replace that input. Select a step to inspect it.
                        Pan and zoom to explore.
                    </CardDescription>
                </div>
                <ModifierLegend />
            </CardHeader>
            <Separator />
            <CardContent
                className="recombinator-flow h-[460px] px-0 sm:h-[520px]"
                data-testid="crafting-tree"
            >
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
                    <Panel position="bottom-left" className="flex gap-1">
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="Zoom in"
                            onClick={() => void instance?.zoomIn()}
                        >
                            <ZoomIn />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="Zoom out"
                            onClick={() => void instance?.zoomOut()}
                        >
                            <ZoomOut />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="Fit crafting tree"
                            onClick={() => void instance?.fitView({ padding: 0.12, maxZoom: 1 })}
                        >
                            <Maximize />
                        </Button>
                    </Panel>
                </ReactFlow>
            </CardContent>
            <CardFooter>
                <p className="text-xs text-muted-foreground">
                    <span className="text-mod-prefix">Blue → input A</span> ·{" "}
                    <span className="text-mod-suffix">Green → input B</span>. Connections can only
                    use starting items or earlier steps. Repeated sources mean independent runs.
                </p>
            </CardFooter>
        </Card>
    );
}
