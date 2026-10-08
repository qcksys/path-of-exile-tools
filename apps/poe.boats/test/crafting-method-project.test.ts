import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { projectFromMethod } from "../app/lib/crafting-method-project";
import { rulesetReference } from "../app/lib/crafting-rulesets";
import { projectFromMethodInputSchema } from "../app/schemas/crafting-method-project";
import { engine } from "./crafting-fixtures";
import { firstItem, quote, secondItem } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";
import { workbenchCatalog, workbenchProject } from "./crafting-workbench-fixtures";

describe("selected craft handoff", () => {
    it.each([
        "poe1",
        "poe2",
    ] as const)("preserves %s state and prices in a runnable single-input graph", (game) => {
        const project = workbenchProject(game);
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === game && entry.revision === "r6",
        )!;
        const input = projectFromMethodInputSchema.parse({
            game,
            ruleset: rulesetReference(ruleset),
            name: "Transmutation",
            item: { ...project.item, quality: 20 },
            method: project.method,
            price: quote(10),
            prices: Object.fromEntries(
                Object.entries(project.prices).map(([id, amount]) => [id, quote(amount)]),
            ),
        });
        const before = structuredClone(input);
        const graph = projectFromMethod(new CraftingEngine(workbenchCatalog(game)), ruleset, input);
        const result = calculateCraftingGraph(
            workbenchCatalog(game),
            { ...graph, iterations: 2 },
            { estimateIterations: 1, workLimit: 1000 },
        );
        expect(result).toMatchObject({
            complete: true,
            meanCost: 12,
            meanActions: 1,
            probability: 1,
        });
        expect(graph.nodes[0]).toMatchObject({
            alternatives: [{ item: input.item, price: quote(10) }],
        });
        expect(input).toEqual(before);
    });

    it("charges each full recombination donor exactly once and keeps the original rolls", () => {
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === "poe1" && entry.revision === "r6",
        )!;
        const input = projectFromMethodInputSchema.parse({
            game: "poe1",
            ruleset: rulesetReference(ruleset),
            name: "Two prepared donors",
            item: firstItem,
            method: {
                kind: "recombine",
                id: "recombine",
                donor: { id: "second", name: "Hybrid donor", item: secondItem },
            },
            price: quote(10),
            prices: { "donor:second": quote(15), "service:recombine": quote(2) },
        });
        const graph = projectFromMethod(engine, ruleset, input);
        expect(graph.nodes).toHaveLength(3);
        expect(graph.nodes[1]).toMatchObject({
            kind: "acquire",
            alternatives: [{ item: secondItem, price: quote(15) }],
        });
        expect(graph.nodes[2]).toMatchObject({
            kind: "craft",
            inputs: [{ source: "base" }, { source: "donor" }],
            method: { kind: "recombine", donor: undefined },
        });
        expect(graph.prices["donor:second"]).toBeUndefined();
        const result = calculateCraftingGraph(
            engine.catalog,
            { ...graph, iterations: 3 },
            { estimateIterations: 1, workLimit: 1000 },
        );
        expect(result).toMatchObject({
            complete: true,
            meanCost: 27,
            meanActions: 1,
            probability: 1,
        });
        expect(input.prices["donor:second"]).toEqual(quote(15));
        if (input.method.kind !== "recombine") throw new Error("Fixture");
        input.method.donor!.item.mods.length = 0;
        expect(graph.nodes[1]).toMatchObject({ alternatives: [{ item: secondItem }] });
    });

    it("keeps missing prices unknown and refuses missing donors, mismatched prices and altered pins", () => {
        const ruleset = historyIndex.revisions.find(
            (entry) => entry.game === "poe1" && entry.revision === "r6",
        )!;
        const input = projectFromMethodInputSchema.parse({
            game: "poe1",
            ruleset: rulesetReference(ruleset),
            name: "Unpriced donors",
            item: firstItem,
            method: {
                kind: "recombine",
                id: "recombine",
                donor: { id: "second", name: "Other", item: secondItem },
            },
        });
        const graph = projectFromMethod(engine, ruleset, input);
        expect(graph.nodes[0]).toMatchObject({
            choice: { mode: "pinned" },
            alternatives: [{ price: null }],
        });
        expect(graph.nodes[1]).toMatchObject({ alternatives: [{ price: null }] });
        const result = calculateCraftingGraph(
            engine.catalog,
            { ...graph, iterations: 2 },
            { estimateIterations: 1, workLimit: 1000 },
        );
        expect(result.meanCost).toBeNull();
        expect(() =>
            projectFromMethod(engine, ruleset, {
                ...input,
                method: { kind: "recombine", id: "recombine" },
            }),
        ).toThrow("second item");
        expect(() =>
            projectFromMethod(engine, ruleset, {
                ...input,
                prices: { "donor:second": { ...quote(2), currency: "divine" } },
            }),
        ).toThrow("comparison currency");
        expect(() =>
            projectFromMethod(engine, ruleset, {
                ...input,
                ruleset: { ...input.ruleset, engine: "invented" },
            }),
        ).toThrow("pin");
    });
});
