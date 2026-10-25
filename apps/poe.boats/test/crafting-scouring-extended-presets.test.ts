import { itemQuerySchema } from "@poe-tools/item-query";
import { cohortPriceCoverage, decodeCohortPriceReference } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { discoverGraphCraftingCosts } from "../app/lib/crafting-cost-inputs";
import { seededRandom } from "../app/lib/crafting-engine";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { bindCohortPurchasePrice } from "../app/lib/crafting-market";
import { craftingPresets, projectFromPreset } from "../app/lib/crafting-presets";
import { rulesetReference, validateRulesetGraph } from "../app/lib/crafting-rulesets";
import {
    estimateSourcePurchase,
    purchaseSourceProfile,
    sourcePreparationMethods,
} from "../app/lib/crafting-source-preparation";
import { craftingPresetCohorts } from "../scripts/crafting-preset-cohorts";
import { currency, engine } from "./crafting-fixtures";
import { anyItem, quote, runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";
import { marketCandidate } from "./crafting-market-fixtures";

const prior = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r12",
)!;
const ruleset = { ...prior, revision: "r13", engine: "crafting-graph-13" };
const current = { ...prior, revision: "r15", engine: "crafting-graph-15" };
const scour = currency("convert_to_normal").id;
const transmute = currency("transmute_to_magic");
const targets = [
    {
        preset: "tailwind-boots",
        nodeId: "tailwind-base-make-base",
        transmuteId: "tailwind-base-make-transmute",
        baseId: "Metadata/Items/Armours/Boots/BootsAtlas1",
    },
    {
        preset: "suppression-chest",
        nodeId: "suppression-base",
        transmuteId: "suppression-transmute",
        baseId: "Metadata/Items/Armours/BodyArmours/BodyDex16",
    },
] as const;
const partitions = [
    { id: "buy-scour", crafted: false, enchanted: false },
    { id: "buy-scour-crafted", crafted: true, enchanted: false },
    { id: "buy-scour-enchanted", crafted: false, enchanted: true },
    { id: "buy-scour-crafted-enchanted", crafted: true, enchanted: true },
] as const;

function fixture(target: (typeof targets)[number], id: string = partitions[3].id) {
    const graph = projectFromPreset(engine, current, target.preset);
    const node = graph.nodes.find((entry) => entry.id === target.nodeId)!;
    if (node.kind !== "acquire") throw new Error("Expected Normal acquisition.");
    const purchase = node.alternatives.find((entry) => entry.id === id)!;
    if (purchase.kind !== "purchase") throw new Error("Expected source purchase.");
    node.choice = { mode: "pinned", alternativeId: id };
    purchase.price = quote(11);
    graph.prices[scour] = quote(2);
    graph.entry = node.id;
    graph.outcomes[0]!.query = node.output;
    return { graph, node, purchase };
}

it.each(craftingPresets)("keeps $id unchanged apart from the two r13 source lists", ({ id }) => {
    const old = projectFromPreset(engine, prior, id);
    const graph = projectFromPreset(engine, ruleset, id);
    for (const target of targets.filter((entry) => entry.preset === id)) {
        const node = graph.nodes.find((entry) => entry.id === target.nodeId)!;
        const before = old.nodes.find((entry) => entry.id === target.nodeId)!;
        if (node.kind !== "acquire" || before.kind !== "acquire")
            throw new Error("Expected Normal acquisition.");
        expect(node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
        expect(node.output).toEqual(before.output);
        expect(before.alternatives).toHaveLength(1);
        expect(node.alternatives).toHaveLength(5);
        for (const partition of partitions) {
            const purchase = node.alternatives.find((entry) => entry.id === partition.id)!;
            if (purchase.kind !== "purchase" || before.alternatives[0]?.kind !== "purchase")
                throw new Error("Expected source purchase.");
            expect(purchase).toMatchObject({
                price: null,
                sourcePreparation: {
                    kind: "scour-v1",
                    crafted: partition.crafted,
                    enchanted: partition.enchanted,
                },
                item: {
                    baseId: target.baseId,
                    level: 86,
                    rarity: "normal",
                    mods: [],
                    influences: [],
                },
            });
            expect(purchase.item).toEqual(before.alternatives[0].item);
        }
        node.alternatives = node.alternatives.filter((entry) => entry.id === "buy");
    }
    expect({ ...graph, id: old.id, ruleset: old.ruleset }).toEqual(old);
});

it.each(
    targets.flatMap((target) => partitions.map((partition) => ({ ...target, ...partition }))),
)("charges the full $id preparation before $preset Transmutation", (target) => {
    const { graph, node, purchase } = fixture(target, target.id);
    const count = 1 + Number(target.crafted) + 3 * Number(target.enchanted);
    const actions = 1 + Number(target.crafted) + Number(target.enchanted);
    expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
        expectedCost: 11 + 2 * count,
        expectedActions: actions,
        missingPrices: [],
    });
    expect(discoverGraphCraftingCosts(engine, graph).some((cost) => cost.id === scour)).toBe(true);
    graph.entry = target.transmuteId;
    graph.outcomes[0]!.query = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "and", filters: [{ kind: "rarity", values: ["Magic"] }] }],
    });
    graph.prices[transmute.id] = quote(3);
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({
        success: true,
        purchases: 1,
        actions: actions + 1,
        cost: 14 + 2 * count,
        missingPrices: [],
        spending: { [scour]: count, [transmute.id]: 1, [`purchase:${node.id}:${purchase.id}`]: 1 },
    });
    expect(result.nodeItems?.[node.id]).toEqual(purchase.item);
    expect(result.trace[0]?.preparation).toEqual(
        sourcePreparationMethods(engine, purchase.sourcePreparation!),
    );
});

it.each(targets)("pays for another $preset source and cleanup after discard", (target) => {
    const { graph, node, purchase } = fixture(target);
    graph.nodes.push({
        kind: "craft",
        id: "discard-test",
        name: "Discard the prepared source",
        method: transmute,
        inputs: [{ id: "input", name: "Source", source: node.id }],
        output: anyItem,
        branches: [],
        ordering: "manual",
        fallback: { kind: "discard" },
    });
    graph.entry = "discard-test";
    graph.maxSteps = 4;
    graph.prices[transmute.id] = quote(3);
    expect(runGraphTrial(graph, seededRandom(42))).toMatchObject({
        status: "truncated",
        purchases: 2,
        actions: 8,
        cost: 48,
        missingPrices: [],
        spending: { [scour]: 10, [transmute.id]: 2, [`purchase:${node.id}:${purchase.id}`]: 2 },
    });
});

it.each(
    targets.flatMap((target) =>
        ["purchase", "scouring"].map((missing) => ({ ...target, missing })),
    ),
)("keeps $preset unknown without its $missing price", (target) => {
    const { graph, node, purchase } = fixture(target);
    const missing = target.missing === "purchase" ? `purchase:${node.id}:${purchase.id}` : scour;
    if (target.missing === "purchase") purchase.price = null;
    else delete graph.prices[scour];
    expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
        expectedCost: null,
        missingPrices: [missing],
    });
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({ success: true, cost: null, missingPrices: [missing] });
    expect(result.nodeItems?.[node.id]).toEqual(purchase.item);
});

it.each(
    targets,
)("binds only the exact $preset source policy and keeps cleanup separate", (target) => {
    const { graph, node, purchase } = fixture(target);
    graph.league = marketCandidate.latest.league;
    const profile = purchaseSourceProfile(purchase);
    if (profile?.kind !== "scour-v1") throw new Error("Expected Scouring source profile.");
    const record = createCraftingItemQuery(engine).record(purchase.item);
    const definitions = craftingPresetCohorts(engine, ruleset);
    const matching = definitions.filter(
        (definition) =>
            cohortPriceCoverage(definition, record, node.output, undefined, profile).covered,
    );
    expect(matching).toHaveLength(1);
    const definition = matching[0]!;
    const candidate = {
        ...structuredClone(marketCandidate),
        sourcePreparation: profile,
        definition: { ...marketCandidate.definition, ...definition },
        latest: { ...marketCandidate.latest, cohortId: definition.id },
    };
    const bound = bindCohortPurchasePrice(graph, engine, node.id, purchase.id, candidate);
    const boundNode = bound.nodes.find((entry) => entry.id === node.id)!;
    if (boundNode.kind !== "acquire") throw new Error("Expected bound acquisition.");
    const boundPurchase = boundNode.alternatives.find((entry) => entry.id === purchase.id)!;
    if (boundPurchase.kind !== "purchase") throw new Error("Expected bound source.");
    expect(boundPurchase.price?.amount).toBe(20);
    expect(decodeCohortPriceReference(boundPurchase.price!.cohortId!)?.sourcePreparation).toEqual(
        profile,
    );
    expect(runGraphTrial(bound, seededRandom(42))).toMatchObject({
        success: true,
        purchases: 1,
        actions: 3,
        cost: 30,
        missingPrices: [],
    });
    expect(() => bindCohortPurchasePrice(graph, engine, node.id, "buy", candidate)).toThrow(
        "different source preparation",
    );
    expect(
        cohortPriceCoverage(definition, record, node.output, undefined, {
            ...profile,
            crafted: false,
        }).covered,
    ).toBe(false);
    for (const item of [
        { ...purchase.item, level: 85 },
        {
            ...purchase.item,
            influences: [
                engine.catalog.crafting.modRules.RecoverLifePercentOnBlockUber1_!.influence!,
            ],
        },
    ])
        expect(
            cohortPriceCoverage(
                definition,
                createCraftingItemQuery(engine).record(item),
                node.output,
                undefined,
                profile,
            ).covered,
        ).toBe(false);
});

it.each(targets)("refuses $preset extended sources under r12", (target) => {
    const { graph } = fixture(target);
    graph.ruleset = rulesetReference(prior);
    expect(() => validateRulesetGraph(prior, graph)).toThrow(/13|Scouring source/i);
});
