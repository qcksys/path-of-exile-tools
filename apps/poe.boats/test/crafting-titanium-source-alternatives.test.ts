import { readFileSync } from "node:fs";
import { normalizeApiItem } from "@poe-tools/item-query";
import {
    cohortPriceCoverage,
    compileMarketCohorts,
    marketCohortManifestSchema,
} from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { compileCraftingCapture } from "../../../packages/poe-stash-ingest/src/ps/crafting-capture";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { craftingMarketItemIssue } from "../app/lib/crafting-market";
import { projectFromPreset } from "../app/lib/crafting-presets";
import type { CraftingGraph } from "../app/schemas/crafting-graph";
import { craftingPresetCohorts } from "../scripts/crafting-preset-cohorts";
import { catalog, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r14",
)!;
const scour = "Metadata/Items/Currency/CurrencyConvertToNormal";
const sourceId = "shield-make-titanium-base";
const candidates = [
    {
        id: "buy-rare-block",
        rarity: "rare",
        mods: ["LocalIncreasedBlockPercentage7"],
        counts: { prefixes: 1, suffixes: 0 },
        // The Rare probe retained ID/counts; this T1 display roll reconstructs that canonical shape.
        descriptions: ["78% increased Chance to Block"],
        sockets: 2,
    },
    {
        id: "buy-magic-life-recovery",
        rarity: "magic",
        mods: ["LocalBaseEnergyShieldAndMana3", "RecoverLifePercentOnBlockUber1_"],
        counts: { prefixes: 1, suffixes: 1 },
        descriptions: [
            "+19 to maximum Energy Shield",
            "+22 to maximum Mana",
            "Recover 5% of Life when you Block",
        ],
        sockets: 3,
    },
] as const;

function purchase(graph: CraftingGraph, id: string, alternativeId = "buy") {
    const node = graph.nodes.find((node) => node.id === id);
    if (node?.kind !== "acquire") throw new Error("Expected acquisition");
    const alternative = node.alternatives.find((entry) => entry.id === alternativeId);
    if (alternative?.kind !== "purchase") throw new Error("Expected purchase");
    return { node, alternative };
}

function preparation(candidate: (typeof candidates)[number], missing?: "base" | "scour") {
    const graph = projectFromPreset(engine, ruleset, "es-block-shield");
    const target = purchase(graph, "flat-make-base");
    target.node.choice = { mode: "pinned", alternativeId: "make-scour" };
    const source = purchase(graph, sourceId, candidate.id);
    source.node.choice = { mode: "pinned", alternativeId: candidate.id };
    if (missing !== "base") source.alternative.price = quote(11);
    if (missing !== "scour") graph.prices[scour] = quote(7);
    graph.entry = target.node.id;
    graph.iterations = 1;
    graph.outcomes = [{ ...graph.outcomes[0]!, query: target.node.output }];
    return { graph, target: target.alternative.item };
}

async function calculate(graph: CraftingGraph) {
    const retained = await retainedRevision(ruleset);
    const simulation = retained.runtime.createSimulation(retained.catalog, graph, {
        estimateIterations: 1,
        workLimit: 1000,
    });
    while (!simulation.done) simulation.runBatch(100);
    return simulation.result();
}

it.each(
    candidates,
)("retained r9 Scours the observed $id shape to the complete Normal target", async (candidate) => {
    const { graph, target } = preparation(candidate);
    graph.iterations = 16;
    const result = await calculate(graph);
    expect(result).toMatchObject({
        complete: true,
        trials: 16,
        errors: {},
        missingPrices: [],
        meanCost: 18,
    });
    for (const sample of result.samples) {
        expect(sample).toMatchObject({
            purchases: 1,
            actions: 1,
            cost: 18,
            spending: { [`purchase:${sourceId}:${candidate.id}`]: 1, [scour]: 1 },
        });
        expect(sample.item).toEqual(target);
    }
});

it.each(candidates)("$id has an exact capturable ordinary-purchase definition", (candidate) => {
    const graph = projectFromPreset(engine, ruleset, "es-block-shield");
    const { node, alternative } = purchase(graph, sourceId, candidate.id);
    const item = alternative.item;
    const queries = createCraftingItemQuery(engine);
    const cohort = craftingPresetCohorts(engine, ruleset).find(
        (entry) => cohortPriceCoverage(entry, queries.record(item), node.output).covered,
    )!;
    expect(cohort).toBeDefined();
    expect(craftingMarketItemIssue(engine, item)).toBeNull();
    expect(engine.validateItem(item)).toEqual(item);
    expect(item.rarity).toBe(candidate.rarity);
    expect(engine.counts(item)).toEqual(candidate.counts);
    expect(item.mods.map((mod) => mod.id)).toEqual(candidate.mods);
    expect(item.mods.every((mod) => !mod.crafted && !mod.fractured)).toBe(true);
    expect(item).toEqual({
        ...purchase(graph, "flat-make-base").alternative.item,
        rarity: candidate.rarity,
        mods: item.mods,
    });
    expect(alternative.price).toBeNull();
    const manifest = marketCohortManifestSchema.parse(
        JSON.parse(readFileSync("../../packages/poe-market/data/cohorts-poe1.json", "utf8")),
    );
    const scoped = { ...manifest, cohorts: [cohort] };
    const classifier = compileMarketCohorts(scoped);
    const capture = compileCraftingCapture(
        scoped,
        JSON.parse(readFileSync("../../packages/poe-market/data/capture-poe1.json", "utf8")),
    );
    const record = queries.record(item);
    const raw = {
        ...record.item,
        name: "",
        typeLine: record.item.baseType,
        sockets: Array.from({ length: candidate.sockets }, () => ({ group: 0 })),
        explicitMods: candidate.descriptions.map((description) => ({ description })),
        implicitMods: [],
        extended: candidate.counts,
        verified: true,
        identified: true,
        w: 2,
        h: 3,
        icon: "https://example.invalid/item",
    };
    expect(capture(raw)).toBe(true);
    expect(classifier.classify(normalizeApiItem("poe1", "stash", raw))).toEqual({
        matches: [cohort.id],
        unknown: [],
    });
    for (const invalid of [
        { ...raw, rarity: candidate.rarity === "rare" ? "Magic" : "Rare" },
        { ...raw, ilvl: 85 },
        { ...raw, influences: { shaper: true, elder: true } },
        { ...raw, influences: { shaper: false } },
        { ...raw, corrupted: true },
        { ...raw, fractured: true },
        { ...raw, extended: { ...candidate.counts, prefixes: 2 } },
    ])
        expect(classifier.classify(normalizeApiItem("poe1", "stash", invalid)).matches).toEqual([]);
});

it.each(
    candidates.flatMap((candidate) =>
        (["base", "scour"] as const).map((missing) => ({ candidate, missing })),
    ),
)("$candidate.id remains unpriced without $missing", async ({ candidate, missing }) => {
    const { graph, target } = preparation(candidate, missing);
    const result = await calculate(graph);
    expect(result).toMatchObject({
        complete: true,
        trials: 1,
        errors: {},
        meanCost: null,
        missingPrices: [missing === "base" ? `purchase:${sourceId}:${candidate.id}` : scour],
    });
    expect(result.samples[0]).toMatchObject({ cost: null, purchases: 1, actions: 1, item: target });
});

it.each(
    candidates,
)("retained r9 charges a separate $id source and Scouring for each consumer", async (candidate) => {
    const { graph } = preparation(candidate);
    const target = purchase(graph, "flat-make-base");
    graph.nodes.push({
        kind: "craft",
        id: "consume-bases",
        name: "Consume two scoured bases",
        output: target.node.output,
        inputs: [
            { id: "first", name: "First", source: target.node.id },
            { id: "second", name: "Second", source: target.node.id },
        ],
        method: { kind: "recombine", id: "recombine" },
        branches: [],
        ordering: "manual",
        fallback: { kind: "return" },
    });
    graph.entry = "consume-bases";
    graph.prices["service:recombine"] = quote(3);
    const result = await calculate(graph);
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
        spending: {
            [`purchase:${sourceId}:${candidate.id}`]: 2,
            [scour]: 2,
            "service:recombine": 1,
        },
    });
});

it("preserves the pinned Magic source, original Normal purchase and unselected preview", () => {
    const graph = projectFromPreset(engine, ruleset, "es-block-shield");
    const source = purchase(graph, sourceId);
    expect(source.node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(source.node.alternatives.map((entry) => entry.id)).toEqual([
        "buy",
        ...candidates.map((entry) => entry.id),
    ]);
    expect(source.alternative.item.rarity).toBe("magic");
    expect(source.alternative.item.mods.map((mod) => mod.id)).toEqual([
        "LocalIncreasedBlockPercentage7",
    ]);
    expect(source.alternative.price).toBeNull();
    expect(purchase(graph, "flat-make-base").node.choice).toEqual({
        mode: "pinned",
        alternativeId: "buy",
    });
    const previous = structuredClone(graph);
    const previousSource = purchase(previous, sourceId);
    previousSource.node.alternatives = [previousSource.alternative];
    const options = { estimateIterations: 1, workLimit: 1000 };
    expect(calculateCraftingGraph(catalog, graph, options)).toEqual(
        calculateCraftingGraph(catalog, previous, options),
    );
});
