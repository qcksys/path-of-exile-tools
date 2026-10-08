// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useGraphPreview } from "../app/hooks/use-graph-preview";
import { CraftingGraphSimulation } from "../app/lib/crafting-graph-simulation";
import { engine } from "./crafting-fixtures";
import { graphFixture } from "./crafting-graph-fixtures";

class PreviewWorker {
    static instances: PreviewWorker[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
        PreviewWorker.instances.push(this);
    }
}

beforeEach(() => {
    vi.useFakeTimers();
    PreviewWorker.instances = [];
    vi.stubGlobal("Worker", PreviewWorker);
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it("calculates in a worker, ignores layout changes and discards late results after an edit", () => {
    const graph = graphFixture();
    const { result, rerender, unmount } = renderHook(({ graph }) => useGraphPreview(graph, true), {
        initialProps: { graph },
    });
    expect(PreviewWorker.instances).toHaveLength(0);
    act(() => vi.advanceTimersByTime(250));
    const first = PreviewWorker.instances[0]!;
    expect(first.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
            type: "calculate",
            options: { estimateIterations: 1, workLimit: 250_000 },
            graph: expect.objectContaining({ iterations: Math.min(graph.iterations, 8) }),
        }),
    );
    rerender({
        graph: {
            ...graph,
            nodes: graph.nodes.map((node) => ({ ...node, position: { x: 50, y: 50 } })),
        },
    });
    act(() => vi.advanceTimersByTime(300));
    expect(PreviewWorker.instances).toHaveLength(1);
    const simulation = new CraftingGraphSimulation(
        engine.catalog,
        { ...graph, iterations: 1 },
        { estimateIterations: 1 },
    );
    while (!simulation.done) simulation.runBatch();
    const done = new MessageEvent("message", {
        data: { type: "done", result: simulation.result() },
    });
    act(() => first.onmessage?.(done));
    expect(result.current.result?.trials).toBe(1);
    expect(result.current.busy).toBe(false);
    rerender({ graph: { ...graph, maxSteps: graph.maxSteps + 1 } });
    expect(result.current.result).toBeUndefined();
    act(() => first.onmessage?.(done));
    expect(result.current.result).toBeUndefined();
    expect(first.terminate).toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    const second = PreviewWorker.instances[1]!;
    unmount();
    expect(second.terminate).toHaveBeenCalled();
});

it("reports invalid worker results instead of keeping a stale preview or spinning indefinitely", () => {
    const { result } = renderHook(() => useGraphPreview(graphFixture(), true));
    act(() => vi.advanceTimersByTime(250));
    const worker = PreviewWorker.instances[0]!;
    act(() =>
        worker.onmessage?.(new MessageEvent("message", { data: { type: "done", result: {} } })),
    );
    expect(result.current.error).toBe("The preview returned an invalid result.");
    expect(result.current.busy).toBe(false);
    expect(result.current.result).toBeUndefined();
    expect(worker.terminate).toHaveBeenCalled();
});
