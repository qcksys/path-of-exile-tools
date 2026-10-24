import { expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { projectFromPreset } from "../app/lib/crafting-presets";
import type { CraftingGraph } from "../app/schemas/crafting-graph";
import { catalog, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r11",
)!;
const scour = "Metadata/Items/Currency/CurrencyConvertToNormal";
const sources = [
    {
        preset: "life-block-shield",
        id: "heat",
        targets: ["block-make-base", "max-res-make-base"],
        mod: "Strength7",
    },
    {
        preset: "life-block-shield",
        id: "pinnacle",
        targets: ["recovery-make-base"],
        mod: "DisplaySocketedGemsGetReducedReservationUber2",
    },
    {
        preset: "es-block-shield",
        id: "titanium",
        targets: ["flat-make-base"],
        mod: "LocalIncreasedBlockPercentage7",
    },
] as const;
const targets = sources.flatMap((source) =>
    source.targets.map((target) => ({ ...source, target })),
);

function purchase(graph: CraftingGraph, id: string) {
    const node = graph.nodes.find((node) => node.id === id)!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Expected purchase");
    return { node, alternative: node.alternatives[0] };
}

it.each(
    sources,
)("$id offers one concrete Magic source and paid Scouring for its Normal targets", (source) => {
    const graph = projectFromPreset(engine, ruleset, source.preset);
    const { alternative } = purchase(graph, `shield-make-${source.id}-base`);
    expect(alternative.price).toBeNull();
    expect(alternative.item.rarity).toBe("magic");
    expect(alternative.item.mods).toEqual([
        { id: source.mod, values: expect.any(Array), crafted: false, fractured: false },
    ]);
    expect(engine.validateItem(alternative.item)).toEqual(alternative.item);
    expect(graph.prices[scour]).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === `shield-make-${source.id}-scour`)).toMatchObject({
        kind: "craft",
        method: { kind: "currency", id: scour },
        inputs: [{ source: `shield-make-${source.id}-base` }],
    });
    for (const id of source.targets) {
        const target = purchase(graph, id);
        expect(target.node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
        expect(target.alternative.item).toEqual({
            ...alternative.item,
            rarity: "normal",
            mods: [],
        });
        expect(target.node.alternatives[1]).toEqual({
            kind: "production",
            id: "make-scour",
            name:
                source.id === "titanium"
                    ? "Scour a Shaper Titanium base"
                    : "Scour a Magic Shaper base",
            nodeId: `shield-make-${source.id}-scour`,
        });
    }
});

function pricedPreparation(source: (typeof targets)[number], missing?: "base" | "scour") {
    const graph = projectFromPreset(engine, ruleset, source.preset);
    const target = purchase(graph, source.target);
    target.node.choice = { mode: "pinned", alternativeId: "make-scour" };
    if (missing !== "base")
        purchase(graph, `shield-make-${source.id}-base`).alternative.price = quote(11);
    if (missing !== "scour") graph.prices[scour] = quote(7);
    return { graph, target: target.alternative.item };
}

it.each(
    targets,
)("$preset/$target pays for the concrete source and preserves the complete Normal item", (source) => {
    const { graph, target } = pricedPreparation(source);
    for (let seed = 0; seed < 16; seed++) {
        const trial = new CraftingGraphTrial(engine, graph, seededRandom(seed), {
            entry: source.target,
            classify: false,
        });
        while (!trial.done) trial.advance();
        expect(trial.result()).toMatchObject({
            status: "returned",
            error: null,
            purchases: 1,
            actions: 1,
            cost: 18,
            missingPrices: [],
            item: target,
            spending: { [`purchase:shield-make-${source.id}-base:buy`]: 1, [scour]: 1 },
        });
        expect(trial.result().item).toEqual(target);
    }
});

it.each(
    targets.flatMap((source) =>
        (["base", "scour"] as const).map((missing) => ({ ...source, missing })),
    ),
)("$target Scouring remains unpriced without $missing", (source) => {
    const { graph, target } = pricedPreparation(source, source.missing);
    const trial = new CraftingGraphTrial(engine, graph, seededRandom(42), {
        entry: source.target,
        classify: false,
    });
    while (!trial.done) trial.advance();
    expect(trial.result()).toMatchObject({
        status: "returned",
        error: null,
        cost: null,
        item: target,
        missingPrices: [
            source.missing === "base" ? `purchase:shield-make-${source.id}-base:buy` : scour,
        ],
    });
});

it("retained r9 buys two independent Heat sources when both Normal preparations are consumed", async () => {
    const graph = pricedPreparation(targets[0]!).graph;
    const target = purchase(graph, "max-res-make-base");
    target.node.choice = { mode: "pinned", alternativeId: "make-scour" };
    graph.nodes.push({
        kind: "craft",
        id: "consume-bases",
        name: "Consume two scoured bases",
        output: target.node.output,
        inputs: [
            { id: "first", name: "First", source: "block-make-base" },
            { id: "second", name: "Second", source: "max-res-make-base" },
        ],
        method: { kind: "recombine", id: "recombine" },
        branches: [],
        ordering: "manual",
        fallback: { kind: "return" },
    });
    graph.entry = "consume-bases";
    graph.iterations = 1;
    graph.outcomes = [{ ...graph.outcomes[0]!, query: target.node.output }];
    graph.prices["service:recombine"] = quote(3);
    const retained = await retainedRevision(ruleset);
    const simulation = retained.runtime.createSimulation(retained.catalog, graph, {
        estimateIterations: 1,
        workLimit: 1000,
    });
    while (!simulation.done) simulation.runBatch(100);
    const result = simulation.result();
    expect(result).toMatchObject({
        complete: true,
        trials: 1,
        errors: {},
        missingPrices: [],
        meanCost: 39,
    });
    expect(result.samples[0]).toMatchObject({
        purchases: 2,
        actions: 3,
        cost: 39,
        spending: { "purchase:shield-make-heat-base:buy": 2, [scour]: 2, "service:recombine": 1 },
    });
});

it.each([
    "life-block-shield",
    "es-block-shield",
] as const)("%s preserves original purchases, r8 and unselected previews", (preset) => {
    const graph = projectFromPreset(engine, ruleset, preset);
    const legacyRuleset = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === "r8",
    )!;
    const legacy = projectFromPreset(engine, legacyRuleset, preset);
    const unprepared = graph.nodes
        .filter((node) => !node.id.includes("-make"))
        .map((node) =>
            node.kind === "acquire"
                ? {
                      ...node,
                      alternatives: node.alternatives.filter(
                          (alternative) => alternative.kind === "purchase",
                      ),
                  }
                : node,
        );
    expect(unprepared).toEqual(legacy.nodes);
    for (const key of ["entry", "outcomes", "iterations", "maxSteps", "prices"] as const)
        expect(graph[key]).toEqual(legacy[key]);
    const previous = structuredClone(graph);
    previous.nodes = previous.nodes.filter((node) => !node.id.startsWith("shield-make-"));
    for (const node of previous.nodes)
        if (node.kind === "acquire")
            node.alternatives = node.alternatives.filter(
                (alternative) => alternative.id !== "make-scour",
            );
    const options = { estimateIterations: 1, workLimit: 1000 };
    const currentResult = calculateCraftingGraph(catalog, graph, options);
    const previousResult = calculateCraftingGraph(catalog, previous, options);
    expect(currentResult.errors).toEqual({});
    expect(currentResult.work).toBe(previousResult.work);
    expect(currentResult.samples).toEqual(previousResult.samples);
    expect(currentResult.missingPrices).toEqual(previousResult.missingPrices);
});
