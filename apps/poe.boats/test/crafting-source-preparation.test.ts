import { itemQuerySchema } from "@poe-tools/item-query";
import { expect, it } from "vite-plus/test";
import { discoverGraphCraftingCosts } from "../app/lib/crafting-cost-inputs";
import { eldritchTier, seededRandom } from "../app/lib/crafting-engine";
import { CraftingGraphSimulation } from "../app/lib/crafting-graph-simulation";
import { validateCraftingGraph } from "../app/lib/crafting-graph-validation";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { projectFromPreset } from "../app/lib/crafting-presets";
import { validateRulesetGraph } from "../app/lib/crafting-rulesets";
import {
    estimateSourcePurchase,
    prepareSourcePurchase,
    sourcePreparationCosts,
    sourcePreparationMethods,
} from "../app/lib/crafting-source-preparation";
import type { CraftingItem } from "../app/schemas/crafting";
import type { GraphPurchase } from "../app/schemas/crafting-graph";
import { catalog, currency, engine } from "./crafting-fixtures";
import { quote, runGraphTrial } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const prior = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r10",
)!;
const ruleset = { ...prior, revision: "r14", engine: "crafting-graph-14" };
const fractureId = "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1";
const scour = currency("convert_to_normal").id;
const ichor = currency("add_great_tangle_implicit_1").id;
const ember = currency("add_cleansing_fire_implicit_2").id;
const alternatives = ["buy", "buy-crafted", "buy-enchanted", "buy-crafted-enchanted"];

function fixture(id = "buy-crafted-enchanted") {
    const graph = projectFromPreset(engine, ruleset, "sushi-mercenary-chest");
    const node = graph.nodes.find((node) => node.id === "fractured-base")!;
    if (node.kind !== "acquire") throw new Error("Missing source acquisition.");
    node.choice = { mode: "pinned", alternativeId: id };
    const purchase = node.alternatives.find((entry) => entry.id === id)!;
    if (purchase.kind !== "purchase" || purchase.sourcePreparation?.kind !== "fractured-fossil-v1")
        throw new Error("Missing source profile.");
    purchase.price = quote(11);
    for (const cost of discoverGraphCraftingCosts(engine, graph)) graph.prices[cost.id] = quote(2);
    return { graph, node, purchase, source: purchase.sourcePreparation };
}

function acquisitionGraph(id?: string) {
    const value = fixture(id);
    value.graph.entry = value.node.id;
    value.graph.outcomes = [{ ...value.graph.outcomes[0]!, query: value.node.output }];
    return value;
}

function actualSource(purchase: GraphPurchase) {
    let item = structuredClone(purchase.item);
    const extra = engine.pool(item).find((entry) => entry.mod.generation_type === "prefix")!;
    item = engine.addStartingMod(item, extra.id, seededRandom(1));
    if (purchase.sourcePreparation!.crafted) {
        const recipe = engine.catalog.crafting.bench.find(
            (entry) => entry.mod === "DexMasterItemGenerationCannotChangeSuffixes",
        )!;
        item = engine.apply(item, { kind: "bench", id: recipe.id }, seededRandom(2)).item;
    }
    if (purchase.sourcePreparation!.enchanted)
        item.enchantments = [
            engine.rollMod("HarvestAlternateArmourQualityLightningResistance", seededRandom(3)),
        ];
    item.implicits = [
        engine.rollMod("HasteAuraEffectEldritchImplicitUniquePresence3", seededRandom(4)),
        engine.rollMod("FrenzyChargePerSecondEldritchImplicitUniquePresence2", seededRandom(5)),
    ];
    return engine.validateItem(item);
}

it("keeps r10 purchases and steps unchanged while r11 uses four explicit source policies", () => {
    const old = projectFromPreset(engine, prior, "sushi-mercenary-chest");
    expect(old.nodes.find((node) => node.id === "fractured-base")).toMatchObject({
        choice: { mode: "pinned", alternativeId: "buy" },
        alternatives: [{ id: "buy", price: null }],
    });
    expect(old.nodes.find((node) => node.id === "eater")).toBeDefined();
    expect(old.nodes.find((node) => node.id === "exarch")).toBeDefined();
    const graph = projectFromPreset(
        engine,
        { ...ruleset, revision: "r11", engine: "crafting-graph-11" },
        "sushi-mercenary-chest",
    );
    const node = graph.nodes.find((node) => node.id === "fractured-base")!;
    if (node.kind !== "acquire") throw new Error("Missing source acquisition.");
    expect(node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(node.alternatives.map((entry) => entry.id)).toEqual(alternatives);
    expect(
        node.alternatives.every(
            (entry) =>
                entry.kind === "purchase" &&
                entry.price === null &&
                entry.item.mods.length === 1 &&
                entry.sourcePreparation,
        ),
    ).toBe(true);
    expect(graph.nodes.some((node) => node.id === "eater" || node.id === "exarch")).toBe(false);
    expect(graph.outcomes).toEqual(old.outcomes);
    expect(graph.prices).toEqual(old.prices);
    expect(graph.iterations).toBe(old.iterations);
    expect(graph.maxSteps).toBe(old.maxSteps);
});

it.each(
    alternatives,
)("prepares %s exactly like paid cleanup of an actual populated source", (id) => {
    const { purchase, source } = fixture(id);
    const methods = sourcePreparationMethods(engine, source);
    const random = seededRandom(12);
    let expected = actualSource(purchase);
    for (const method of methods) {
        expected = engine.apply(expected, method, random).item;
    }
    const result = prepareSourcePurchase(engine, purchase, seededRandom(12));
    expect(result.item).toEqual(expected);
    expect(result.item.mods.find((mod) => mod.id === fractureId)).toEqual(purchase.item.mods[0]);
    expect(result.item.enchantments ?? []).toEqual([]);
    expect(
        result.item.implicits.map((mod) => [
            engine.mod(mod.id).generation_type,
            eldritchTier(engine.mod(mod.id)),
        ]),
    ).toEqual([
        ["eater_of_worlds_implicit", 1],
        ["searing_exarch_implicit", 2],
    ]);
    expect(result.actions).toBe(3 + Number(source.crafted) + Number(source.enchanted));
    expect(
        result.costs
            .filter((cost) => cost.id === scour)
            .reduce((sum, cost) => sum + cost.amount, 0),
    ).toBe(Number(source.crafted) + 3 * Number(source.enchanted));
});

it("charges the purchase and every actual preparation cost and exposes them in the acquisition estimate and trace", () => {
    const { graph, node, purchase, source } = acquisitionGraph();
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({ success: true, purchases: 1, actions: 5, missingPrices: [] });
    expect(result.spending[scour]).toBe(4);
    expect(result.spending[ichor]).toBe(1);
    expect(result.spending[ember]).toBe(1);
    expect(result.trace[0]?.preparation).toEqual(sourcePreparationMethods(engine, source));
    const total =
        11 +
        sourcePreparationCosts(engine, source, purchase.item).reduce(
            (sum, cost) => sum + cost.amount * 2,
            0,
        );
    expect(result.cost).toBe(total);
    expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
        expectedCost: total,
        expectedActions: 5,
        missingPrices: [],
    });
    const simulation = new CraftingGraphSimulation(
        catalog,
        { ...graph, iterations: 1 },
        { estimateIterations: 1, workLimit: 100 },
    );
    while (!simulation.done) simulation.runBatch();
    expect(simulation.result()).toMatchObject({
        complete: true,
        meanCost: total,
        missingPrices: [],
    });
});

const pricedSource = fixture();
const required = [
    ...new Set(
        sourcePreparationCosts(engine, pricedSource.source, pricedSource.purchase.item).map(
            (cost) => cost.id,
        ),
    ),
];
it.each([
    "purchase",
    ...required,
])("keeps a missing %s price unknown despite a completed preparation", (missing) => {
    const { graph, node, purchase } = acquisitionGraph();
    if (missing === "purchase") purchase.price = null;
    else delete graph.prices[missing];
    const expected = missing === "purchase" ? `purchase:${node.id}:${purchase.id}` : missing;
    expect(estimateSourcePurchase(engine, graph, node, purchase)).toMatchObject({
        expectedCost: null,
        missingPrices: [expected],
    });
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({ success: true, cost: null, missingPrices: [expected] });
});

it("compares full preparation cost instead of treating the lowest unprepared ask as cheapest", () => {
    const { graph, node, purchase } = acquisitionGraph();
    const clean = node.alternatives[0]!;
    if (clean.kind !== "purchase") throw new Error("Missing clean source.");
    clean.price = quote(12);
    purchase.price = quote(11);
    node.choice = { mode: "automatic" };
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result.spending[`purchase:${node.id}:buy`]).toBe(1);
    expect(result.spending[scour]).toBeUndefined();
    const simulation = new CraftingGraphSimulation(
        catalog,
        { ...graph, iterations: 1 },
        { estimateIterations: 1, workLimit: 100 },
    );
    while (!simulation.done) simulation.runBatch();
    expect(simulation.result().acquisitions[node.id]?.selectedId).toBe("buy");
});

it("repeats preparation charges for each separately consumed purchase", () => {
    const { graph, node, source, purchase } = acquisitionGraph();
    graph.nodes.push({
        kind: "craft",
        id: "discard-source",
        name: "Discard and buy again",
        method: currency("reroll_mod_values"),
        inputs: [{ id: "a", name: "Item", source: node.id }],
        output: itemQuerySchema.parse({ game: "poe1" }),
        branches: [],
        ordering: "manual",
        fallback: { kind: "discard" },
    });
    graph.entry = "discard-source";
    graph.maxSteps = 4;
    graph.outcomes[0]!.query = itemQuerySchema.parse({ game: "poe1" });
    graph.prices[currency("reroll_mod_values").id] = quote(2);
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({
        status: "truncated",
        purchases: 2,
        actions: 12,
        missingPrices: [],
    });
    expect(result.spending[scour]).toBe(8);
    for (const cost of sourcePreparationCosts(engine, source, purchase.item).filter(
        (cost) => cost.id !== scour,
    ))
        expect(result.spending[cost.id]).toBe(cost.amount * 2);
});

it("uses the best first Allflame copy and skips a duplicated fossil roll when it already meets the suffix target", () => {
    const { graph, node, purchase } = fixture();
    const roll = graph.nodes.find((node) => node.id === "fossils")!;
    if (roll.kind !== "craft") throw new Error("Missing fossil step.");
    const expected = prepareSourcePurchase(engine, purchase, seededRandom(42), [roll.output]);
    const result = runGraphTrial(graph, seededRandom(42));
    expect(result).toMatchObject({ success: true, purchases: 1, missingPrices: [] });
    expect(result.nodeItems?.[node.id]).toEqual(expected.item);
    const matches = createCraftingItemQuery(engine).matches(expected.item, roll.output) === "match";
    expect(matches).toBe(true);
    expect(result.visits.fossils?.skipped).toBe(1);
    expect(result.spending[ichor]).toBe(1);
    expect(result.spending[ember]).toBe(1);
    if (purchase.sourcePreparation?.kind !== "fractured-fossil-v1")
        throw new Error("Missing fossil source.");
    expect(result.spending[purchase.sourcePreparation.fossils.resonator]).toBe(1);
});

it.each([
    [
        "extra affix",
        (item: CraftingItem) =>
            engine.addStartingMod(
                item,
                engine.pool(item).find((entry) => entry.mod.generation_type === "prefix")!.id,
                seededRandom(1),
            ),
    ],
    [
        "enchantment",
        (item: CraftingItem) => ({
            ...item,
            enchantments: [
                engine.rollMod("HarvestAlternateArmourQualityLightningResistance", seededRandom(1)),
            ],
        }),
    ],
    [
        "missing fracture",
        (item: CraftingItem) => ({
            ...item,
            mods: item.mods.map((mod) => ({ ...mod, fractured: false })),
        }),
    ],
] as const)("rejects edited template %s even with manual prices", (_name, change) => {
    const { graph, purchase } = fixture();
    purchase.item = change(purchase.item);
    expect(() => validateCraftingGraph(catalog, graph)).toThrow(/source|fracture/i);
});

it("refuses random-output guarantees and unsupported retained or disabled preparation methods", () => {
    const { graph, node, purchase } = fixture();
    node.output = itemQuerySchema.parse({
        game: "poe1",
        groups: [
            { type: "and", filters: [{ kind: "range", field: "prefixes", value: { max: 0 } }] },
        ],
    });
    expect(() => validateCraftingGraph(catalog, graph)).toThrow("can guarantee only");
    node.output = itemQuerySchema.parse({
        game: "poe1",
        groups: [{ type: "and", filters: [{ kind: "range", field: "ilvl", value: { min: 86 } }] }],
    });
    expect(() => validateCraftingGraph(catalog, graph)).not.toThrow();
    expect(() =>
        validateRulesetGraph(prior, {
            ...graph,
            ruleset: projectFromPreset(engine, prior, "sushi-mercenary-chest").ruleset,
        }),
    ).toThrow("engine 11");
    for (const method of sourcePreparationMethods(engine, purchase.sourcePreparation!)) {
        const availability = {
            ...ruleset.availability,
            ...(method.kind === "fossils"
                ? { allflame: false }
                : { disabled: [{ kind: method.kind, id: "id" in method ? method.id : "" }] }),
        };
        expect(() => validateRulesetGraph({ ...ruleset, availability }, graph)).toThrow(
            "unavailable",
        );
    }
});

it("rejects a wrong resonator and persistent fossil effects before calculating", () => {
    const { graph, source } = fixture();
    source.fossils.resonator = ichor;
    expect(() => validateCraftingGraph(catalog, graph)).toThrow(
        /Allflame|resonator|reroll fossils/i,
    );
    const corrupt = engine.catalog.crafting.fossils.find((fossil) =>
        fossil.effects.includes("CorruptedImplicit"),
    )!;
    source.fossils = {
        kind: "fossils",
        ids: [corrupt.id],
        resonator: "Metadata/Items/Delve/DelveStackableSocketableCurrencyReroll1",
        logic: "additive",
    };
    expect(() => validateCraftingGraph(catalog, graph)).toThrow("persistent implicit or fracture");
});
