// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { GraphProjectEditor } from "../app/components/crafting/graph-project-editor";
import { seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { craftingNodeCostKey } from "../app/lib/crafting-node-prices";
import { validateRulesetIndex } from "../app/lib/crafting-rulesets";
import { type CraftingGraph, craftingGraphSchema } from "../app/schemas/crafting-graph";
import index from "../crafting-history/index.json";
import { exchangeGraph, transmuteId } from "./crafting-exchange-fixtures";
import { baseId, catalog, engine } from "./crafting-fixtures";
import { graphFixture } from "./crafting-graph-fixtures";

const historyIndex = validateRulesetIndex(index);

function mountGraph(graph: CraftingGraph) {
    const ruleset = {
        ...historyIndex.revisions.find(
            (entry) => entry.game === "poe1" && entry.revision === "r7",
        )!,
        ...graph.ruleset,
    };
    const editorIndex = {
        format: 1 as const,
        revisions: [ruleset],
        latest: [{ game: ruleset.game, era: ruleset.era, revision: ruleset.revision }],
    };
    let saved = graph;
    function Harness() {
        const [value, setValue] = useState(graph);
        return (
            <GraphProjectEditor
                project={{ graph: value, revision: 1, updatedAt: "2026-10-22T00:00:00Z" }}
                currentCatalog={catalog}
                ruleset={ruleset}
                index={editorIndex}
                onChange={(next) => {
                    saved = next;
                    setValue(next);
                }}
                onCopy={() => {}}
                onExport={() => {}}
            />
        );
    }
    render(<Harness />);
    return () => saved;
}

vi.mock("~/components/crafting/graph-canvas", () => ({
    // biome-ignore lint/style/useNamingConvention: Mocked React component export.
    GraphCanvas: ({ settings }: { settings: ReactNode }) => <div>{settings}</div>,
}));
vi.mock("~/hooks/use-graph-preview", async (original) => ({
    ...(await original<typeof import("../app/hooks/use-graph-preview")>()),
    useGraphPreview: () => ({ busy: false }),
}));
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("lets the graph price bench replacement fees and includes them in exchange lookup", async () => {
    const graph = exchangeGraph();
    const acquire = graph.nodes[0]!;
    const craft = graph.nodes[1]!;
    if (
        acquire.kind !== "acquire" ||
        acquire.alternatives[0]?.kind !== "purchase" ||
        craft.kind !== "craft"
    )
        throw new Error("Fixture");
    acquire.alternatives[0].item = engine.apply(
        { ...engine.createItem(baseId), rarity: "rare" },
        { kind: "bench", id: "bench:77" },
        seededRandom(1),
    ).item;
    craft.method = { kind: "bench", id: "bench:78" };
    graph.prices[transmuteId] = {
        amount: 1,
        currency: "chaos",
        source: "manual",
        confidence: null,
    };
    const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ quotes: {}, missing: {} })));
    vi.stubGlobal("fetch", fetcher);
    const saved = mountGraph(graph);
    const fee = await screen.findByRole("spinbutton", { name: /Orb of Scouring \(chaos\)/ });
    fireEvent.change(fee, { target: { value: "2" } });
    const calculated = calculateCraftingGraph(
        catalog,
        { ...saved(), iterations: 1 },
        { estimateIterations: 1 },
    );
    expect(calculated.missingPrices).toEqual([]);
    expect(calculated.meanCost).toBe(13);
    fireEvent.click(screen.getByText("Currency & essence exchange prices"));
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    const body = JSON.parse(fetcher.mock.calls.at(-1)![1].body);
    expect(body.itemIds).toContain("Metadata/Items/Currency/CurrencyConvertToNormal");
});

function generatedGraph() {
    const graph = exchangeGraph();
    const first = graph.nodes[1]!;
    if (first.kind !== "craft") throw new Error("Fixture");
    first.name = "First generated item";
    first.method = { kind: "generate", id: "rare" };
    graph.nodes.push({
        ...first,
        id: "second",
        name: "Second generated item",
        inputs: [{ id: "item", name: "First item", source: first.id }],
    });
    graph.entry = "second";
    graph.prices["generated:rare"] = {
        amount: 3,
        currency: "chaos",
        source: "manual",
        confidence: null,
    };
    return craftingGraphSchema.parse(graph);
}

it("prices generated steps separately, restores the shared fallback, and keeps scoped IDs out of lookups", async () => {
    const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ quotes: {}, missing: {} })));
    vi.stubGlobal("fetch", fetcher);
    const graph = generatedGraph();
    const saved = mountGraph(graph);
    const first = await screen.findByRole("spinbutton", {
        name: /First generated item · Generated rare item \(chaos\)/,
    });
    const second = screen.getByRole("spinbutton", {
        name: /Second generated item · Generated rare item \(chaos\)/,
    });
    expect(screen.getAllByText("Uses shared price: 3 chaos")).toHaveLength(2);
    fireEvent.change(first, { target: { value: "2" } });
    fireEvent.change(second, { target: { value: "7" } });
    expect(saved().prices[craftingNodeCostKey("transmute", "generated:rare")]?.amount).toBe(2);
    expect(saved().prices[craftingNodeCostKey("second", "generated:rare")]?.amount).toBe(7);
    expect(
        calculateCraftingGraph(catalog, { ...saved(), iterations: 1 }, { estimateIterations: 1 })
            .meanCost,
    ).toBe(19);
    fireEvent.change(first, { target: { value: "" } });
    expect(saved().prices[craftingNodeCostKey("transmute", "generated:rare")]).toBeUndefined();
    expect(
        calculateCraftingGraph(catalog, { ...saved(), iterations: 1 }, { estimateIterations: 1 })
            .meanCost,
    ).toBe(20);
    fireEvent.change(second, { target: { value: "0" } });
    expect(
        calculateCraftingGraph(catalog, { ...saved(), iterations: 1 }, { estimateIterations: 1 })
            .meanCost,
    ).toBe(13);
    fireEvent.click(screen.getByText("Currency & essence exchange prices"));
    fireEvent.click(screen.getByRole("button", { name: "Find exchange prices" }));
    await waitFor(() =>
        expect(fetcher.mock.calls.some(([url]) => url === "/api/v1/crafting/market/exchange")).toBe(
            true,
        ),
    );
    const request = JSON.parse(
        fetcher.mock.calls.find(([url]) => url === "/api/v1/crafting/market/exchange")![1].body,
    );
    expect(request.itemIds).not.toEqual(expect.arrayContaining([expect.stringMatching(/^node:/)]));
});

it("keeps retained revisions on shared assumptions without offering unsupported scoped prices", async () => {
    const graph = generatedGraph();
    graph.ruleset = { ...graph.ruleset, revision: "r7", engine: "crafting-graph-7" };
    mountGraph(graph);
    await screen.findByRole("spinbutton", { name: /Generated rare item \(chaos\)/ });
    expect(screen.queryByRole("region", { name: "Prices for individual steps" })).toBeNull();
});

it("offers a manual fee for an individual recombination step", async () => {
    const saved = mountGraph(graphFixture());
    const fee = await screen.findByRole("spinbutton", {
        name: /Combine donors · Recombination service \(chaos\)/,
    });
    fireEvent.change(fee, { target: { value: "5" } });
    expect(saved().prices[craftingNodeCostKey("combine", "service:recombine")]).toMatchObject({
        amount: 5,
        currency: "chaos",
        source: "manual",
    });
});
