import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vite-plus/test";
import { CraftingGraphSimulation } from "~/lib/crafting-graph-simulation";
import { craftingNodeCostKey } from "~/lib/crafting-node-prices";
import { loadCraftingRevision } from "~/lib/crafting-ruleset-loader";
import type { HistoricalCraftingRuntime } from "~/lib/crafting-runtime";
import { emptyResonatorQuote, legacyResonatorPrice } from "./crafting-commodity-fixtures";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { catalog } from "./crafting-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

vi.mock("~/lib/crafting-ruleset-loader", () => ({ loadCraftingRevision: vi.fn() }));

const worker = {
    onmessage: null as ((event: MessageEvent) => Promise<void>) | null,
    postMessage: vi.fn(),
};
const createSimulation = vi.fn<HistoricalCraftingRuntime["createSimulation"]>(
    (_catalog, graph, options) => new CraftingGraphSimulation(catalog, graph, options),
);
const fetcher = vi.fn();

beforeAll(async () => {
    vi.stubGlobal("self", worker);
    await import("~/lib/crafting-graph.worker");
});
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(historyIndex))));
    vi.mocked(loadCraftingRevision).mockResolvedValue({
        catalog,
        runtime: { revision: exchangeGraph().ruleset.engine, createSimulation },
    });
});
afterAll(() => vi.unstubAllGlobals());

it.each([
    false,
    true,
])("blocks an imported untagged resonator market price before worker simulation (scoped: %s)", async (scoped) => {
    const graph = exchangeGraph();
    const id = emptyResonatorQuote.id;
    const key = scoped ? craftingNodeCostKey("transmute", id) : id;
    graph.prices[key] = legacyResonatorPrice();
    const before = structuredClone(graph);
    await worker.onmessage!(new MessageEvent("message", { data: { type: "calculate", graph } }));
    expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
            type: "error",
            error: expect.stringContaining("no verified empty provenance"),
        }),
    );
    expect(createSimulation).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(graph).toEqual(before);
});

it("accepts explicit manual resonator prices without rewriting the saved draft", async () => {
    const graph = { ...exchangeGraph(), iterations: 1 };
    graph.prices[emptyResonatorQuote.id] = { ...legacyResonatorPrice(), source: "manual" };
    const before = structuredClone(graph);
    await worker.onmessage!(
        new MessageEvent("message", {
            data: { type: "calculate", graph, options: { estimateIterations: 1, workLimit: 100 } },
        }),
    );
    expect(createSimulation).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "done", result: expect.any(Object) }),
    );
    expect(graph).toEqual(before);
});

it("still loads the catalog so an imported legacy price can be edited", async () => {
    const graph = exchangeGraph();
    graph.prices[emptyResonatorQuote.id] = legacyResonatorPrice();
    await worker.onmessage!(new MessageEvent("message", { data: { type: "catalog", graph } }));
    expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "catalog", catalog }),
    );
    expect(createSimulation).not.toHaveBeenCalled();
});
