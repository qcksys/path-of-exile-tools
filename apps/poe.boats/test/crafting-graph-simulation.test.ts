import { readFileSync } from "node:fs";
import { itemQuerySchema } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine } from "../app/lib/crafting-engine";
import {
    CraftingGraphSimulation,
    calculateCraftingGraph,
} from "../app/lib/crafting-graph-simulation";
import { CRAFTING_GRAPH_ENGINE } from "../app/lib/crafting-graph-validation";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import { craftingCatalogSchema } from "../app/schemas/crafting";
import { craftingGraphSchema } from "../app/schemas/crafting-graph";
import { catalog, engine } from "./crafting-fixtures";
import {
    firstItem,
    firstMod,
    graphFixture,
    queryMods,
    quote,
    secondItem,
    secondMod,
} from "./crafting-graph-fixtures";

const poe2 = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);

function magicGraph(data = poe2) {
    const engine = new CraftingEngine(data);
    const id = Object.entries(data.bases).find(
        ([, base]) =>
            base.item_class === "Ring" && !base.corrupted && base.rarities.includes("normal"),
    )![0];
    const item = engine.createItem(id, 86);
    const currency = data.crafting.currencies.find(
        (entry) => entry.action === "transmute_to_magic",
    )!;
    const any = itemQuerySchema.parse({ game: data.game });
    const magic = itemQuerySchema.parse({
        game: data.game,
        groups: [{ type: "and", filters: [{ kind: "rarity", values: ["Magic"] }] }],
    });
    return craftingGraphSchema.parse({
        format: 1,
        id: "magic",
        name: "Buy or make a magic ring",
        game: data.game,
        ruleset: {
            era: "fixture-era",
            revision: "fixture-revision",
            engine: CRAFTING_GRAPH_ENGINE,
            patch: data.patch,
            manifestSha256: data.manifestSha256,
            craftingSha256: data.craftingSha256,
        },
        nodes: [
            {
                kind: "acquire",
                id: "base",
                name: "Base",
                output: any,
                alternatives: [
                    { kind: "purchase", id: "buy", name: "Buy normal", item, price: quote(10) },
                ],
            },
            {
                kind: "craft",
                id: "transmute",
                name: "Transmute",
                output: magic,
                method: { kind: "currency", id: currency.id },
                inputs: [{ id: "item", name: "Base", source: "base" }],
            },
            {
                kind: "acquire",
                id: "prepared",
                name: "Prepared base",
                output: magic,
                alternatives: [
                    {
                        kind: "purchase",
                        id: "buy",
                        name: "Buy magic",
                        item: { ...item, rarity: "magic" },
                        price: quote(20),
                    },
                    { kind: "production", id: "craft", name: "Make magic", nodeId: "transmute" },
                ],
            },
        ],
        entry: "prepared",
        outcomes: [{ id: "magic", name: "Magic ring", query: magic }],
        prices: { [currency.id]: quote(1) },
        iterations: 12,
    });
}

describe("whole-graph calculation", () => {
    it.each([catalog, poe2])("compares purchasing and crafting using the $game engine", (data) => {
        const graph = magicGraph(data);
        const result = calculateCraftingGraph(data, graph, { estimateIterations: 4 });
        expect(result).toMatchObject({
            complete: true,
            trials: 12,
            meanCost: 11,
            meanActions: 1,
            probability: 1,
        });
        expect(result.acquisitions.prepared).toMatchObject({
            selectedId: "craft",
            incomplete: false,
        });
        const currency = Object.keys(graph.prices)[0]!;
        graph.prices[currency] = quote(15);
        const bought = calculateCraftingGraph(data, graph, { estimateIterations: 4 });
        expect(bought.acquisitions.prepared?.selectedId).toBe("buy");
        expect(bought.meanCost).toBe(20);
        expect(bought.meanActions).toBe(0);
        const prepared = graph.nodes
            .filter((node) => node.kind === "acquire")
            .find((node) => node.id === "prepared")!;
        prepared.choice = { mode: "pinned", alternativeId: "craft" };
        const pinned = calculateCraftingGraph(data, graph, { estimateIterations: 4 });
        expect(pinned.acquisitions.prepared?.selectedId).toBe("craft");
        expect(pinned.meanCost).toBe(25);
    });

    it("agrees with the analytic recovery cost of the real two-donor recombination model", () => {
        const graph = graphFixture();
        graph.iterations = 1000;
        graph.maxSteps = 10_000;
        const outcomes = recombinationOutcomes(engine, firstItem, secondItem);
        let both = 0;
        let first = 0;
        let second = 0;
        for (const outcome of outcomes) {
            const a = outcome.value.mods.some((mod) => mod.id === firstMod);
            const b = outcome.value.mods.some((mod) => mod.id === secondMod);
            if (a && b) both += outcome.weight;
            else if (a) first += outcome.weight;
            else if (b) second += outcome.weight;
        }
        const expected = (31 - 10 * first - 20 * second) / both;
        const result = calculateCraftingGraph(catalog, graph, { estimateIterations: 10 });
        expect(result.complete).toBe(true);
        expect(result.meanCost).toBeGreaterThan(expected * 0.9);
        expect(result.meanCost).toBeLessThan(expected * 1.1);
        expect(result.probability).toBe(1);
        expect(result.visits.combine!.recovered).toBeGreaterThan(100);
        expect(Object.keys(result.spending).some((id) => id.startsWith("donor:"))).toBe(false);
    }, 30_000);

    it("leaves expected cost unresolved when the work budget ends during a trial", () => {
        const simulation = new CraftingGraphSimulation(catalog, graphFixture(), { workLimit: 3 });
        while (!simulation.runBatch(1)) {
            /* Exercise incremental worker execution. */
        }
        expect(simulation.result()).toMatchObject({
            complete: false,
            stopReason: "work-limit",
            meanCost: null,
            probability: null,
        });
        expect(simulation.result().unfinished).not.toBeNull();
    });

    it("preserves production return uncertainty through an acquisition alternative", () => {
        const graph = graphFixture();
        const combine = graph.nodes.find((node) => node.kind === "craft")!;
        combine.branches.find((branch) => branch.id === "first")!.destination = {
            kind: "terminal",
            outcomeId: "miss",
        };
        graph.outcomes.push({
            id: "miss",
            name: "Single modifier",
            query: queryMods(firstMod),
            success: false,
            disposition: "discard",
            price: null,
        });
        graph.nodes.push({
            kind: "acquire",
            id: "prepared",
            name: "Prepared item",
            output: combine.output,
            alternatives: [{ kind: "production", id: "craft", name: "Make it", nodeId: "combine" }],
            choice: { mode: "pinned", alternativeId: "craft" },
        });
        graph.entry = "prepared";
        const result = calculateCraftingGraph(catalog, graph, { estimateIterations: 100 });
        const craft = result.estimates.find((estimate) => estimate.nodeId === "combine")!;
        const acquired = result.estimates.find((estimate) => estimate.nodeId === "prepared")!;
        expect(craft.returnProbability).toBeGreaterThan(0);
        expect(craft.returnProbability).toBeLessThan(1);
        expect(acquired).toEqual({ ...craft, nodeId: "prepared" });
    });

    it("lets a pinned route calculate probabilities with an explicitly missing price", () => {
        const graph = magicGraph();
        graph.prices = {};
        const prepared = graph.nodes
            .filter((node) => node.kind === "acquire")
            .find((node) => node.id === "prepared")!;
        prepared.choice = { mode: "pinned", alternativeId: "craft" };
        const result = calculateCraftingGraph(poe2, graph, { estimateIterations: 3 });
        expect(result).toMatchObject({ complete: true, meanCost: null, probability: 1 });
        expect(result.missingPrices).toHaveLength(1);
        expect(result.observedCost).toBe(10);
    });
});
