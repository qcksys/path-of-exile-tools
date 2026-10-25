import { expect, it } from "vite-plus/test";
import type { CraftingRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { projectFromPreset } from "../app/lib/crafting-presets";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import type { CraftingItem } from "../app/schemas/crafting";
import type { CraftingGraph } from "../app/schemas/crafting-graph";
import { catalog, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r15",
)!;
const transmute = "Metadata/Items/Currency/CurrencyUpgradeToMagic";
const alteration = "Metadata/Items/Currency/CurrencyRerollMagic";
const scour = "Metadata/Items/Currency/CurrencyConvertToNormal";
const flat = "LocalIncreasedEnergyShield10";
const recovery = "RecoverEnergyShieldPercentOnBlockUber1";

function purchase(graph: CraftingGraph, id: string, alternativeId = "buy") {
    const node = graph.nodes.find((node) => node.id === id)!;
    if (node.kind !== "acquire") throw new Error("Expected acquisition");
    const alternative = node.alternatives.find((entry) => entry.id === alternativeId)!;
    if (alternative.kind !== "purchase") throw new Error("Expected purchase");
    return { node, alternative };
}

function preparation(missing?: string, nested = false) {
    const graph = projectFromPreset(engine, ruleset, "es-block-shield");
    purchase(graph, "flat-block").node.choice = { mode: "pinned", alternativeId: "make-magic" };
    const baseId = nested ? "shield-make-titanium-base" : "flat-make-base";
    if (nested)
        purchase(graph, "flat-make-base").node.choice = {
            mode: "pinned",
            alternativeId: "make-scour",
        };
    if (missing !== "base") purchase(graph, baseId).alternative.price = quote(11);
    if (missing !== transmute) graph.prices[transmute] = quote(2);
    if (missing !== alteration) graph.prices[alteration] = quote(3);
    if (nested && missing !== scour) graph.prices[scour] = quote(5);
    return graph;
}

function scriptedTrial(graph: CraftingGraph, pairOnTransmute = false) {
    const draws: (number | string)[] = pairOnTransmute
        ? [2, flat, recovery]
        : [1, "IncreasedLife1", 1, flat, 2, flat, recovery];
    const random: CraftingRandom = {
        integer: (min) => min,
        pick: (choices) => {
            const expected = draws.shift();
            const selected = choices.find(
                ({ value, weight }) =>
                    weight > 0 &&
                    (typeof value === "object" && value !== null && "id" in value
                        ? value.id === expected
                        : value === expected),
            );
            if (!selected) throw new Error(`Requested draw is not eligible: ${expected}`);
            return selected.value;
        },
    };
    const trial = new CraftingGraphTrial(engine, graph, random, {
        entry: "flat-block",
        classify: false,
    });
    while (!trial.done) trial.advance();
    expect(draws).toEqual([]);
    expect(trial.result().error).toBeNull();
    return trial.result();
}

function checkItem(graph: CraftingGraph, item: CraftingItem) {
    const target = purchase(graph, "flat-block", "buy-magic");
    const identity = (value: CraftingItem) => ({
        ...value,
        mods: value.mods
            .map(({ values: _values, ...mod }) => mod)
            .sort((a, b) => a.id.localeCompare(b.id)),
    });
    expect(identity(item)).toEqual(identity(target.alternative.item));
    expect(engine.validateItem(item)).toEqual(item);
    expect(engine.counts(item)).toEqual({ prefixes: 1, suffixes: 1 });
    expect(createCraftingItemQuery(engine).matches(item, target.node.output)).toBe("match");
    expect(recombinationOutcomes(engine, item, purchase(graph, "block").alternative.item)).toEqual(
        recombinationOutcomes(
            engine,
            { ...item, rarity: "rare" },
            purchase(graph, "block").alternative.item,
        ),
    );
}

it("offers explicit Magic pair preparation while retaining the original Rare purchase", () => {
    const graph = projectFromPreset(engine, ruleset, "es-block-shield");
    const rare = purchase(graph, "flat-block");
    const magic = purchase(graph, "flat-block", "buy-magic");
    expect(rare.node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(rare.alternative.item.rarity).toBe("rare");
    expect(magic.alternative.item).toEqual({ ...rare.alternative.item, rarity: "magic" });
    expect(rare.node.alternatives[2]).toEqual({
        kind: "production",
        id: "make-magic",
        name: "Roll the Magic flat ES and recovery pair with Alterations",
        nodeId: "flat-block-make-alteration",
    });
    expect(purchase(graph, "flat-make-base").alternative.item).toEqual({
        ...magic.alternative.item,
        rarity: "normal",
        mods: [],
    });
    expect(graph.nodes.find((node) => node.id === "flat-block-make-transmute")).toMatchObject({
        method: { kind: "currency", id: transmute },
        inputs: [{ source: "flat-make-base" }],
    });
    expect(graph.nodes.find((node) => node.id === "flat-block-make-alteration")).toMatchObject({
        method: { kind: "currency", id: alteration },
        fallback: { kind: "recover", nodeId: "flat-block-make-alteration", inputId: "input-0" },
    });
    expect(graph.nodes.filter((node) => node.id.startsWith("flat-block-make-"))).toHaveLength(2);
    expect(graph.prices[transmute]).toBeUndefined();
    expect(graph.prices[alteration]).toBeUndefined();
});

it("charges each Alteration miss without reacquiring the base", () => {
    const graph = preparation();
    const result = scriptedTrial(graph);
    expect(result).toMatchObject({
        status: "returned",
        cost: 19,
        missingPrices: [],
        purchases: 1,
        actions: 3,
        spending: { "purchase:flat-make-base:buy": 1, [transmute]: 1, [alteration]: 2 },
    });
    checkItem(graph, result.item!);
});

it("skips Alteration when Transmutation already supplies the exact pair", () => {
    const graph = preparation();
    const result = scriptedTrial(graph, true);
    expect(result).toMatchObject({
        cost: 13,
        purchases: 1,
        actions: 1,
        spending: { "purchase:flat-make-base:buy": 1, [transmute]: 1 },
    });
    checkItem(graph, result.item!);
});

it.each(["base", transmute, alteration])("keeps the total unknown without %s", (missing) => {
    const graph = preparation(missing);
    const result = scriptedTrial(graph);
    expect(result.cost).toBeNull();
    expect(result.missingPrices).toEqual([
        missing === "base" ? "purchase:flat-make-base:buy" : missing,
    ]);
    checkItem(graph, result.item!);
});

it.each([
    undefined,
    "base",
    scour,
])("composes paid Scouring with the pair preparation: %s", (missing) => {
    const graph = preparation(missing, true);
    const result = scriptedTrial(graph);
    expect(result).toMatchObject({
        cost: missing === undefined ? 24 : null,
        purchases: 1,
        actions: 4,
        spending: {
            "purchase:shield-make-titanium-base:buy": 1,
            [scour]: 1,
            [transmute]: 1,
            [alteration]: 2,
        },
    });
    expect(result.missingPrices).toEqual(
        missing === undefined
            ? []
            : [missing === "base" ? "purchase:shield-make-titanium-base:buy" : missing],
    );
    checkItem(graph, result.item!);
});

it("retained r9 reports bounded unfinished preparation without inventing a completed cost", async () => {
    const graph = preparation();
    graph.entry = "flat-block";
    graph.iterations = 1;
    graph.seed = 42;
    graph.maxSteps = 100000;
    graph.outcomes = [{ ...graph.outcomes[0]!, query: purchase(graph, "flat-block").node.output }];
    const retained = await retainedRevision(ruleset);
    const simulation = retained.runtime.createSimulation(retained.catalog, graph, {
        estimateIterations: 1,
        workLimit: 500,
    });
    while (!simulation.done) simulation.runBatch(1000);
    const result = simulation.result();
    expect(result).toMatchObject({
        complete: false,
        stopReason: "work-limit",
        work: 500,
        trials: 0,
        meanCost: null,
        errors: {},
        missingPrices: [],
        samples: [],
    });
});

it("preserves r8, the full recipe and the unselected preview", () => {
    const graph = projectFromPreset(engine, ruleset, "es-block-shield");
    const r8 = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === "r8",
    )!;
    const legacy = projectFromPreset(engine, r8, "es-block-shield");
    expect(
        graph.nodes
            .filter((node) => !node.id.includes("-make"))
            .map((node) =>
                node.kind === "acquire"
                    ? {
                          ...node,
                          alternatives: node.alternatives.filter(
                              (entry) => entry.kind === "purchase",
                          ),
                      }
                    : node,
            ),
    ).toEqual(legacy.nodes);
    for (const key of ["entry", "outcomes", "iterations", "maxSteps", "prices"] as const)
        expect(graph[key]).toEqual(legacy[key]);
    const previous = structuredClone(graph);
    previous.nodes = previous.nodes.filter((node) => !node.id.startsWith("flat-block-make-"));
    const donor = purchase(previous, "flat-block").node;
    donor.alternatives = donor.alternatives.filter((entry) => entry.id !== "make-magic");
    const options = { estimateIterations: 1, workLimit: 1000 };
    const currentResult = calculateCraftingGraph(catalog, graph, options);
    const previousResult = calculateCraftingGraph(catalog, previous, options);
    expect(currentResult.errors).toEqual({});
    expect(currentResult.work).toBe(previousResult.work);
    expect(currentResult.samples).toEqual(previousResult.samples);
    expect(currentResult.missingPrices).toEqual(previousResult.missingPrices);
});
