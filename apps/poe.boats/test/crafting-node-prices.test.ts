import { describe, expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { craftingNodeCostKey, craftingNodeCostPrice } from "../app/lib/crafting-node-prices";
import {
    rulesetAllowsConditionalSteps,
    rulesetAllowsScopedCraftPrices,
    rulesetAllowsSimpleCraft,
    rulesetReference,
    validateRulesetGraph,
} from "../app/lib/crafting-rulesets";
import type { GraphCraftNode } from "../app/schemas/crafting-graph";
import { catalog } from "./crafting-fixtures";
import {
    anyItem,
    firstItem,
    firstMod,
    graphFixture,
    quote,
    runGraphTrial,
    secondMod,
    selectedOutcomes,
} from "./crafting-graph-fixtures";
import {
    historyIndex,
    retainedRevision,
    retainedTransmuteGraph,
} from "./crafting-history-fixtures";

function generatedGraph() {
    const graph = graphFixture();
    const generate: GraphCraftNode = {
        kind: "craft",
        id: "generate:first",
        name: "Generate first base",
        output: anyItem,
        inputs: [{ id: "item", name: "Template", source: "a" }],
        method: { kind: "generate", id: "normal" },
        branches: [],
        ordering: "manual",
        fallback: { kind: "return" },
    };
    graph.nodes = [graph.nodes[0]!, generate];
    graph.entry = generate.id;
    graph.outcomes = [{ ...graph.outcomes[0]!, query: anyItem }];
    graph.prices = { "generated:normal": quote(1) };
    return graph;
}

describe("per-step crafting prices", () => {
    it("keeps delimiter-containing IDs distinct and preserves a zero override", () => {
        const first = craftingNodeCostKey("a:b", "c");
        const second = craftingNodeCostKey("a", "b:c");
        expect(first).not.toBe(second);
        expect(craftingNodeCostKey("a%3Ab", "c")).not.toBe(first);
        expect(craftingNodeCostPrice({ c: quote(5), [first]: quote(0) }, "a:b", "c")?.amount).toBe(
            0,
        );
        expect(craftingNodeCostPrice({ c: quote(5) }, "a:b", "c")?.amount).toBe(5);
        expect(craftingNodeCostPrice({}, "a:b", "c")).toBeNull();
    });

    it("prices two generated inputs independently with global fallback and unchanged spending", () => {
        const graph = generatedGraph();
        const first = graph.nodes[1] as GraphCraftNode;
        graph.nodes.push({
            ...first,
            id: "generate:second",
            name: "Generate second base",
            inputs: [{ id: "item", name: "Template", source: first.id }],
        });
        graph.entry = "generate:second";
        graph.prices[craftingNodeCostKey(first.id, "generated:normal")] = quote(2);
        expect(runGraphTrial(graph, seededRandom(1))).toMatchObject({
            cost: 13,
            actions: 2,
            spending: { "generated:normal": 2 },
        });
        graph.prices[craftingNodeCostKey("generate:second", "generated:normal")] = quote(7);
        delete graph.prices["generated:normal"];
        const result = runGraphTrial(graph, seededRandom(1));
        expect(result).toMatchObject({ cost: 19, missingPrices: [], actions: 2 });
        delete graph.prices[craftingNodeCostKey("generate:second", "generated:normal")];
        expect(runGraphTrial(graph, seededRandom(1))).toMatchObject({
            cost: null,
            knownCost: 12,
            missingPrices: ["generated:normal"],
        });
    });

    it("charges the recombination override on every attempt while recovered donors remain free", () => {
        const graph = graphFixture();
        graph.prices[craftingNodeCostKey("combine", "service:recombine")] = quote(7);
        const result = runGraphTrial(graph, selectedOutcomes([firstMod], [firstMod, secondMod]));
        expect(result).toMatchObject({
            cost: 64,
            actions: 2,
            purchases: 3,
            spending: { "service:recombine": 2 },
            visits: { combine: { recovered: 1 } },
        });
    });

    it("uses scoped costs in production estimates before choosing whether to buy or craft", () => {
        const graph = generatedGraph();
        graph.nodes.push({
            kind: "acquire",
            id: "prepared",
            name: "Prepared input",
            output: anyItem,
            choice: { mode: "automatic" },
            alternatives: [
                { kind: "purchase", id: "buy", name: "Buy", item: firstItem, price: quote(20) },
                { kind: "production", id: "make", name: "Make", nodeId: graph.entry },
            ],
        });
        const generation = graph.entry;
        graph.entry = "prepared";
        const cheap = calculateCraftingGraph(catalog, graph, { estimateIterations: 3 });
        expect(cheap.acquisitions.prepared?.selectedId).toBe("make");
        expect(cheap.meanCost).toBe(11);
        graph.prices[craftingNodeCostKey(generation, "generated:normal")] = quote(15);
        const expensive = calculateCraftingGraph(catalog, graph, { estimateIterations: 3 });
        expect(expensive.estimates.find((entry) => entry.nodeId === generation)?.expectedCost).toBe(
            25,
        );
        expect(expensive.acquisitions.prepared?.selectedId).toBe("buy");
        expect(expensive.meanCost).toBe(20);
    });

    it("requires the new runtime for overrides while retaining earlier simple and conditional capabilities", () => {
        const prior = historyIndex.revisions.find(
            (entry) => entry.game === "poe1" && entry.revision === "r7",
        )!;
        const current = { ...prior, revision: "r8", engine: "crafting-graph-8" };
        const graph = generatedGraph();
        graph.ruleset = rulesetReference(prior);
        expect(validateRulesetGraph(prior, graph)).toEqual(graph);
        graph.prices[craftingNodeCostKey("generate:first", "generated:normal")] = quote(2);
        expect(() => validateRulesetGraph(prior, graph)).toThrow("scoped crafting prices");
        graph.ruleset = rulesetReference(current);
        expect(validateRulesetGraph(current, graph)).toEqual(graph);
        expect(rulesetAllowsScopedCraftPrices(prior)).toBe(false);
        expect(rulesetAllowsScopedCraftPrices(current)).toBe(true);
        expect(rulesetAllowsScopedCraftPrices({ engine: "crafting-graph-9" })).toBe(false);
        for (const ruleset of [prior, current]) {
            expect(rulesetAllowsSimpleCraft(ruleset)).toBe(true);
            expect(rulesetAllowsConditionalSteps(ruleset)).toBe(true);
        }
        expect(rulesetAllowsSimpleCraft({ engine: "crafting-graph-6" })).toBe(false);
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("retains published %s r7 global pricing and applies overrides only in published r8", async (game) => {
        for (const revision of ["r7", "r8"] as const) {
            const ruleset = historyIndex.revisions.find(
                (entry) => entry.game === game && entry.revision === revision,
            )!;
            const loaded = await retainedRevision(ruleset);
            const graph = retainedTransmuteGraph(ruleset, loaded.catalog);
            const run = () => {
                const simulation = loaded.runtime.createSimulation(loaded.catalog, graph, {
                    estimateIterations: 1,
                });
                while (!simulation.done) simulation.runBatch();
                return simulation.result();
            };
            expect(run()).toMatchObject({ complete: true, meanCost: 11 });
            const currency = Object.keys(graph.prices)[0]!;
            graph.prices[craftingNodeCostKey("transmute", currency)] = quote(5);
            if (revision === "r7")
                expect(() => validateRulesetGraph(ruleset, graph)).toThrow(
                    "scoped crafting prices",
                );
            else expect(validateRulesetGraph(ruleset, graph)).toEqual(graph);
            expect(run()).toMatchObject({
                complete: true,
                meanCost: revision === "r7" ? 11 : 15,
            });
        }
    });
});
