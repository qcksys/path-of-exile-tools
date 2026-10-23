import { expect, it } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { projectFromPreset } from "../app/lib/crafting-presets";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import type { CraftingPresetId } from "../app/schemas/crafting-presets";
import { catalog, engine } from "./crafting-fixtures";
import { runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r10",
)!;
const singleModifiers: [CraftingPresetId, string[]][] = [
    ["life-block-shield", ["block", "max-res"]],
    ["es-block-shield", ["flat"]],
    ["physical-bow", ["donor-0", "donor-1", "donor-2"]],
    ["elemental-bow", ["donor-0", "donor-1", "donor-2"]],
    ["rarity-helmet", ["donor-0-1", "donor-1-0", "donor-1-1"]],
    ["energy-shield-chest", ["donor-0"]],
];
const recoveryDonors = [
    ["life-block-shield", "recovery"],
    ["es-block-shield", "flat-block"],
] as const;
const selected = singleModifiers.map(([preset, ids]): [CraftingPresetId, string[]] => [
    preset,
    [...ids, ...recoveryDonors.filter(([id]) => id === preset).map(([, node]) => node)],
]);
const quote = { amount: 10, currency: "chaos", source: "manual", confidence: null } as const;

it.each(
    singleModifiers,
)("%s offers Magic donors with identical immediate outcomes", (preset, ids) => {
    const graph = projectFromPreset(engine, ruleset, preset);
    const purchases = graph.nodes.filter((node) => node.kind === "acquire");
    expect(
        purchases
            .filter((node) =>
                node.alternatives.some((alternative) => alternative.id === "buy-magic"),
            )
            .map((node) => node.id),
    ).toEqual(selected.find(([id]) => id === preset)![1]);
    const queries = createCraftingItemQuery(engine);
    for (const node of purchases) {
        const rare = node.alternatives[0]!;
        if (rare.kind !== "purchase") throw new Error("Expected purchase");
        expect(rare.id).toBe("buy");
        expect(node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
        if (!ids.includes(node.id)) {
            continue;
        }
        const magic = node.alternatives[1]!;
        if (magic.kind !== "purchase") throw new Error("Expected Magic purchase");
        expect(magic).toMatchObject({ id: "buy-magic", price: null });
        expect(magic.item).toEqual({ ...rare.item, rarity: "magic" });
        expect(engine.validateItem(magic.item)).toEqual(magic.item);
        expect(queries.matches(magic.item, node.output)).toBe("match");
        expect(magic.item.mods).toHaveLength(1);
        expect(engine.pool({ ...magic.item, mods: [] }).map((entry) => entry.id)).toContain(
            magic.item.mods[0]!.id,
        );
        const consumers = graph.nodes.filter(
            (entry) =>
                entry.kind === "craft" && entry.inputs.some((input) => input.source === node.id),
        );
        expect(consumers.length).toBeGreaterThan(0);
        for (const consumer of consumers) {
            if (consumer.kind !== "craft") throw new Error("Expected craft");
            expect(consumer.method.kind).toBe("recombine");
            const inputs = consumer.inputs.map(
                (input) => purchases.find((entry) => entry.id === input.source)!,
            );
            expect(inputs.every(Boolean)).toBe(true);
            const [left, right] = inputs.map((input) => input.alternatives[0]!);
            if (left!.kind !== "purchase" || right!.kind !== "purchase")
                throw new Error("Expected donors");
            const expected = recombinationOutcomes(engine, left!.item, right!.item);
            for (const a of inputs[0]!.alternatives)
                for (const b of inputs[1]!.alternatives) {
                    if (a.kind !== "purchase" || b.kind !== "purchase") continue;
                    expect(recombinationOutcomes(engine, a.item, b.item)).toEqual(expected);
                }
        }
    }
});

it.each(recoveryDonors)("%s/%s preserves every recovery donor outcome as Magic", (preset, id) => {
    const graph = projectFromPreset(engine, ruleset, preset);
    const purchase = (nodeId: string, alternativeId = "buy") => {
        const node = graph.nodes.find((entry) => entry.id === nodeId)!;
        if (node.kind !== "acquire") throw new Error("Expected purchase node");
        const alternative = node.alternatives.find((entry) => entry.id === alternativeId);
        if (alternative?.kind !== "purchase") throw new Error("Expected purchase alternative");
        return alternative.item;
    };
    const rare = purchase(id);
    const magic = purchase(id, "buy-magic");
    expect(engine.validateItem(magic)).toEqual({ ...rare, rarity: "magic" });
    const pool = engine.pool({ ...magic, mods: [] }).map((entry) => entry.id);
    for (const mod of magic.mods) expect(pool).toContain(mod.id);
    if (preset === "life-block-shield") {
        const intermediate = recombinationOutcomes(engine, purchase("block"), purchase("max-res"));
        expect(intermediate).toHaveLength(6);
        for (const { value } of intermediate)
            expect(recombinationOutcomes(engine, value, magic)).toEqual(
                recombinationOutcomes(engine, value, rare),
            );
    } else {
        expect(engine.counts(magic)).toEqual({ prefixes: 1, suffixes: 1 });
        expect(recombinationOutcomes(engine, magic, purchase("block"))).toEqual(
            recombinationOutcomes(engine, rare, purchase("block")),
        );
    }
});

it.each(
    selected,
)("%s keeps full graph results equivalent and selects only priced alternatives", (preset, ids) => {
    const graph = projectFromPreset(engine, ruleset, preset);
    graph.iterations = 8;
    graph.prices["service:recombine"] = quote;
    for (const node of graph.nodes) {
        if (node.kind !== "acquire") continue;
        if (ids.includes(node.id)) node.choice = { mode: "automatic" };
        for (const alternative of node.alternatives)
            if (
                alternative.kind === "purchase" &&
                (!ids.includes(node.id) || alternative.id === "buy-magic")
            )
                alternative.price = quote;
    }
    const legacy = structuredClone(graph);
    for (const node of legacy.nodes) {
        if (node.kind !== "acquire") continue;
        node.choice = { mode: "pinned", alternativeId: "buy" };
        node.alternatives = node.alternatives.filter((alternative) => alternative.id === "buy");
        if (node.alternatives[0]!.kind === "purchase") node.alternatives[0]!.price = quote;
    }
    const options = { estimateIterations: 1, workLimit: 100_000 };
    const magic = calculateCraftingGraph(catalog, graph, options);
    expect(magic.errors).toEqual({});
    expect(magic.missingPrices).toEqual([]);
    expect(magic.meanCost).toBeGreaterThan(0);
    expect(magic.probability).toBe(1);
    const rareTrial = runGraphTrial(legacy, seededRandom(42));
    const magicTrial = runGraphTrial(graph, seededRandom(42));
    expect(magicTrial.success).toBe(true);
    expect(magicTrial.cost).toBe(rareTrial.cost);
    expect(magicTrial.item).toEqual(rareTrial.item);
    expect(magicTrial.visits).toEqual(rareTrial.visits);
    for (const id of ids) expect(magic.acquisitions[id]?.selectedId).toBe("buy-magic");
});

it("preserves the initial Rare preview and refuses unknown prices when switched to automatic", () => {
    const graph = projectFromPreset(engine, ruleset, "physical-bow");
    graph.iterations = 1;
    const pinned = calculateCraftingGraph(catalog, graph, { estimateIterations: 1 });
    expect(pinned.errors).toEqual({});
    expect(pinned.probability).toBe(1);
    expect(pinned.meanCost).toBeNull();
    expect(pinned.missingPrices.length).toBeGreaterThan(0);
    for (const node of graph.nodes)
        if (node.kind === "acquire") node.choice = { mode: "automatic" };
    const unknown = calculateCraftingGraph(catalog, graph, { estimateIterations: 1 });
    expect(unknown.meanCost).toBeNull();
    expect(unknown.complete).toBe(false);
    expect(Object.keys(unknown.errors).join(" ")).toContain(
        "No priced acquisition choice is available",
    );
    for (const comparison of Object.values(unknown.acquisitions)) {
        expect(comparison.selectedId).toBeNull();
        expect(
            comparison.alternatives.every((alternative) => alternative.expectedCost === null),
        ).toBe(true);
    }
});
