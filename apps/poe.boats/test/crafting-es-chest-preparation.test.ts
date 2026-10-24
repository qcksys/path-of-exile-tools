import { expect, it } from "vite-plus/test";
import { type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { projectFromPreset } from "../app/lib/crafting-presets";
import type { CraftingItem } from "../app/schemas/crafting";
import type { CraftingGraph } from "../app/schemas/crafting-graph";
import { catalog, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r14",
)!;
const essence = "Metadata/Items/Currency/CurrencyEssenceDoubt3";
const annul = "Metadata/Items/Currency/CurrencyRemoveMod";
const nnn = "LocalIncreasedEvasionRating8";
const baseId = "donor-0-make-base";
const donors = [
    { id: "donor-1", wanted: "LocalIncreasedEnergyShieldPercent8" },
    { id: "donor-2", wanted: "LocalIncreasedEnergyShieldPercentAndStunRecovery6" },
];

function purchase(graph: CraftingGraph, id: string) {
    const node = graph.nodes.find((node) => node.id === id)!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Expected purchase");
    return { node, alternative: node.alternatives[0] };
}

function preparation(id: string, missing?: string) {
    const graph = projectFromPreset(engine, ruleset, "energy-shield-chest");
    purchase(graph, id).node.choice = { mode: "pinned", alternativeId: "make-nnn" };
    if (missing !== "base") purchase(graph, baseId).alternative.price = quote(11);
    if (missing !== essence) graph.prices[essence] = quote(2);
    if (missing !== annul) graph.prices[annul] = quote(3);
    return graph;
}

function sequence(wanted: string) {
    return [
        4,
        "IncreasedLife1",
        "ColdResist1",
        "FireResist1",
        4,
        wanted,
        "ColdResist1",
        "FireResist1",
        nnn,
        4,
        wanted,
        "ColdResist1",
        "FireResist1",
        wanted,
        4,
        wanted,
        "ColdResist1",
        "FireResist1",
        "ColdResist1",
        "FireResist1",
    ];
}

function scriptedRandom(draws: (string | number)[]): CraftingRandom {
    const fallback = seededRandom(42);
    return {
        integer: (min) => min,
        pick: (choices) => {
            if (!draws.length) return fallback.pick(choices);
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
}

function checkItem(actual: CraftingItem, expected: CraftingItem) {
    const identities = (item: CraftingItem) => ({
        ...item,
        mods: item.mods
            .map(({ values: _values, ...mod }) => mod)
            .sort((a, b) => a.id.localeCompare(b.id)),
    });
    expect(identities(actual)).toEqual(identities(expected));
    expect(engine.validateItem(actual)).toEqual(actual);
    expect(actual.mods.find((mod) => mod.id === nnn)?.essence).toBe(true);
}

it.each(donors)("$id adds two paid steps using the existing Normal source", ({ id }) => {
    const graph = projectFromPreset(engine, ruleset, "energy-shield-chest");
    const donor = purchase(graph, id);
    expect(donor.node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(donor.node.alternatives[1]).toEqual({
        kind: "production",
        id: "make-nnn",
        name: "Roll the ES prefix with Screaming Doubt, then isolate",
        nodeId: `${id}-make-isolate`,
    });
    expect(graph.nodes.find((node) => node.id === `${id}-make-essence`)).toMatchObject({
        method: { kind: "essence", id: essence },
        inputs: [{ source: baseId }],
    });
    expect(graph.nodes.find((node) => node.id === `${id}-make-isolate`)).toMatchObject({
        method: { kind: "currency", id: annul },
        inputs: [{ source: `${id}-make-essence` }],
        fallback: { kind: "recover", nodeId: `${id}-make-essence`, inputId: "input-0" },
    });
    expect(graph.nodes.filter((node) => node.id.startsWith(`${id}-make-`))).toHaveLength(2);
    expect(purchase(graph, baseId).alternative.price).toBeNull();
    expect(graph.prices[essence]).toBeUndefined();
    expect(graph.prices[annul]).toBeUndefined();
});

it.each(donors)("$id charges Essence misses and loss of either required prefix", ({
    id,
    wanted,
}) => {
    const graph = preparation(id);
    const draws = sequence(wanted);
    const trial = new CraftingGraphTrial(engine, graph, scriptedRandom(draws), {
        entry: id,
        classify: false,
    });
    while (!trial.done) trial.advance();
    const result = trial.result();
    expect(draws).toEqual([]);
    expect(result).toMatchObject({
        status: "returned",
        error: null,
        cost: 31,
        missingPrices: [],
        purchases: 1,
        actions: 8,
        spending: { [`purchase:${baseId}:buy`]: 1, [essence]: 4, [annul]: 4 },
    });
    checkItem(result.item!, purchase(graph, id).alternative.item);
    const ready = graph.nodes.find((node) => node.id === `${id}-make-isolate`)!.output;
    expect(createCraftingItemQuery(engine).matches(result.item!, ready)).toBe("match");
});

it.each(
    donors.flatMap((donor) => ["base", essence, annul].map((missing) => ({ ...donor, missing }))),
)("$id remains unpriced without $missing", ({ id, wanted, missing }) => {
    const graph = preparation(id, missing);
    const draws = sequence(wanted);
    const trial = new CraftingGraphTrial(engine, graph, scriptedRandom(draws), {
        entry: id,
        classify: false,
    });
    while (!trial.done) trial.advance();
    const result = trial.result();
    expect(draws).toEqual([]);
    expect(result).toMatchObject({
        status: "returned",
        error: null,
        cost: null,
        missingPrices: [missing === "base" ? `purchase:${baseId}:buy` : missing],
        purchases: 1,
        actions: 8,
    });
    checkItem(result.item!, purchase(graph, id).alternative.item);
});

it.each(donors)("retained r9 produces the exact $id donor with reconciled costs", async ({
    id,
}) => {
    const graph = preparation(id);
    graph.entry = id;
    graph.seed = 42;
    graph.iterations = 1;
    graph.maxSteps = 10000;
    graph.outcomes = [{ ...graph.outcomes[0]!, query: purchase(graph, id).node.output }];
    const retained = await retainedRevision(ruleset);
    const simulation = retained.runtime.createSimulation(retained.catalog, graph, {
        estimateIterations: 1,
        workLimit: 10000,
    });
    while (!simulation.done) simulation.runBatch(100);
    const result = simulation.result();
    expect(result).toMatchObject({ complete: true, trials: 1, errors: {}, missingPrices: [] });
    const sample = result.samples[0]!;
    expect(sample.success).toBe(true);
    expect(sample.purchases).toBe(1);
    expect(sample.actions).toBe(sample.spending[essence]! + sample.spending[annul]!);
    expect(sample.cost).toBe(11 + 2 * sample.spending[essence]! + 3 * sample.spending[annul]!);
    checkItem(sample.item!, purchase(graph, id).alternative.item);
});

it("buys two independent bases when both NNN preparations are consumed", () => {
    const graph = preparation("donor-1");
    purchase(graph, "donor-2").node.choice = { mode: "pinned", alternativeId: "make-nnn" };
    graph.nodes.push({
        kind: "craft",
        id: "consume-donors",
        name: "Consume two prepared donors",
        output: purchase(graph, baseId).node.output,
        inputs: [
            { id: "first", name: "First", source: "donor-1" },
            { id: "second", name: "Second", source: "donor-2" },
        ],
        method: { kind: "recombine", id: "recombine" },
        branches: [],
        ordering: "manual",
        fallback: { kind: "return" },
    });
    graph.prices["service:recombine"] = quote(5);
    const draws = donors.flatMap(({ wanted }) => sequence(wanted));
    const trial = new CraftingGraphTrial(engine, graph, scriptedRandom(draws), {
        entry: "consume-donors",
        classify: false,
    });
    while (!trial.done) trial.advance();
    expect(draws).toEqual([]);
    expect(trial.result()).toMatchObject({
        status: "returned",
        error: null,
        cost: 67,
        missingPrices: [],
        purchases: 2,
        actions: 17,
        spending: {
            [`purchase:${baseId}:buy`]: 2,
            [essence]: 8,
            [annul]: 8,
            "service:recombine": 1,
        },
    });
});

it("preserves original purchases, r8 graphs, default settings and unselected previews", () => {
    const graph = projectFromPreset(engine, ruleset, "energy-shield-chest");
    const r8 = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === "r8",
    )!;
    const legacy = projectFromPreset(engine, r8, "energy-shield-chest");
    const unprepared = graph.nodes
        .filter((node) => !node.id.includes("-make"))
        .map((node) =>
            node.kind === "acquire"
                ? {
                      ...node,
                      alternatives: node.alternatives.filter((entry) => entry.kind === "purchase"),
                  }
                : node,
        );
    expect(unprepared).toEqual(legacy.nodes);
    for (const key of ["entry", "outcomes", "iterations", "maxSteps", "prices"] as const)
        expect(graph[key]).toEqual(legacy[key]);
    const previous = structuredClone(graph);
    previous.nodes = previous.nodes.filter(
        (node) => !donors.some(({ id }) => node.id.startsWith(`${id}-make-`)),
    );
    for (const { id } of donors)
        purchase(previous, id).node.alternatives = purchase(previous, id).node.alternatives.filter(
            (entry) => entry.id !== "make-nnn",
        );
    const options = { estimateIterations: 1, workLimit: 1000 };
    const currentResult = calculateCraftingGraph(catalog, graph, options);
    const previousResult = calculateCraftingGraph(catalog, previous, options);
    expect(currentResult.errors).toEqual({});
    expect(currentResult.work).toBe(previousResult.work);
    expect(currentResult.samples).toEqual(previousResult.samples);
    expect(currentResult.missingPrices).toEqual(previousResult.missingPrices);
});
