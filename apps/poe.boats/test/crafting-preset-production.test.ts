import { expect, it } from "vite-plus/test";
import { discoverCraftingCosts } from "../app/lib/crafting-cost-inputs";
import { type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { calculateCraftingGraph } from "../app/lib/crafting-graph-simulation";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { craftingPresets, projectFromPreset } from "../app/lib/crafting-presets";
import type { CraftingGraph } from "../app/schemas/crafting-graph";
import type { CraftingPresetId } from "../app/schemas/crafting-presets";
import { catalog, engine } from "./crafting-fixtures";
import { quote, runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r9",
)!;
const donors: [CraftingPresetId, string[]][] = [
    ["life-block-shield", ["block", "max-res", "recovery"]],
    ["es-block-shield", ["flat"]],
    ["physical-bow", ["donor-0", "donor-1", "donor-2"]],
    ["elemental-bow", ["donor-0", "donor-1", "donor-2"]],
    ["rarity-helmet", ["donor-0-1", "donor-1-0", "donor-1-1"]],
    ["energy-shield-chest", ["donor-0"]],
];
const inputs = donors.flatMap(([preset, ids]) => ids.map((id) => ({ preset, id })));

function purchase(graph: CraftingGraph, id: string, alternativeId = "buy") {
    const node = graph.nodes.find((node) => node.id === id)!;
    if (node.kind !== "acquire") throw new Error("Expected acquisition");
    const alternative = node.alternatives.find((entry) => entry.id === alternativeId)!;
    if (alternative.kind !== "purchase") throw new Error("Expected purchase");
    return { node, alternative };
}

function scriptedRandom(sequence: (string | number)[]): CraftingRandom {
    return {
        integer: (min) => min,
        pick: (choices) => {
            const expected = sequence.shift();
            const selected = choices.find(({ value, weight }) =>
                weight > 0 && typeof value === "object" && value !== null && "id" in value
                    ? value.id === expected
                    : weight > 0 && value === expected,
            );
            if (!selected) throw new Error(`Requested draw is not eligible: ${expected}`);
            return selected.value;
        },
    };
}

it("keeps all retained revision 8 presets free of the new preparation routes", () => {
    const retained = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === "r8",
    )!;
    let purchases = 0;
    for (const { id } of craftingPresets) {
        const graph = projectFromPreset(engine, retained, id);
        for (const node of graph.nodes) {
            expect(node.id).not.toContain("-make");
            if (node.kind !== "acquire") continue;
            expect(node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
            expect(node.alternatives.every((alternative) => alternative.kind === "purchase")).toBe(
                true,
            );
            purchases += node.alternatives.length;
        }
    }
    expect(purchases).toBe(42);
});

it("does not spend preview work on unselected preparation routes", () => {
    const graph = projectFromPreset(engine, ruleset, "physical-bow");
    graph.iterations = 2;
    const legacy = structuredClone(graph);
    legacy.nodes = legacy.nodes.filter((node) => !node.id.includes("-make"));
    for (const node of legacy.nodes)
        if (node.kind === "acquire")
            node.alternatives = node.alternatives.filter(
                (alternative) => alternative.kind === "purchase",
            );
    const options = { estimateIterations: 1, workLimit: 1000 };
    const current = calculateCraftingGraph(catalog, graph, options);
    const original = calculateCraftingGraph(catalog, legacy, options);
    expect(current.complete).toBe(true);
    expect(current.errors).toEqual({});
    expect(current.work).toBe(original.work);
    expect(current.samples).toEqual(original.samples);
    for (const id of ["donor-0", "donor-1", "donor-2"])
        expect(
            current.acquisitions[id]?.alternatives.find((entry) => entry.id === "make-magic"),
        ).toMatchObject({
            estimated: false,
            expectedCost: null,
        });
});

it.each(
    donors,
)("%s offers explicit preparation for exactly the isolated natural donors", (preset, ids) => {
    const graph = projectFromPreset(engine, ruleset, preset);
    const acquisitions = graph.nodes.filter((node) => node.kind === "acquire");
    expect(
        acquisitions
            .filter((node) =>
                node.alternatives.some((alternative) => alternative.kind === "production"),
            )
            .map((node) => node.id),
    ).toEqual(ids);
    for (const id of ids) {
        const node = acquisitions.find((node) => node.id === id)!;
        expect(node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
        const purchase = node.alternatives.find((alternative) => alternative.id === "buy-magic")!;
        if (purchase.kind !== "purchase") throw new Error("Expected Magic purchase");
        expect(purchase.item.mods).toHaveLength(1);
        expect(node.alternatives.find((alternative) => alternative.id === "make-magic")).toEqual({
            kind: "production",
            id: "make-magic",
            name: "Roll and isolate with Alterations",
            nodeId: `${id}-make`,
        });
        const base = acquisitions.find((node) => node.id === `${id}-make-base`)!;
        const input = base.alternatives[0]!;
        if (input.kind !== "purchase") throw new Error("Expected base purchase");
        expect(input.price).toBeNull();
        expect(input.item).toEqual({ ...purchase.item, mods: [], rarity: "normal" });
        for (const [suffix, action] of [
            ["-transmute", "transmute_to_magic"],
            ["-alteration", "reroll_magic"],
            ["", "remove_random_mod"],
        ]) {
            const step = graph.nodes.find((node) => node.id === `${id}-make${suffix}`)!;
            if (step.kind !== "craft" || step.method.kind !== "currency")
                throw new Error("Expected preparation currency");
            expect(step.method).toEqual({
                kind: "currency",
                id: engine.catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
            });
            expect(engine.costs(step.method)).toHaveLength(1);
            expect(graph.prices[step.method.id]).toBeUndefined();
        }
        const discovered = discoverCraftingCosts(
            engine,
            graph.nodes.map((node) => (node.kind === "craft" ? node.method : undefined)),
        );
        expect(discovered.map(({ id }) => id)).toEqual(
            expect.arrayContaining([
                "Metadata/Items/Currency/CurrencyUpgradeToMagic",
                "Metadata/Items/Currency/CurrencyRerollMagic",
                "Metadata/Items/Currency/CurrencyRemoveMod",
            ]),
        );
    }
});

it.each(inputs)("$preset/$id pays for rerolling and recovery without rebuying the base", ({
    preset,
    id,
}) => {
    const graph = projectFromPreset(engine, ruleset, preset);
    const { node, alternative: magic } = purchase(graph, id, "buy-magic");
    const { alternative: base } = purchase(graph, `${id}-make-base`);
    node.choice = { mode: "pinned", alternativeId: "make-magic" };
    base.price = quote(11);
    const wanted = magic.item.mods[0]!.id;
    const other = engine.pool(magic.item)[0]!.id;
    const sequence = [1, other, 2, wanted, other, wanted, 2, wanted, other, other];
    const methods = ["-transmute", "-alteration", ""].map((suffix) => {
        const step = graph.nodes.find((node) => node.id === `${id}-make${suffix}`)!;
        if (step.kind !== "craft" || step.method.kind !== "currency")
            throw new Error("Expected preparation currency");
        return step.method.id;
    });
    methods.forEach((id, index) => {
        graph.prices[id] = quote([2, 3, 5][index]!);
    });
    const trial = new CraftingGraphTrial(engine, graph, scriptedRandom(sequence), {
        entry: id,
        classify: false,
        trace: true,
    });
    while (!trial.done) trial.advance();
    const result = trial.result();
    expect(result.error).toBeNull();
    expect(result.status).toBe("returned");
    expect(sequence).toEqual([]);
    expect(result.purchases).toBe(1);
    expect(result.actions).toBe(5);
    expect(result.spending).toEqual({
        [`purchase:${id}-make-base:buy`]: 1,
        [methods[0]!]: 1,
        [methods[1]!]: 2,
        [methods[2]!]: 2,
    });
    expect(result.cost).toBe(29);
    expect(result.missingPrices).toEqual([]);
    expect(result.item).toEqual(
        engine.addStartingMod({ ...base.item, rarity: "magic" }, wanted, scriptedRandom([])),
    );
    expect(createCraftingItemQuery(engine).matches(result.item!, node.output)).toBe("match");
    expect(result.visits[`${id}-make`]!.recovered).toBeGreaterThan(0);
});

it.each(inputs)("$preset/$id preparation preserves the full recipe's final item", ({
    preset,
    id,
}) => {
    const graph = projectFromPreset(engine, ruleset, preset);
    const { node, alternative: rare } = purchase(graph, id);
    const wanted = rare.item.mods[0]!.id;
    const { alternative: base } = purchase(graph, `${id}-make-base`);
    const prepared = engine.addStartingMod(
        { ...base.item, rarity: "magic" },
        wanted,
        scriptedRandom([]),
    );
    rare.item.mods = prepared.mods;
    const bought = runGraphTrial(graph, seededRandom(42));
    expect(bought.success).toBe(true);
    const random = seededRandom(42);
    const rolling: CraftingRandom = {
        integer: (min) => min,
        pick: (choices) => {
            const count =
                choices.length === 2 && choices[0]!.value === 1 && choices[1]!.value === 2;
            if (count) return choices[0]!.value;
            return (
                choices.find(({ value, weight }) => weight > 0 && value === wanted)?.value ??
                random.pick(choices)
            );
        },
    };
    node.choice = { mode: "pinned", alternativeId: "make-magic" };
    const made = runGraphTrial(graph, rolling);
    expect(made.error).toBeNull();
    expect(made.success).toBe(true);
    expect(made.item).toEqual(bought.item);
    expect(made.spending["service:recombine"]).toBe(bought.spending["service:recombine"]);
    expect(made.missingPrices).toContain(`purchase:${id}-make-base:buy`);
    expect(made.cost).toBeNull();
});
