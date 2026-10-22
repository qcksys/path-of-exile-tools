import { itemQuerySchema } from "@poe-tools/item-query";
import { expect, it } from "vite-plus/test";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { craftingNodeCostKey } from "../app/lib/crafting-node-prices";
import { rulesetReference } from "../app/lib/crafting-rulesets";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { craftingGraphResultSchema } from "../app/schemas/crafting-graph-result";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";
import { anyItem, graphFixture, quote } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

const transmute = currency("transmute_to_magic");
const normal = engine.createItem(baseId, 86);

function fixture() {
    return craftingGraphSchema.parse({
        ...graphFixture(),
        nodes: [
            {
                kind: "acquire",
                id: "base",
                name: "Unrolled base",
                output: anyItem,
                alternatives: [
                    {
                        kind: "purchase",
                        id: "buy",
                        name: "Buy base",
                        item: normal,
                        price: quote(10),
                    },
                ],
            },
            {
                kind: "craft",
                id: "make",
                name: "Transmute base",
                output: anyItem,
                method: transmute,
                inputs: [{ id: "item", name: "Base", source: "base" }],
            },
            {
                kind: "acquire",
                id: "prepared",
                name: "Prepared base",
                output: anyItem,
                choice: { mode: "pinned", alternativeId: "buy" },
                alternatives: [
                    {
                        kind: "purchase",
                        id: "buy",
                        name: "Buy Magic",
                        item: { ...normal, rarity: "magic" },
                        price: quote(20),
                    },
                    { kind: "production", id: "craft", name: "Make Magic", nodeId: "make" },
                ],
            },
        ],
        entry: "prepared",
        outcomes: [{ id: "ready", name: "Ready", query: anyItem }],
        prices: { [transmute.id]: quote(1) },
        iterations: 3,
    });
}

function acquisition(graph: ReturnType<typeof fixture>, id: string) {
    const node = graph.nodes.find((entry) => entry.id === id);
    if (node?.kind !== "acquire") throw new Error(`Missing acquisition ${id}`);
    return node;
}

function craft(graph: ReturnType<typeof fixture>, id: string) {
    const node = graph.nodes.find((entry) => entry.id === id);
    if (node?.kind !== "craft") throw new Error(`Missing craft ${id}`);
    return node;
}

it("keeps a shared production dependency active alongside a pinned purchase", () => {
    const graph = fixture();
    graph.nodes.push({
        ...craft(graph, "make"),
        id: "combine",
        method: { kind: "recombine", id: "recombine" },
        inputs: [
            { id: "first", name: "Purchased", source: "prepared" },
            { id: "second", name: "Produced", source: "make" },
        ],
    });
    graph.entry = "combine";
    graph.prices["service:recombine"] = quote(1);
    const result = calculateCraftingGraph(catalog, graph, { estimateIterations: 2 });
    expect(result).toMatchObject({ complete: true, meanCost: 32, missingPrices: [], errors: {} });
    expect(result.estimates.map((entry) => entry.nodeId)).toEqual([
        "base",
        "make",
        "prepared",
        "combine",
    ]);
    expect(result.acquisitions.prepared).toMatchObject({ selectedId: "buy" });
    expect(result.acquisitions.prepared?.alternatives[1]).toMatchObject({
        estimated: true,
        expectedCost: 11,
    });
    expect(result.samples.every((sample) => sample.purchases === 2 && sample.actions === 2)).toBe(
        true,
    );
});

it.each(["method", "source", "cycle", "purchase"])("still rejects an invalid unused %s", (kind) => {
    const graph = fixture();
    if (kind === "method") craft(graph, "make").method = { kind: "currency", id: "missing-method" };
    if (kind === "source") craft(graph, "make").inputs[0]!.source = "missing-source";
    if (kind === "cycle") craft(graph, "make").inputs[0]!.source = "prepared";
    if (kind === "purchase") {
        const buy = acquisition(graph, "base").alternatives[0]!;
        if (buy.kind !== "purchase") throw new Error("Expected purchase");
        buy.item = { ...buy.item, destroyed: true };
    }
    expect(() => calculateCraftingGraph(catalog, graph, { estimateIterations: 1 })).toThrow();
});

it("keeps skipped action and unused second-input prices unknown until explicitly supplied", () => {
    const graph = fixture();
    const donor = acquisition(graph, "base");
    const donorPurchase = donor.alternatives[0]!;
    if (donorPurchase.kind !== "purchase") throw new Error("Expected purchase");
    donorPurchase.price = null;
    const never = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "and", filters: [{ kind: "rarity", values: ["Rare"] }] }],
    });
    graph.nodes.push({
        ...craft(graph, "make"),
        id: "conditional:combine",
        method: { kind: "recombine", id: "recombine" },
        applyWhen: never,
        inputs: [
            { id: "first", name: "Magic", source: "prepared" },
            { id: "second", name: "Unrolled donor", source: "base" },
        ],
    });
    graph.entry = "conditional:combine";
    const result = calculateCraftingGraph(catalog, graph, { estimateIterations: 2 });
    expect(result).toMatchObject({ complete: true, meanCost: null, observedCost: 20, errors: {} });
    expect(result.missingPrices).toContain("service:recombine");
    expect(result.samples.every((sample) => sample.purchases === 1 && sample.actions === 0)).toBe(
        true,
    );
    graph.prices[craftingNodeCostKey(graph.entry, "service:recombine")] = quote(0);
    const scoped = calculateCraftingGraph(catalog, graph, { estimateIterations: 2 });
    expect(scoped).toMatchObject({ meanCost: null, missingPrices: ["purchase:base:buy"] });
    donorPurchase.price = quote(10);
    const priced = calculateCraftingGraph(catalog, graph, { estimateIterations: 2 });
    expect(priced).toMatchObject({ complete: true, meanCost: 20, missingPrices: [] });
});

it("preserves retained r8 eager estimates and accepts its original result schema", async () => {
    const ruleset = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === "r8",
    )!;
    const retained = await retainedRevision(ruleset);
    const graph = fixture();
    const current = calculateCraftingGraph(catalog, graph, { estimateIterations: 2 });
    const oldGraph = { ...graph, ruleset: rulesetReference(ruleset) };
    const simulation = retained.runtime.createSimulation(retained.catalog, oldGraph, {
        estimateIterations: 2,
    });
    while (!simulation.done) simulation.runBatch(100);
    const old = craftingGraphResultSchema.parse(simulation.result());
    expect(old).toMatchObject({ complete: true, meanCost: 20, missingPrices: [] });
    expect(old.estimates.map((entry) => entry.nodeId)).toEqual(["base", "make", "prepared"]);
    expect(old.acquisitions.prepared?.alternatives[1]).toMatchObject({ expectedCost: 11 });
    expect(old.acquisitions.prepared?.alternatives[1]?.estimated).toBeUndefined();
    expect(current.estimates.map((entry) => entry.nodeId)).toEqual(["prepared"]);
    expect(current.acquisitions.prepared?.alternatives[1]).toMatchObject({
        estimated: false,
        expectedCost: null,
    });
    expect(current.work).toBeLessThan(old.work);
    expect(() => calculateCraftingGraph(catalog, oldGraph)).toThrow(
        "different crafting engine revision",
    );

    acquisition(graph, "prepared").choice = { mode: "pinned", alternativeId: "craft" };
    const newProduced = calculateCraftingGraph(catalog, graph, { estimateIterations: 2 });
    const oldProduced = retained.runtime.createSimulation(
        retained.catalog,
        { ...graph, ruleset: rulesetReference(ruleset) },
        { estimateIterations: 2 },
    );
    while (!oldProduced.done) oldProduced.runBatch(100);
    expect(newProduced.meanCost).toBe(11);
    expect(oldProduced.result().meanCost).toBe(11);
    expect(newProduced.samples.map((sample) => sample.item)).toEqual(
        oldProduced.result().samples.map((sample) => sample.item),
    );
});
