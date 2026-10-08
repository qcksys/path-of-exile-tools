import {
    BaseEdge,
    type Edge,
    EdgeLabelRenderer,
    type EdgeProps,
    getSmoothStepPath,
    useReactFlow,
} from "@xyflow/react";
import { GripIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { GraphHelp } from "./graph-help";

export type GraphEdgePoint = { x: number; y: number };
export type CraftingFlowEdge = Edge<{
    retry: boolean;
    lane: number;
    sourceRight: number;
    targetLeft: number;
    point?: GraphEdgePoint;
    description: string;
    onMove: (id: string, point?: GraphEdgePoint) => void;
}>;

export function GraphEdge(props: EdgeProps<CraftingFlowEdge>) {
    const { id, sourceX, sourceY, targetX, targetY, data, label } = props;
    const flow = useReactFlow();
    const [dragPoint, setDragPoint] = useState<GraphEdgePoint>();
    const dragging = useRef(false);
    const point = dragPoint ?? data?.point;
    const [defaultPath, labelX, labelY] = getSmoothStepPath(props);
    const right = (data?.sourceRight ?? sourceX) + 40;
    const left = (data?.targetLeft ?? targetX) - 40;
    const centre =
        point ?? (data?.retry ? { x: (right + left) / 2, y: data.lane } : { x: labelX, y: labelY });
    const path = data?.retry
        ? `M ${sourceX} ${sourceY} L ${sourceX} ${sourceY + 24} L ${right} ${sourceY + 24} L ${right} ${centre.y} L ${centre.x} ${centre.y} L ${left} ${centre.y} L ${left} ${targetY + 24} L ${targetX} ${targetY + 24} L ${targetX} ${targetY}`
        : point
          ? `M ${sourceX} ${sourceY} C ${sourceX + 60} ${sourceY} ${centre.x - 60} ${centre.y} ${centre.x} ${centre.y} C ${centre.x + 60} ${centre.y} ${targetX - 60} ${targetY} ${targetX} ${targetY}`
          : defaultPath;
    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                style={props.style}
                markerEnd={props.markerEnd}
                interactionWidth={24}
            />
            <EdgeLabelRenderer>
                <GraphHelp
                    content={`${data?.description ?? ""}\nDrag this label to bend the connection. Arrow keys move it; hold Shift for larger steps. Double-click or press Delete to restore automatic routing. This changes the line's shape only.`}
                >
                    <Button
                        type="button"
                        variant="outline"
                        aria-label={`Move connection: ${String(label)}`}
                        data-edge-label={id}
                        className="nodrag nopan absolute flex h-auto max-w-64 cursor-grab items-center gap-1 rounded border bg-card px-2 py-1 text-[11px] whitespace-normal shadow-sm transition-none outline-none focus-visible:ring-2 focus-visible:ring-primary active:translate-y-0 active:cursor-grabbing"
                        style={{
                            transform: `translate(-50%, -50%) translate(${centre.x}px,${centre.y}px)`,
                            pointerEvents: "all",
                            borderColor: props.style?.stroke,
                            touchAction: "none",
                        }}
                        onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.stopPropagation();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            dragging.current = true;
                        }}
                        onPointerMove={(event) => {
                            if (!dragging.current) return;
                            setDragPoint(
                                flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                            );
                        }}
                        onPointerUp={(event) => {
                            if (!dragging.current) return;
                            dragging.current = false;
                            event.currentTarget.releasePointerCapture(event.pointerId);
                            if (dragPoint) data?.onMove(id, dragPoint);
                            setDragPoint(undefined);
                        }}
                        onPointerCancel={() => {
                            dragging.current = false;
                            setDragPoint(undefined);
                        }}
                        onDoubleClick={() => data?.onMove(id)}
                        onKeyDown={(event) => {
                            const distance = event.shiftKey ? 40 : 10;
                            const delta = {
                                arrowleft: [-distance, 0],
                                arrowright: [distance, 0],
                                arrowup: [0, -distance],
                                arrowdown: [0, distance],
                            }[event.key.toLowerCase()];
                            if (delta) {
                                event.preventDefault();
                                event.stopPropagation();
                                data?.onMove(id, {
                                    x: centre.x + delta[0]!,
                                    y: centre.y + delta[1]!,
                                });
                            } else if (event.key === "Delete" || event.key === "Backspace") {
                                event.preventDefault();
                                event.stopPropagation();
                                data?.onMove(id);
                            }
                        }}
                    >
                        <GripIcon className="size-3 shrink-0 opacity-50" />
                        <span>{label}</span>
                    </Button>
                </GraphHelp>
            </EdgeLabelRenderer>
        </>
    );
}
