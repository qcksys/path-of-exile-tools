import { matchItem } from "@poe-tools/item-query";
import { cohortPriceCoverage } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { janusRarityModifier as janus } from "../app/lib/crafting-janus";
import { craftingPresets, projectFromPreset } from "../app/lib/crafting-presets";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import type { CraftingGraph } from "../app/schemas/crafting-graph";
import { craftingPresetCohorts } from "../scripts/crafting-preset-cohorts";
import { catalog, engine } from "./crafting-fixtures";
import { quote, runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const prior = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r13",
)!;
const ruleset = { ...prior, revision: "r14", engine: "crafting-graph-14" };
const donorId = "donor-0-0";

function purchase(graph: CraftingGraph, id = donorId, alternativeId = "buy") {
    const node = graph.nodes.find((entry) => entry.id === id)!;
    if (node.kind !== "acquire") throw new Error("Expected acquisition.");
    const alternative = node.alternatives.find((entry) => entry.id === alternativeId);
    if (alternative?.kind !== "purchase") throw new Error("Expected purchase.");
    return { node, alternative };
}

it("keeps the original Rare purchase, target and self-service price unchanged", () => {
    const original = projectFromPreset(engine, prior, "rarity-helmet");
    const graph = projectFromPreset(engine, ruleset, "rarity-helmet");
    const donor = purchase(graph);
    expect(donor.node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(donor.alternative).toEqual(purchase(original).alternative);
    expect(graph.prices["service:recombine"]).toEqual(quote(0));
    donor.node.alternatives = [donor.alternative];
    expect({ ...graph, id: original.id, ruleset: original.ruleset }).toEqual(original);
});

it.each(
    craftingPresets.filter(({ id }) => !["rarity-helmet", "sushi-rf-helmet"].includes(id)),
)("leaves $id unchanged by the Janus purchase alternative", ({ id }) => {
    const original = projectFromPreset(engine, prior, id);
    const graph = projectFromPreset(engine, ruleset, id);
    expect({ ...graph, id: original.id, ruleset: original.ruleset }).toEqual(original);
});

it("captures only the exact Magic Janus state in its distinct purchase cohort", () => {
    const graph = projectFromPreset(engine, ruleset, "rarity-helmet");
    const { node, alternative } = purchase(graph, donorId, "buy-magic");
    const record = createCraftingItemQuery(engine).record(alternative.item);
    const cohorts = craftingPresetCohorts(engine, ruleset).filter(
        (cohort) => cohortPriceCoverage(cohort, record, node.output).covered,
    );
    expect(cohorts).toHaveLength(1);
    expect(alternative.price).toBeNull();
    expect(alternative.item).toEqual({ ...purchase(graph).alternative.item, rarity: "magic" });
    expect(alternative.item).toMatchObject({ level: 86, influences: [], mods: [{ id: janus }] });
    for (const invalid of [
        { ...record, item: { ...record.item, rarity: "Rare" as const } },
        { ...record, item: { ...record.item, ilvl: 85 } },
        { ...record, item: { ...record.item, influences: { elder: true } } },
        { ...record, facts: { ...record.facts, prefixes: 1 } },
    ])
        expect(matchItem(invalid, cohorts[0]!.query)).toBe("no-match");
});

it.each([
    true,
    false,
])("charges the Magic purchase without converting its rarity, priced=%s", (priced) => {
    const graph = projectFromPreset(engine, ruleset, "rarity-helmet");
    const { node, alternative } = purchase(graph, donorId, "buy-magic");
    node.choice = { mode: "pinned", alternativeId: alternative.id };
    if (priced) alternative.price = quote(11);
    const trial = new CraftingGraphTrial(engine, graph, seededRandom(42), {
        entry: donorId,
        classify: false,
    });
    while (!trial.done) trial.advance();
    expect(trial.result()).toMatchObject({
        status: "returned",
        error: null,
        item: alternative.item,
        cost: priced ? 11 : null,
        missingPrices: priced ? [] : [`purchase:${donorId}:buy-magic`],
        purchases: 1,
        actions: 0,
        spending: { [`purchase:${donorId}:buy-magic`]: 1 },
    });
    expect(trial.result().item!.rarity).toBe("magic");
});

it("preserves every immediate outcome and the full seeded craft when using Magic Janus", () => {
    const graph = projectFromPreset(
        engine,
        { ...ruleset, revision: "r16", engine: "crafting-graph-16" },
        "rarity-helmet",
    );
    for (const node of graph.nodes)
        if (node.kind === "acquire")
            for (const alternative of node.alternatives)
                if (alternative.kind === "purchase") alternative.price = quote(11);
    const rare = purchase(graph).alternative.item;
    const magic = purchase(graph, donorId, "buy-magic").alternative.item;
    const partner = purchase(graph, "donor-0-1").alternative.item;
    const expected = recombinationOutcomes(engine, rare, partner);
    expect(expected).toHaveLength(8);
    expect(recombinationOutcomes(engine, magic, partner)).toEqual(expected);
    const magicGraph = structuredClone(graph);
    purchase(magicGraph).node.choice = { mode: "pinned", alternativeId: "buy-magic" };
    for (let seed = 1; seed <= 16; seed++) {
        const before = runGraphTrial(graph, seededRandom(seed));
        const after = runGraphTrial(magicGraph, seededRandom(seed));
        expect(after).toMatchObject({
            success: true,
            item: before.item,
            cost: before.cost,
            actions: before.actions,
            purchases: before.purchases,
            visits: before.visits,
            missingPrices: [],
        });
        expect(after.spending[`purchase:${donorId}:buy-magic`]).toBe(
            before.spending[`purchase:${donorId}:buy`],
        );
    }
    magicGraph.iterations = 32;
    const result = calculateCraftingGraph(catalog, magicGraph, { estimateIterations: 1 });
    expect(result).toMatchObject({
        complete: true,
        probability: 1,
        trials: 32,
        errors: {},
        missingPrices: [],
    });
});
