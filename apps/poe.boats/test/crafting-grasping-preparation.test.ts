import { matchItem } from "@poe-tools/item-query";
import { cohortPriceCoverage } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import type { CraftingRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { craftingMarketItemIssue } from "../app/lib/crafting-market";
import { projectFromPreset } from "../app/lib/crafting-presets";
import type { CraftingGraph } from "../app/schemas/crafting-graph";
import { craftingPresetCohorts } from "../scripts/crafting-preset-cohorts";
import { catalog, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r13",
)!;
const previousRuleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r9",
)!;
const sourceId = "defences-make-source";
const isolateId = "defences-make-isolate";
const wanted = "BreachBodyAllDefences1";
const annul = "Metadata/Items/Currency/CurrencyRemoveMod";
const transmute = "Metadata/Items/Currency/CurrencyUpgradeToMagic";
const alteration = "Metadata/Items/Currency/CurrencyRerollMagic";
const sources = [
    {
        id: "buy",
        level: 84,
        counts: { prefixes: 2, suffixes: 2 },
        mods: [
            wanted,
            "FireResist7",
            "FasterStartEnergyShieldRecharge4",
            "LocalIncreasedArmourEvasionEnergyShieldStunRecovery3",
        ],
    },
    {
        id: "buy-two-prefixes",
        level: 85,
        counts: { prefixes: 2, suffixes: 0 },
        mods: ["BreachBodyArmourIncreasedByUncappedFireResistance1____", wanted],
    },
    {
        id: "buy-life",
        level: 85,
        counts: { prefixes: 3, suffixes: 1 },
        mods: [wanted, "AttackerTakesDamage3", "ColdResist3", "IncreasedLife11"],
    },
];

function purchase(graph: CraftingGraph, id: string, alternativeId = "buy") {
    const node = graph.nodes.find((node) => node.id === id);
    if (node?.kind !== "acquire") throw new Error("Expected acquisition");
    const alternative = node.alternatives.find((entry) => entry.id === alternativeId);
    if (alternative?.kind !== "purchase") throw new Error("Expected purchase");
    return { node, alternative };
}

function preparation(
    source: (typeof sources)[number],
    missing?: "base" | "annul",
    revision = ruleset,
) {
    const graph = projectFromPreset(engine, revision, "global-defence-chest");
    purchase(graph, "defences").node.choice = { mode: "pinned", alternativeId: "make-isolate" };
    const selected = purchase(graph, sourceId, source.id);
    selected.node.choice = { mode: "pinned", alternativeId: source.id };
    if (missing !== "base") selected.alternative.price = quote(11);
    if (missing !== "annul") graph.prices[annul] = quote(3);
    return graph;
}

function scriptedRandom(draws: string[]): CraftingRandom {
    return {
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
}

it.each(
    sources,
)("$id preserves the observed exact source constraints in its generated cohort", (source) => {
    const graph = projectFromPreset(engine, ruleset, "global-defence-chest");
    const { node, alternative } = purchase(graph, sourceId, source.id);
    const item = alternative.item;
    const queries = createCraftingItemQuery(engine);
    const record = queries.record(item);
    const eligible = craftingPresetCohorts(engine, ruleset).filter(
        (cohort) => cohortPriceCoverage(cohort, record, node.output).covered,
    );
    expect(eligible).toHaveLength(1);
    const cohort = eligible[0]!;
    expect(item).toMatchObject({
        baseId: "Metadata/Items/Armours/BodyArmours/BodyStrDexInt2",
        level: source.level,
        rarity: "rare",
        influences: [],
        corrupted: false,
        mirrored: false,
    });
    expect(item.mods.map((mod) => mod.id)).toEqual(source.mods);
    expect(item.mods.every((mod) => !mod.crafted && !mod.fractured)).toBe(true);
    expect(engine.counts(item)).toEqual(source.counts);
    expect(engine.validateItem(item)).toEqual(item);
    expect(craftingMarketItemIssue(engine, item)).toBeNull();
    expect(alternative.price).toBeNull();
    expect(matchItem(record, cohort.query)).toBe("match");
    const filters = cohort.query.groups.flatMap((group) => group.filters);
    for (const id of source.mods)
        expect(filters).toContainEqual({
            kind: "mod",
            ids: [id],
            side: engine.mod(id).generation_type,
            fractured: false,
            crafted: false,
            count: { min: 1 },
        });
    for (const invalid of [
        { ...record, item: { ...record.item, ilvl: source.level + 1 } },
        { ...record, item: { ...record.item, rarity: "Magic" as const } },
        { ...record, item: { ...record.item, corrupted: true } },
        { ...record, item: { ...record.item, influences: { shaper: true } } },
        { ...record, facts: { ...record.facts, prefixes: source.counts.prefixes + 1 } },
        queries.record({ ...item, mods: item.mods.filter((mod) => mod.id !== wanted) }),
    ])
        expect(matchItem(invalid, cohort.query)).toBe("no-match");
});

it.each(
    sources,
)("$id pays for a discarded source and every Annulment before isolation", (source) => {
    const graph = preparation(source);
    const draws = [wanted, ...source.mods.filter((id) => id !== wanted)];
    const trial = new CraftingGraphTrial(engine, graph, scriptedRandom(draws), {
        entry: "defences",
        classify: false,
    });
    while (!trial.done) trial.advance();
    const result = trial.result();
    expect(draws).toEqual([]);
    expect(result).toMatchObject({
        status: "returned",
        error: null,
        missingPrices: [],
        cost: 22 + 3 * source.mods.length,
        purchases: 2,
        actions: source.mods.length,
        spending: { [`purchase:${sourceId}:${source.id}`]: 2, [annul]: source.mods.length },
    });
    const original = purchase(graph, sourceId, source.id).alternative.item;
    expect(result.item).toEqual({
        ...original,
        mods: original.mods.filter((mod) => mod.id === wanted),
    });
    expect(engine.counts(result.item!)).toEqual({ prefixes: 1, suffixes: 0 });
});

it.each(
    sources.flatMap((source) =>
        (["base", "annul"] as const).map((missing) => ({ source, missing })),
    ),
)("$source.id remains unpriced without $missing", ({ source, missing }) => {
    const graph = preparation(source, missing);
    const draws = [wanted, ...source.mods.filter((id) => id !== wanted)];
    const trial = new CraftingGraphTrial(engine, graph, scriptedRandom(draws), {
        entry: "defences",
        classify: false,
    });
    while (!trial.done) trial.advance();
    expect(draws).toEqual([]);
    expect(trial.result()).toMatchObject({
        status: "returned",
        error: null,
        cost: null,
        missingPrices: [missing === "base" ? `purchase:${sourceId}:${source.id}` : annul],
        purchases: 2,
        actions: source.mods.length,
    });
});

it.each(
    sources.flatMap((source) =>
        [previousRuleset, ruleset].map((revision) => ({ source, revision })),
    ),
)("retained $revision.revision isolates $source.id and transfers it to the original level 86 target", async ({
    source,
    revision,
}) => {
    const retained = await retainedRevision(revision);
    const graph = preparation(source, undefined, revision);
    graph.seed = 42;
    graph.iterations = 16;
    graph.maxSteps = 100000;
    const isolated = structuredClone(graph);
    isolated.entry = "defences";
    isolated.outcomes = [
        {
            ...isolated.outcomes[0]!,
            query: graph.nodes.find((node) => node.id === isolateId)!.output,
        },
    ];
    const simulate = (input: CraftingGraph) => {
        const simulation = retained.runtime.createSimulation(retained.catalog, input, {
            estimateIterations: 1,
            workLimit: 100000,
        });
        while (!simulation.done) simulation.runBatch(1000);
        return simulation.result();
    };
    const result = simulate(isolated);
    expect(result).toMatchObject({ complete: true, trials: 16, errors: {}, missingPrices: [] });
    expect(result.samples.some((sample) => sample.purchases > 1)).toBe(true);
    for (const sample of result.samples) {
        expect(sample.success).toBe(true);
        expect(sample.item!.level).toBe(source.level);
        expect(sample.item!.mods.map((mod) => mod.id)).toEqual([wanted]);
        expect(sample.purchases).toBe(sample.spending[`purchase:${sourceId}:${source.id}`]);
        expect(sample.actions).toBe(sample.spending[annul]);
        expect(sample.cost).toBe(11 * sample.purchases + 3 * sample.actions);
    }
    graph.iterations = 4;
    purchase(graph, "es-base").alternative.price = quote(7);
    graph.prices[transmute] = quote(2);
    graph.prices[alteration] = quote(1);
    graph.prices["service:recombine"] = quote(5);
    const complete = simulate(graph);
    expect(complete).toMatchObject({ complete: true, trials: 4, errors: {}, missingPrices: [] });
    const queries = createCraftingItemQuery(engine);
    for (const sample of complete.samples) {
        expect(sample.success).toBe(true);
        expect(sample.item!.level).toBe(86);
        expect(queries.matches(sample.item!, graph.outcomes[0]!.query)).toBe("match");
        const bases = sample.spending[`purchase:${sourceId}:${source.id}`]!;
        const es = sample.spending["purchase:es-base:buy"]!;
        const annuls = sample.spending[annul]!;
        const recombinations = sample.spending["service:recombine"]!;
        const transmutes = sample.spending[transmute]!;
        const alterations = sample.spending[alteration] ?? 0;
        expect(sample.purchases).toBe(bases + es);
        expect(sample.actions).toBe(annuls + recombinations + transmutes + alterations);
        expect(sample.cost).toBe(
            11 * bases + 7 * es + 3 * annuls + 5 * recombinations + 2 * transmutes + alterations,
        );
    }
});

it("preserves the original donor, r8 graph, pinned choices and unselected result", () => {
    const graph = projectFromPreset(engine, ruleset, "global-defence-chest");
    const donor = purchase(graph, "defences");
    const source = purchase(graph, sourceId);
    expect(donor.node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(source.node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(source.node.alternatives.map((entry) => entry.id)).toEqual(
        sources.map((entry) => entry.id),
    );
    expect(donor.node.alternatives[1]).toMatchObject({
        kind: "production",
        id: "make-isolate",
        nodeId: isolateId,
    });
    expect(graph.prices[annul]).toBeUndefined();
    const r8 = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === "r8",
    )!;
    const legacy = projectFromPreset(engine, r8, "global-defence-chest");
    expect(donor.alternative).toEqual(purchase(legacy, "defences").alternative);
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
    previous.nodes = previous.nodes.filter((node) => node.id !== sourceId && node.id !== isolateId);
    purchase(previous, "defences").node.alternatives = [purchase(previous, "defences").alternative];
    const options = { estimateIterations: 1, workLimit: 1000 };
    const { acquisitions: currentAcquisitions, ...currentResult } = calculateCraftingGraph(
        catalog,
        graph,
        options,
    );
    const { acquisitions: previousAcquisitions, ...previousResult } = calculateCraftingGraph(
        catalog,
        previous,
        options,
    );
    expect(currentResult).toEqual(previousResult);
    expect(currentAcquisitions.defences!.selectedId).toBe("buy");
    expect(currentAcquisitions.defences!.selectedId).toBe(
        previousAcquisitions.defences!.selectedId,
    );
    expect(
        currentAcquisitions.defences!.alternatives.find((entry) => entry.id === "make-isolate"),
    ).toMatchObject({ estimated: false, expectedCost: null });
});
