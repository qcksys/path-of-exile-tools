import { itemQuerySchema, type ScourSourcePreparation } from "@poe-tools/item-query";
import { expect, it } from "vite-plus/test";
import { discoverGraphCraftingCosts } from "../app/lib/crafting-cost-inputs";
import { seededRandom } from "../app/lib/crafting-engine";
import { CraftingGraphSimulation } from "../app/lib/crafting-graph-simulation";
import { validateCraftingGraph } from "../app/lib/crafting-graph-validation";
import { bindCohortPurchasePrice } from "../app/lib/crafting-market";
import { craftingNodeCostKey } from "../app/lib/crafting-node-prices";
import { rulesetReference, validateRulesetGraph } from "../app/lib/crafting-rulesets";
import {
    estimateSourcePurchase,
    prepareSourcePurchase,
    purchaseSourceProfile,
    sourcePreparationMethods,
} from "../app/lib/crafting-source-preparation";
import type { CraftingItem } from "../app/schemas/crafting";
import {
    type GraphAcquireNode,
    type GraphPurchase,
    graphPurchaseSchema,
} from "../app/schemas/crafting-graph";
import { baseId as bodyArmourId, catalog, currency, engine } from "./crafting-fixtures";
import { anyItem, graphFixture, quote, runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";
import { marketCandidate } from "./crafting-market-fixtures";

const scour = currency("convert_to_normal").id;
const prior = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r11",
)!;
const ruleset = { ...prior, revision: "r14", engine: "crafting-graph-14" };
const scopes = [
    "Heat-attuned Tower Shield",
    "Pinnacle Tower Shield",
    "Titanium Spirit Shield",
    "Hubris Circlet",
];
const partitions = [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
] as const;

function fixture(name = scopes[0]!, crafted = true, enchanted = true) {
    const baseId = Object.entries(catalog.bases).find(
        ([id, base]) => base.name === name && !id.includes("Royale"),
    )![0];
    const item = engine.createItem(baseId, 86);
    if (engine.base(item).item_class === "Shield")
        item.influences = [catalog.crafting.modRules.RecoverLifePercentOnBlockUber1_!.influence!];
    const source: ScourSourcePreparation = { kind: "scour-v1", crafted, enchanted };
    const purchase: GraphPurchase = {
        kind: "purchase",
        id: "buy",
        name: "Source fixture",
        item,
        sourcePreparation: source,
        price: quote(11),
    };
    const graph = graphFixture();
    graph.ruleset = { ...graph.ruleset, revision: "r14", engine: "crafting-graph-14" };
    const node: GraphAcquireNode = {
        kind: "acquire" as const,
        id: "base",
        name: "Prepare Normal base",
        output: anyItem,
        choice: { mode: "pinned" as const, alternativeId: "buy" },
        alternatives: [purchase],
    };
    graph.nodes = [node];
    graph.entry = node.id;
    graph.outcomes = [
        {
            id: "normal",
            name: "Normal base",
            query: anyItem,
            success: true,
            disposition: "keep",
            price: null,
        },
    ];
    graph.prices = { [scour]: quote(2) };
    graph.iterations = 1;
    return { graph, node, purchase, source };
}

function actualSource(purchase: GraphPurchase, rarity: "magic" | "rare") {
    let item: CraftingItem = { ...structuredClone(purchase.item), rarity };
    for (const side of ["prefix", "suffix"]) {
        const mod = engine.pool(item).find((entry) => entry.mod.generation_type === side)!;
        item = engine.addStartingMod(item, mod.id, seededRandom(1));
    }
    if (purchase.sourcePreparation!.crafted) {
        item.rarity = "rare";
        const recipe = catalog.crafting.bench.find(
            (entry) => entry.mod === "DexMasterItemGenerationCannotChangeSuffixes",
        )!;
        item = engine.apply(item, { kind: "bench", id: recipe.id }, seededRandom(2)).item;
    }
    if (purchase.sourcePreparation!.enchanted)
        item.enchantments = [
            engine.rollMod("HarvestAlternateArmourQualityLightningResistance", seededRandom(3)),
        ];
    return engine.validateItem(item);
}

it.each([
    ["Two-Toned Boots", "Metadata/Items/Armours/Boots/BootsAtlas1"],
    ["Zodiac Leather", "Metadata/Items/Armours/BodyArmours/BodyDex16"],
])("prepares only the configured %s base with every paid cleanup partition", (name, baseId) => {
    for (const [crafted, enchanted] of partitions) {
        const { graph, node, purchase, source } = fixture(name, crafted, enchanted);
        expect(purchase.item.baseId).toBe(baseId);
        expect(() => validateCraftingGraph(catalog, graph)).not.toThrow();
        expect(() => validateRulesetGraph(ruleset, graph)).not.toThrow();
        const prepared = prepareSourcePurchase(engine, purchase, seededRandom(4));
        expect(prepared.item).toEqual(purchase.item);
        // The catalog has no modeled boot enchantment. Its raw source still pays the
        // class-supported removal bench; no invented enchantment enters the template.
        if (name !== "Two-Toned Boots" || !enchanted) {
            let actual = actualSource(purchase, "rare");
            const costs = [];
            for (const method of sourcePreparationMethods(engine, source)) {
                const result = engine.apply(actual, method, seededRandom(4));
                costs.push(...result.cost);
                actual = result.item;
            }
            expect(actual).toEqual(purchase.item);
            expect(prepared.costs).toEqual(costs);
        }
        expect(
            catalog.crafting.bench.find((entry) => entry.id === "bench:373")!.itemClasses,
        ).toContain(engine.base(purchase.item).item_class);
        expect(prepared.costs.every((cost) => cost.id === scour)).toBe(true);
        expect(prepared.costs.reduce((sum, cost) => sum + cost.amount, 0)).toBe(
            1 + Number(crafted) + 3 * Number(enchanted),
        );
        expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
            expectedCost: 11 + 2 * (1 + Number(crafted) + 3 * Number(enchanted)),
            expectedActions: 1 + Number(crafted) + Number(enchanted),
            missingPrices: [],
        });
        expect(runGraphTrial(graph, seededRandom(4))).toMatchObject({
            success: true,
            actions: 1 + Number(crafted) + Number(enchanted),
            spending: { [scour]: 1 + Number(crafted) + 3 * Number(enchanted) },
        });
    }
});

it("keeps the two new bases out of retained r12 validation, binding and execution", async () => {
    const retained = historyIndex.revisions.find(
        (entry) => entry.game === "poe1" && entry.revision === "r12",
    )!;
    const loaded = await retainedRevision(retained);
    for (const name of ["Two-Toned Boots", "Zodiac Leather"]) {
        const { graph, node, purchase } = fixture(name);
        graph.ruleset = rulesetReference(retained);
        expect(() => validateRulesetGraph(retained, graph)).toThrow("engine 13");
        expect(() =>
            bindCohortPurchasePrice(graph, engine, node.id, purchase.id, marketCandidate),
        ).toThrow("engine 13");
        expect(() => loaded.runtime.createSimulation(loaded.catalog, graph)).toThrow(
            "shield or helmet",
        );
    }
    const { graph } = fixture();
    graph.ruleset = rulesetReference(retained);
    expect(() => validateRulesetGraph(retained, graph)).not.toThrow();
    expect(() => loaded.runtime.createSimulation(loaded.catalog, graph)).not.toThrow();
});

it("does not extend Scouring preparation to other boots or body armours", () => {
    for (const baseId of [
        "Metadata/Items/Armours/Boots/BootsAtlas2",
        "Metadata/Items/Armours/Boots/BootsAtlas3",
        bodyArmourId,
    ]) {
        const { graph, purchase } = fixture();
        purchase.item = engine.createItem(baseId, 86);
        expect(() => validateCraftingGraph(catalog, graph)).toThrow("Scouring source");
        expect(() => prepareSourcePurchase(engine, purchase, seededRandom(1))).toThrow(
            "Scouring source",
        );
    }
});

it.each(
    scopes,
)("matches real paid cleanup and Scouring for %s without invented affixes", (name) => {
    for (const crafted of [false, true]) {
        const enchanted = false;
        const { purchase, source } = fixture(name, crafted, enchanted);
        for (const rarity of ["magic", "rare"] as const) {
            let actual = actualSource(purchase, rarity);
            for (const method of sourcePreparationMethods(engine, source))
                actual = engine.apply(actual, method, seededRandom(2)).item;
            const prepared = prepareSourcePurchase(engine, purchase, seededRandom(2));
            expect(prepared.item).toEqual(actual);
            expect(prepared.item).toEqual(purchase.item);
            expect(prepared.actions).toBe(1 + Number(crafted) + Number(enchanted));
            expect(prepared.costs.reduce((total, cost) => total + cost.amount, 0)).toBe(
                1 + Number(crafted) + 3 * Number(enchanted),
            );
            expect(prepared.costs.every((cost) => cost.id === scour)).toBe(true);
            expect(
                engine.apply(prepared.item, currency("transmute_to_magic"), seededRandom(3)).item
                    .rarity,
            ).toBe("magic");
        }
    }
});

it.each([
    ["prefix lock", ["bench:824"]],
    ["suffix lock", ["bench:825"]],
    ["attack restriction", ["bench:827"]],
    ["caster restriction", ["bench:828"]],
    ["multicraft and both locks", ["bench:826", "bench:824", "bench:825"]],
] as const)("removes actual %s before Scouring without retaining protected affixes", (_name, recipes) => {
    for (const name of scopes) {
        const { purchase } = fixture(name, false, false);
        let actual = actualSource(purchase, "rare");
        for (const id of recipes)
            actual = engine.apply(actual, { kind: "bench", id }, seededRandom(1)).item;
        purchase.sourcePreparation = { kind: "scour-v1", crafted: true, enchanted: false };
        if (recipes.some((id) => id === "bench:824" || id === "bench:825"))
            expect(
                engine.apply(actual, currency("convert_to_normal"), seededRandom(1)).item.mods
                    .length,
            ).toBeGreaterThan(0);
        for (const method of sourcePreparationMethods(engine, purchase.sourcePreparation))
            actual = engine.apply(actual, method, seededRandom(2)).item;
        expect(actual).toEqual(purchase.item);
        expect(prepareSourcePurchase(engine, purchase, seededRandom(2)).item).toEqual(actual);
    }
});

it("proves the shared removal bench with a real supported enchant without inventing a helmet enchant", () => {
    const { purchase, source } = fixture();
    const removal = catalog.crafting.bench.find((recipe) => recipe.id === "bench:373")!;
    expect(removal.itemClasses).toEqual(expect.arrayContaining(["Shield", "Helmet"]));
    purchase.item = engine.createItem(bodyArmourId, 86);
    let actual = actualSource(purchase, "rare");
    expect(actual.enchantments?.[0]?.id).toBe("HarvestAlternateArmourQualityLightningResistance");
    const costs = [];
    for (const method of sourcePreparationMethods(engine, source)) {
        const result = engine.apply(actual, method, seededRandom(3));
        costs.push(...result.cost);
        actual = result.item;
    }
    expect(actual).toEqual(purchase.item);
    expect(costs.reduce((total, cost) => total + cost.amount, 0)).toBe(5);
    expect(costs.every((cost) => cost.id === scour)).toBe(true);
    expect(() => prepareSourcePurchase(engine, purchase, seededRandom(3))).toThrow(
        "shield or helmet",
    );
});

it("does not project a fractured source to Normal", () => {
    const { purchase } = fixture("Hubris Circlet", false, false);
    const actual = actualSource(purchase, "rare");
    actual.mods[0]!.fractured = true;
    const scoured = engine.apply(actual, currency("convert_to_normal"), seededRandom(1)).item;
    expect(scoured.mods).toEqual([actual.mods[0]]);
    expect(scoured.rarity).not.toBe("normal");
    purchase.item = scoured;
    expect(() => prepareSourcePurchase(engine, purchase, seededRandom(1))).toThrow("Normal");
});

it.each(
    partitions,
)("charges crafted=%s enchanted=%s in estimates, discovery and trial trace", (crafted, enchanted) => {
    const { graph, node, purchase, source } = fixture(scopes[0], crafted, enchanted);
    const amount = 1 + Number(crafted) + 3 * Number(enchanted);
    const actions = 1 + Number(crafted) + Number(enchanted);
    expect(purchaseSourceProfile(purchase)).toEqual(source);
    expect(discoverGraphCraftingCosts(engine, graph).map((cost) => cost.id)).toEqual([scour]);
    expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
        expectedCost: 11 + 2 * amount,
        expectedActions: actions,
        missingPrices: [],
    });
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({
        success: true,
        purchases: 1,
        actions,
        cost: 11 + 2 * amount,
        missingPrices: [],
    });
    expect(result.spending[scour]).toBe(amount);
    expect(result.trace[0]?.preparation).toEqual(sourcePreparationMethods(engine, source));
    expect(result.nodeItems?.[node.id]).toEqual(purchase.item);
});

it.each(["purchase", "scouring"])("preserves unknown total when %s price is missing", (missing) => {
    const { graph, node, purchase } = fixture();
    const id = missing === "purchase" ? `purchase:${node.id}:${purchase.id}` : scour;
    if (missing === "purchase") purchase.price = null;
    else delete graph.prices[scour];
    expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
        expectedCost: null,
        missingPrices: [id],
    });
    expect(runGraphTrial(graph, seededRandom(42))).toMatchObject({
        success: true,
        cost: null,
        missingPrices: [id],
    });
});

it("repeats the raw ask and every cleanup charge on discarded acquisitions", () => {
    const { graph, node } = fixture();
    const transmute = currency("transmute_to_magic");
    graph.nodes.push({
        kind: "craft",
        id: "discard",
        name: "Discard prepared item",
        method: transmute,
        inputs: [{ id: "input", name: "Base", source: node.id }],
        output: anyItem,
        branches: [],
        ordering: "manual",
        fallback: { kind: "discard" },
    });
    graph.entry = "discard";
    graph.maxSteps = 4;
    graph.prices[transmute.id] = quote(2);
    expect(runGraphTrial(graph, seededRandom(42))).toMatchObject({
        status: "truncated",
        purchases: 2,
        actions: 8,
        cost: 46,
        missingPrices: [],
        spending: { [scour]: 10, [`purchase:${node.id}:buy`]: 2, [transmute.id]: 2 },
    });
});

it("compares full preparation costs and honors a scoped Scouring override", () => {
    const { graph, node, purchase } = fixture();
    const clean = structuredClone(purchase);
    clean.id = "clean";
    clean.price = quote(12);
    clean.sourcePreparation = { kind: "scour-v1", crafted: false, enchanted: false };
    node.alternatives.push(clean);
    node.choice = { mode: "automatic" };
    graph.prices[craftingNodeCostKey(node.id, scour)] = quote(3);
    expect(estimateSourcePurchase(engine, graph, node, purchase).expectedCost).toBe(26);
    const simulation = new CraftingGraphSimulation(catalog, graph, {
        estimateIterations: 1,
        workLimit: 100,
    });
    while (!simulation.done) simulation.runBatch();
    expect(simulation.result().acquisitions[node.id]?.selectedId).toBe("clean");
});

it.each([
    ["quality", (item: CraftingItem) => ({ ...item, quality: 20 })],
    ["wrong rarity", (item: CraftingItem) => ({ ...item, rarity: "rare" as const })],
    ["extra implicit", (item: CraftingItem) => ({ ...item, implicits: [] })],
    ["memory", (item: CraftingItem) => ({ ...item, memoryStrands: 1 })],
] as const)("refuses edited %s even with manual pricing", (_name, change) => {
    const { graph, purchase } = fixture();
    purchase.item = change(purchase.item);
    expect(() => validateCraftingGraph(catalog, graph)).toThrow();
});

it("accepts only guaranteed output requirements and rejects Scouring under retained r11", () => {
    const { graph, node, purchase } = fixture();
    node.output = itemQuerySchema.parse({
        game: "poe1",
        groups: [
            {
                type: "and",
                filters: [
                    { kind: "base", field: "baseId", values: [purchase.item.baseId] },
                    { kind: "rarity", values: ["Normal"] },
                    { kind: "influence", values: ["shaper"] },
                    { kind: "range", field: "ilvl", value: { min: 86, max: 86 } },
                    { kind: "range", field: "prefixes", value: { max: 0 } },
                    { kind: "range", field: "suffixes", value: { max: 0 } },
                ],
            },
        ],
    });
    expect(() => validateCraftingGraph(catalog, graph)).not.toThrow();
    expect(() => validateRulesetGraph(ruleset, graph)).not.toThrow();
    expect(() =>
        validateRulesetGraph(prior, {
            ...graph,
            ruleset: { ...graph.ruleset, revision: "r11", engine: "crafting-graph-11" },
        }),
    ).toThrow("engine 12");
    for (const field of ["quality", "sockets", "links", "memoryStrands"])
        expect(() =>
            validateCraftingGraph(catalog, {
                ...graph,
                nodes: [
                    {
                        ...node,
                        output: itemQuerySchema.parse({
                            game: "poe1",
                            groups: [
                                {
                                    type: "and",
                                    filters: [{ kind: "range", field, value: { min: 0 } }],
                                },
                            ],
                        }),
                    },
                ],
            }),
        ).toThrow("can guarantee only");
    for (const method of sourcePreparationMethods(engine, purchase.sourcePreparation!))
        expect(() =>
            validateRulesetGraph(
                {
                    ...ruleset,
                    availability: {
                        ...ruleset.availability,
                        disabled: [{ kind: method.kind, id: "id" in method ? method.id : "" }],
                    },
                },
                graph,
            ),
        ).toThrow("unavailable");
    expect(
        graphPurchaseSchema.safeParse({
            ...purchase,
            sourcePreparation: { ...purchase.sourcePreparation, fossils: { kind: "fossils" } },
        }).success,
    ).toBe(false);
});
