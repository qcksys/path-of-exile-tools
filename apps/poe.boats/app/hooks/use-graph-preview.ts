import { useEffect, useState } from "react";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import {
    type CraftingGraphResult,
    craftingGraphResultSchema,
} from "~/schemas/crafting-graph-result";

export function graphCalculationKey(graph: CraftingGraph) {
    return JSON.stringify({
        ...graph,
        nodes: graph.nodes.map(({ position: _position, ...node }) => node),
    });
}

export function graphPreviewRequest(graph: CraftingGraph) {
    return {
        type: "calculate",
        graph: { ...graph, iterations: Math.min(graph.iterations, 8) },
        options: { estimateIterations: 1, workLimit: 250_000 },
    };
}

export function useGraphPreview(graph: CraftingGraph, enabled: boolean) {
    const key = graphCalculationKey(graph);
    const [preview, setPreview] = useState<{
        key: string;
        result?: CraftingGraphResult;
        error?: string;
        busy: boolean;
    }>();
    useEffect(() => {
        if (!enabled) return;
        let active = true;
        let worker: Worker | undefined;
        const timer = window.setTimeout(() => {
            worker = new Worker("/game-data/history/worker.mjs", { type: "module" });
            setPreview({ key, busy: true });
            worker.onmessage = ({ data }) => {
                if (!active) return;
                if (data.type === "error") {
                    setPreview({ key, busy: false, error: data.error });
                    worker?.terminate();
                    return;
                }
                const parsed = craftingGraphResultSchema.safeParse(data.result);
                if (parsed.success) {
                    setPreview({ key, result: parsed.data, busy: data.type !== "done" });
                    if (data.type === "done") worker?.terminate();
                } else if (data.type === "done" || data.type === "progress") {
                    setPreview({
                        key,
                        busy: false,
                        error: "The preview returned an invalid result.",
                    });
                    worker?.terminate();
                }
            };
            worker.onerror = (event) => {
                if (active) setPreview({ key, busy: false, error: event.message });
                worker?.terminate();
            };
            worker.postMessage(graphPreviewRequest(JSON.parse(key)));
        }, 250);
        return () => {
            active = false;
            window.clearTimeout(timer);
            worker?.terminate();
        };
    }, [key, enabled]);
    return preview?.key === key ? preview : { busy: enabled, result: undefined, error: undefined };
}
