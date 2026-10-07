import { describe, expect, it } from "vite-plus/test";
import { validateCraftingGraph } from "../app/lib/crafting-graph-validation";
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

describe("multi-input crafting graph", () => {
    it.each([
        ["left", firstMod, 52],
        ["right", secondMod, 42],
    ] as const)("recovers the %s donor without rebuying it or cloning an input", (_port, mod, expectedCost) => {
        const graph = graphFixture();
        const original = structuredClone(graph);
        const result = runGraphTrial(graph, selectedOutcomes([mod], [firstMod, secondMod]));
        expect(result).toMatchObject({
            status: "terminal",
            outcomeId: "goal",
            success: true,
            actions: 2,
            purchases: 3,
            consumedItems: 4,
            cost: expectedCost,
            missingPrices: [],
        });
        const crafts = result.trace.filter((entry) => entry.inputs.length);
        expect(crafts).toHaveLength(2);
        expect(crafts[1]!.inputs).toContain(crafts[0]!.outputs[0]);
        const consumed = crafts.flatMap((entry) => entry.inputs);
        expect(new Set(consumed).size).toBe(consumed.length);
        expect(result.spending["service:recombine"]).toBe(2);
        expect(Object.keys(result.spending).some((key) => key.startsWith("donor:"))).toBe(false);
        expect(graph).toEqual(original);
    });

    it("pays for two physical items when two ports refer to the same purchase source", () => {
        const graph = graphFixture();
        const combine = graph.nodes.find((node) => node.kind === "craft")!;
        combine.inputs[1]!.source = "a";
        combine.output = anyItem;
        combine.branches = [];
        combine.fallback = { kind: "return" };
        graph.outcomes[0]!.query = anyItem;
        const result = runGraphTrial(graph, selectedOutcomes([firstMod]));
        expect(result).toMatchObject({ success: true, purchases: 2, consumedItems: 2, cost: 21 });
        expect(result.spending["purchase:a:buy"]).toBe(2);
        const craft = result.trace.find((entry) => entry.inputs.length)!;
        expect(new Set(craft.inputs).size).toBe(2);
    });

    it("credits explicit sale branches while excluding unvalued misses from recovery", () => {
        const graph = graphFixture();
        const combine = graph.nodes.find((node) => node.kind === "craft")!;
        const miss = combine.branches.find((branch) => branch.id === "first")!;
        miss.destination = { kind: "sell", price: quote(5) };
        graph.outcomes[0]!.disposition = "sell";
        graph.outcomes[0]!.price = quote(100);
        const result = runGraphTrial(graph, selectedOutcomes([firstMod], [firstMod, secondMod]));
        expect(result).toMatchObject({
            success: true,
            cost: 62,
            revenue: 105,
            excludedRecovery: 0,
        });
        miss.destination = { kind: "discard" };
        const discarded = runGraphTrial(graph, selectedOutcomes([firstMod], [firstMod, secondMod]));
        expect(discarded).toMatchObject({ cost: 62, revenue: 100, excludedRecovery: 1 });
    });

    it("reports missing acquisition or sale prices separately from known spending", () => {
        const graph = graphFixture();
        graph.prices = {};
        graph.outcomes[0]!.disposition = "sell";
        const result = runGraphTrial(graph, selectedOutcomes([firstMod, secondMod]));
        expect(result).toMatchObject({
            cost: null,
            knownCost: 30,
            revenue: null,
            missingPrices: ["service:recombine"],
            unpricedSales: ["outcome:goal"],
        });
    });

    it("stops an unproductive recovery loop with its costs and surviving item intact", () => {
        const graph = graphFixture();
        graph.maxSteps = 8;
        const result = runGraphTrial(
            graph,
            selectedOutcomes([firstMod], [firstMod], [firstMod], [firstMod]),
        );
        expect(result.status).toBe("truncated");
        expect(result.success).toBe(false);
        expect(result.error).toContain("step limit");
        expect(result.spending["purchase:a:buy"]).toBe(1);
        expect(result.knownCost).toBeGreaterThan(0);
        expect(
            result.retained.some((token) => token.item.mods.some((mod) => mod.id === firstMod)),
        ).toBe(true);
    });

    it("rejects missing ports, incompatible catalogs and embedded donor snapshots", () => {
        const graph = graphFixture();
        const combine = graph.nodes.find((node) => node.kind === "craft")!;
        combine.inputs.pop();
        expect(() => validateCraftingGraph(catalog, graph)).toThrow("requires 2");
        const stale = graphFixture();
        stale.ruleset.craftingSha256 = "0".repeat(64);
        expect(() => validateCraftingGraph(catalog, stale)).toThrow("pinned catalog");
        const invalid = graphFixture();
        const craft = invalid.nodes.find((node) => node.kind === "craft")!;
        craft.fallback = { kind: "recover", nodeId: "a", inputId: "missing" };
        expect(() => validateCraftingGraph(catalog, invalid)).toThrow("Unknown recovery input");
        craft.fallback = { kind: "return" };
        craft.method = {
            kind: "recombine",
            id: "recombine",
            donor: { id: "copy", name: "Donor", item: firstItem },
        };
        expect(() => validateCraftingGraph(catalog, invalid)).toThrow(
            "not an embedded inventory copy",
        );
    });

    it("refuses to recover an item into an incompatible input query", () => {
        const graph = graphFixture();
        const combine = graph.nodes.find((node) => node.kind === "craft")!;
        combine.branches.find((branch) => branch.id === "first")!.destination = {
            kind: "recover",
            nodeId: "combine",
            inputId: "right",
        };
        const result = runGraphTrial(graph, selectedOutcomes([firstMod]));
        expect(result.status).toBe("error");
        expect(result.error).toContain("does not establish the input query");
        expect(result.knownCost).toBe(31);
    });

    it("refuses circular production dependencies but permits explicit recovery cycles", () => {
        const graph = graphFixture();
        expect(() => validateCraftingGraph(catalog, graph)).not.toThrow();
        const combine = graph.nodes.find((node) => node.kind === "craft")!;
        combine.inputs[0]!.source = "combine";
        expect(() => validateCraftingGraph(catalog, graph)).toThrow(
            "Production dependencies form a cycle",
        );
    });
});
