import { itemQuerySchema } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { CRAFTING_GRAPH_ENGINE, validateCraftingGraph } from "../app/lib/crafting-graph-validation";
import type { CraftingItem } from "../app/schemas/crafting";
import { conditionalTransmuteGraph } from "./crafting-conditional-fixtures";
import { catalog, engine } from "./crafting-fixtures";
import {
    anyItem,
    firstItem,
    firstMod,
    graphFixture,
    queryMods,
    runGraphTrial,
} from "./crafting-graph-fixtures";
import { historyIndex, retainedTransmuteGraph } from "./crafting-history-fixtures";
import { workbenchCatalog } from "./crafting-workbench-fixtures";

const normal = (game: "poe1" | "poe2") =>
    itemQuerySchema.parse({
        game,
        groups: [{ type: "and", filters: [{ kind: "rarity", values: ["Normal"] }] }],
    });

describe("conditional graph steps", () => {
    it.each([
        "poe1",
        "poe2",
    ] as const)("fills only missing %s suffixes and preserves the prepared prefixes", (game) => {
        const data = workbenchCatalog(game);
        const engine = new CraftingEngine(data);
        for (const suffixes of [0, 2, 3]) {
            const graph = conditionalTransmuteGraph(game);
            const purchase = graph.nodes[0]!;
            if (purchase.kind !== "acquire" || purchase.alternatives[0]!.kind !== "purchase")
                throw new Error("Fixture");
            let item: CraftingItem = {
                ...purchase.alternatives[0]!.item,
                rarity: "rare",
                mods: [],
            };
            for (const side of ["prefix", "suffix"] as const)
                for (let i = 0; i < (side === "prefix" ? 3 : suffixes); i++)
                    item = engine.addStartingMod(
                        item,
                        engine.pool(item, { side })[0]!.id,
                        seededRandom(i),
                    );
            purchase.alternatives[0]!.item = item;
            const craft = graph.nodes.find((node) => node.kind === "craft")!;
            const exalt = data.crafting.currencies.find(
                (entry) => entry.action === "add_mod_to_rare",
            )!;
            craft.method = { kind: "currency", id: exalt.id };
            craft.applyWhen = itemQuerySchema.parse({
                game,
                groups: [
                    {
                        type: "and",
                        filters: [{ kind: "range", field: "openSuffixes", value: { min: 1 } }],
                    },
                ],
            });
            craft.output = itemQuerySchema.parse({
                game,
                groups: [
                    {
                        type: "and",
                        filters: [{ kind: "range", field: "suffixes", value: { min: 3 } }],
                    },
                ],
            });
            craft.branches = [
                {
                    id: "repeat",
                    name: "Fill remaining suffixes",
                    query: craft.applyWhen,
                    destination: {
                        kind: "recover",
                        nodeId: craft.id,
                        inputId: craft.inputs[0]!.id,
                    },
                },
            ];
            graph.outcomes[0]!.query = craft.output;
            graph.prices = {
                [exalt.id]: { amount: 2, currency: "chaos", source: "manual", confidence: null },
            };
            const result = calculateCraftingGraph(data, graph, {
                estimateIterations: 1,
                workLimit: 1000,
            });
            expect(result).toMatchObject({
                complete: true,
                meanCost: 10 + (3 - suffixes) * 2,
                meanActions: 3 - suffixes,
                probability: 1,
            });
            expect(result.samples[0]!.item!.mods).toEqual(expect.arrayContaining(item.mods));
            expect(result.samples[0]!.purchases).toBe(1);
        }
    });
    it.each([
        "poe1",
        "poe2",
    ] as const)("applies %s preparation only while needed, preserving ready items and costs", (game) => {
        const data = workbenchCatalog(game);
        const ruleset = historyIndex.revisions.find((entry) => entry.game === game)!;
        const graph = retainedTransmuteGraph(
            { ...ruleset, engine: CRAFTING_GRAPH_ENGINE, revision: "r5" },
            data,
        );
        const craft = graph.nodes.find((node) => node.kind === "craft")!;
        craft.applyWhen = normal(game);
        const options = { estimateIterations: 1, workLimit: 1000 };
        expect(calculateCraftingGraph(data, graph, options)).toMatchObject({
            complete: true,
            meanCost: 11,
            meanActions: 1,
            probability: 1,
        });
        const purchase = graph.nodes[0]!;
        if (purchase.kind !== "acquire" || purchase.alternatives[0]!.kind !== "purchase")
            throw new Error("Fixture");
        const ready = new CraftingEngine(data).apply(
            purchase.alternatives[0]!.item,
            craft.method,
            seededRandom(42),
        ).item;
        purchase.alternatives[0]!.item = ready;
        const result = calculateCraftingGraph(data, graph, options);
        expect(result).toMatchObject({
            complete: true,
            meanCost: 10,
            meanActions: 0,
            probability: 1,
            visits: { transmute: { skipped: 3 } },
        });
        expect(result.samples[0]).toMatchObject({ item: ready, consumedItems: 0, purchases: 1 });
        expect(result.samples[0]!.trace).toContainEqual({
            nodeId: "transmute",
            inputs: ["item-1"],
            outputs: ["item-1"],
            skipped: true,
        });
    });

    it("checks the first input before acquiring or consuming a recombination donor", () => {
        const graph = graphFixture();
        const craft = graph.nodes.find((node) => node.kind === "craft")!;
        craft.applyWhen = normal("poe1");
        craft.output = queryMods(firstMod);
        craft.branches = [];
        craft.fallback = { kind: "return" };
        graph.outcomes[0]!.query = craft.output;
        const donor = graph.nodes[1]!;
        if (donor.kind !== "acquire" || donor.alternatives[0]!.kind !== "purchase")
            throw new Error("Fixture");
        donor.alternatives[0]!.price = null;
        const result = calculateCraftingGraph(catalog, graph, {
            estimateIterations: 1,
            workLimit: 1000,
        });
        expect(result).toMatchObject({
            complete: true,
            meanCost: 10,
            meanActions: 0,
            missingPrices: [],
            probability: 1,
        });
        expect(result.samples[0]).toMatchObject({
            item: firstItem,
            purchases: 1,
            consumedItems: 0,
        });
        expect(result.spending["purchase:b:buy"]).toBeUndefined();
        expect(result.spending["service:recombine"]).toBeUndefined();
    });

    it("refuses unknown conditions without spending currency or losing the acquired item", () => {
        const graph = graphFixture();
        const craft = graph.nodes.find((node) => node.kind === "craft")!;
        craft.applyWhen = itemQuerySchema.parse({
            game: "poe1",
            groups: [
                { type: "and", filters: [{ kind: "range", field: "links", value: { min: 4 } }] },
            ],
        });
        const purchase = graph.nodes[0]!;
        if (purchase.kind !== "acquire" || purchase.alternatives[0]!.kind !== "purchase")
            throw new Error("Fixture");
        purchase.alternatives[0]!.item = { ...firstItem, sockets: 6, socketLinks: undefined };
        const trial = new CraftingGraphTrial(
            engine,
            validateCraftingGraph(catalog, graph),
            seededRandom(1),
        );
        while (!trial.done) trial.advance();
        expect(trial.result()).toMatchObject({
            status: "error",
            actions: 0,
            purchases: 1,
            cost: 10,
            consumedItems: 0,
            retained: [{ id: "item-1" }],
        });
        expect(trial.result().error).toContain("Cannot resolve the apply condition");
    });

    it("still enforces output queries and bounds recovery loops when a craft is skipped", () => {
        const graph = graphFixture();
        const craft = graph.nodes.find((node) => node.kind === "craft")!;
        craft.applyWhen = normal("poe1");
        craft.branches = [];
        craft.fallback = { kind: "return" };
        expect(runGraphTrial(graph, seededRandom(1)).error).toContain("output query");
        craft.output = anyItem;
        craft.fallback = { kind: "recover", nodeId: craft.id, inputId: "left" };
        graph.maxSteps = 6;
        expect(runGraphTrial(graph, seededRandom(1))).toMatchObject({
            status: "truncated",
            actions: 0,
            purchases: 1,
            cost: 10,
            consumedItems: 0,
        });
        craft.applyWhen = normal("poe2");
        expect(() => validateCraftingGraph(catalog, graph)).toThrow("project's game");
    });
});
