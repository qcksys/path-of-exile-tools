import { expect, it } from "vite-plus/test";
import { discoverCraftingCosts } from "../app/lib/crafting-cost-inputs";
import { eldritchTier, seededRandom } from "../app/lib/crafting-engine";
import { projectFromPreset } from "../app/lib/crafting-presets";
import type { CraftingItem } from "../app/schemas/crafting";
import { currency, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r10",
)!;
const critical = "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1";
const ichor = currency("add_great_tangle_implicit_1");
const ember = currency("add_cleansing_fire_implicit_2");
const graph = () => projectFromPreset(engine, ruleset, "sushi-mercenary-chest");

function startingPurchase(input: ReturnType<typeof graph>) {
    const node = input.nodes.find((node) => node.id === "fractured-base")!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Missing mercenary purchase.");
    return node.alternatives[0];
}

function observedImplicits(item: CraftingItem) {
    return engine.validateItem({
        ...item,
        enchantments: [
            engine.rollMod("HarvestAlternateArmourQualityLightningResistance", seededRandom(1)),
        ],
        implicits: [
            {
                ...engine.rollMod(
                    "HasteAuraEffectEldritchImplicitUniquePresence3",
                    seededRandom(1),
                ),
                values: [39, 1],
            },
            engine.rollMod("FrenzyChargePerSecondEldritchImplicitUniquePresence2", seededRandom(1)),
        ],
    });
}

it("pays Lesser Ichor before Greater Ember without changing the exact starting purchase", () => {
    const input = graph();
    const source = startingPurchase(input);
    expect(source.price).toBeNull();
    expect(engine.counts(source.item)).toEqual({ prefixes: 0, suffixes: 1 });
    expect(source.item.mods).toEqual([expect.objectContaining({ id: critical, fractured: true })]);
    expect(input.nodes.find((node) => node.id === "eater")).toMatchObject({
        method: ichor,
        inputs: [{ source: "fossils" }],
    });
    expect(input.nodes.find((node) => node.id === "exarch")).toMatchObject({
        method: ember,
        inputs: [{ source: "eater" }],
    });
    expect(engine.costs(ichor)).toEqual([expect.objectContaining({ id: ichor.id, amount: 1 })]);
    expect(engine.costs(ember)).toEqual([expect.objectContaining({ id: ember.id, amount: 1 })]);
});

it.each([
    "clean",
    "observed",
    "perfect",
] as const)("normalizes %s implicits before Eldritch prefix crafting while preserving all suffixes", (state) => {
    let item = startingPurchase(graph()).item;
    if (state !== "clean") item = observedImplicits(item);
    if (state === "perfect") {
        item = engine.validateItem({
            ...item,
            implicits: [
                engine.rollMod("HasteAuraEffectEldritchImplicitUniquePresence6", seededRandom(1)),
                engine.rollMod(
                    "FrenzyChargePerSecondEldritchImplicitUniquePresence6",
                    seededRandom(1),
                ),
            ],
        });
    }
    item = engine.addStartingMod(item, "DelveAbyssJewelSocket1", seededRandom(1));
    item = engine.addStartingMod(item, "OnslaughtWhenHitNewEssence1", seededRandom(1), "essence");
    const normalized = engine.apply(
        engine.apply(item, ichor, seededRandom(2)).item,
        ember,
        seededRandom(3),
    ).item;
    expect(normalized.mods).toEqual(item.mods);
    expect(normalized.enchantments).toEqual(item.enchantments);
    expect(
        normalized.implicits.map((mod) => [
            engine.mod(mod.id).generation_type,
            eldritchTier(engine.mod(mod.id)),
        ]),
    ).toEqual([
        ["eater_of_worlds_implicit", 1],
        ["searing_exarch_implicit", 2],
    ]);
    const rerolled = engine.apply(
        normalized,
        currency("reroll_rare_eldritch"),
        seededRandom(4),
    ).item;
    expect(rerolled.mods.filter((mod) => engine.mod(mod.id).generation_type === "suffix")).toEqual(
        item.mods,
    );
    expect(rerolled.enchantments).toEqual(item.enchantments);
});

function pricedGraph() {
    const input = graph();
    const source = startingPurchase(input);
    source.item = observedImplicits(source.item);
    source.price = quote(11);
    for (const cost of discoverCraftingCosts(
        engine,
        input.nodes.flatMap((node) => (node.kind === "craft" ? [node.method] : [])),
    ))
        input.prices[cost.id] = quote(2);
    return input;
}

it.each([
    null,
    ichor.id,
    ember.id,
])("accounts for normalization and leaves a missing %s price unknown", async (missing) => {
    const input = pricedGraph();
    if (missing) delete input.prices[missing];
    const retained = await retainedRevision(ruleset);
    const simulation = retained.runtime.createSimulation(
        retained.catalog,
        { ...input, iterations: 1, seed: 42 },
        { estimateIterations: 1, workLimit: 10000 },
    );
    while (!simulation.done) simulation.runBatch();
    const result = simulation.result().samples[0]!;
    expect(result.success).toBe(true);
    expect(result.spending[ichor.id]).toBe(1);
    expect(result.spending[ember.id]).toBe(1);
    expect(result.purchases).toBe(1);
    expect(result.visits.prefixes!.recovered).toBeGreaterThan(0);
    expect(result.item!.mods.find((mod) => mod.id === critical)?.fractured).toBe(true);
    expect(result.item!.enchantments).toEqual(startingPurchase(input).item.enchantments);
    expect(result.missingPrices).toEqual(missing ? [missing] : []);
    expect(result.cost).toBe(
        missing
            ? null
            : 11 +
                  2 *
                      Object.entries(result.spending)
                          .filter(([id]) => !id.startsWith("purchase:"))
                          .reduce((sum, [, quantity]) => sum + quantity, 0),
    );
});

it("runs the normalized recipe with the unchanged retained r10 engine", async () => {
    const retained = await retainedRevision(ruleset);
    const input = pricedGraph();
    input.iterations = 1;
    input.seed = 42;
    const simulation = retained.runtime.createSimulation(retained.catalog, input, {
        estimateIterations: 1,
        workLimit: 10000,
    });
    while (!simulation.done) simulation.runBatch();
    expect(simulation.result()).toMatchObject({
        complete: true,
        trials: 1,
        probability: 1,
        errors: {},
        missingPrices: [],
    });
});
