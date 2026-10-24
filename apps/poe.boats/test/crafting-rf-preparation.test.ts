import { readFileSync } from "node:fs";
import { normalizeApiItem } from "@poe-tools/item-query";
import { cohortPriceCoverage, compileMarketCohorts } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { discoverGraphCraftingCosts } from "../app/lib/crafting-cost-inputs";
import { type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { CraftingGraphTrial } from "../app/lib/crafting-graph-trial";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { projectFromPreset } from "../app/lib/crafting-presets";
import { purchaseSourceProfile } from "../app/lib/crafting-source-preparation";
import { rolledModText } from "../app/lib/crafting-text";
import type { CraftingItem } from "../app/schemas/crafting";
import type { CraftingGraph } from "../app/schemas/crafting-graph";
import { craftingPresetCohorts } from "../scripts/crafting-preset-cohorts";
import { catalog, currency, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const prior = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r13",
)!;
const ruleset = { ...prior, revision: "r14", engine: "crafting-graph-14" };
const sourceId = "suffixes-make-base";
const transmute = "Metadata/Items/Currency/CurrencyUpgradeToMagic";
const regal = "Metadata/Items/Currency/CurrencyUpgradeMagicToRare";
const hunter = "Metadata/Items/AtlasExiles/AddModToRareHunter";
const primal = "Metadata/Items/Currency/HarvestSeedBlue";
const divine = "Metadata/Items/Currency/CurrencyModValues";
const scour = "Metadata/Items/Currency/CurrencyConvertToNormal";
const life = "IncreasedLife1";
const armour = "LocalIncreasedPhysicalDamageReductionRating1";
const hybrid = "LocalIncreasedPhysicalDamageReductionRatingPercentAndStunRecovery1";
const burning = "IncreasedBurningDamageSupportedUber3";
const horror = "Metadata/Items/Currency/CurrencyEssenceHorror1";

function purchase(graph: CraftingGraph, id: string) {
    const node = graph.nodes.find((node) => node.id === id)!;
    if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
        throw new Error("Expected purchase.");
    return { node, alternative: node.alternatives[0] };
}

function scriptedRandom(draws: (string | number | null)[]): CraftingRandom {
    return {
        integer: (min) => min,
        pick: (choices) => {
            if (!draws.length) throw new Error("Unexpected extra random decision.");
            const expected = draws.shift();
            const choice = choices.find(
                ({ value, weight }) => weight > 0 && (expected === null || value === expected),
            );
            if (!choice) throw new Error(`Requested draw is not eligible: ${expected}`);
            return choice.value;
        },
    };
}

function identities(item: CraftingItem) {
    return {
        ...item,
        mods: item.mods
            .map(({ values: _values, ...mod }) => mod)
            .sort((a, b) => a.id.localeCompare(b.id)),
    };
}

function preparation(missing?: string) {
    const graph = projectFromPreset(engine, ruleset, "sushi-rf-helmet");
    const { node } = purchase(graph, "suffixes");
    node.choice = { mode: "pinned", alternativeId: "make-suffixes" };
    if (missing !== "base") purchase(graph, sourceId).alternative.price = quote(11);
    for (const cost of discoverGraphCraftingCosts(engine, graph))
        if (cost.id !== missing) graph.prices[cost.id] = quote(2);
    return graph;
}

function runPreparation(missing?: string) {
    const graph = preparation(missing);
    const ordinary = [4, life, armour, "ColdResist1", "FireResist1"];
    const draws: (string | number | null)[] = [
        2,
        life,
        "ColdResist1",
        armour,
        null,
        3,
        ...ordinary,
        1,
        ...ordinary,
        4,
        burning,
        life,
        "ColdResist1",
        5,
        burning,
        life,
        armour,
        hybrid,
        4,
        burning,
        life,
        armour,
    ];
    const trial = new CraftingGraphTrial(engine, graph, scriptedRandom(draws), {
        entry: "suffixes",
        classify: false,
        trace: true,
    });
    while (!trial.done) trial.advance();
    const result = trial.result();
    expect(result.error).toBeNull();
    expect(draws).toEqual([]);
    expect(result.status).toBe("returned");
    expect(engine.validateItem(result.item!)).toEqual(result.item);
    expect(identities(result.item!)).toEqual(
        identities(purchase(graph, "suffixes").alternative.item),
    );
    expect(
        createCraftingItemQuery(engine).matches(
            result.item!,
            graph.nodes.find((node) => node.id === "suffixes-make-scour")!.output,
        ),
    ).toBe("match");
    return { graph, result };
}

it("preserves the RF helmet purchase, target and r13 recipe", () => {
    const original = projectFromPreset(engine, prior, "sushi-rf-helmet");
    const graph = projectFromPreset(engine, ruleset, "sushi-rf-helmet");
    const { node, alternative } = purchase(graph, "suffixes");
    expect(node.choice).toEqual({ mode: "pinned", alternativeId: "buy" });
    expect(alternative).toEqual(purchase(original, "suffixes").alternative);
    expect(node.alternatives[1]).toMatchObject({
        kind: "production",
        id: "make-suffixes",
        nodeId: "suffixes-make-scour",
    });
    expect(
        graph.nodes
            .filter((entry) => !entry.id.startsWith("suffixes-make-"))
            .map((entry) =>
                entry.kind === "acquire"
                    ? { ...entry, alternatives: entry.alternatives.slice(0, 1) }
                    : entry,
            ),
    ).toEqual(original.nodes);
    expect(graph.entry).toBe(original.entry);
    expect(graph.outcomes).toEqual(original.outcomes);
    expect(graph.prices).toEqual(original.prices);
    expect(graph.iterations).toBe(original.iterations);
    expect(graph.maxSteps).toBe(original.maxSteps);
    const source = purchase(graph, sourceId);
    expect(source.alternative.item).toEqual(engine.createItem(alternative.item.baseId, 86));
    expect(source.node.alternatives).toHaveLength(4);
    expect(source.node.choice).toEqual({ mode: "pinned", alternativeId: "buy-scour" });
    expect(
        source.node.alternatives.every(
            (entry) =>
                entry.kind === "purchase" &&
                entry.price === null &&
                entry.sourcePreparation?.kind === "scour-v1",
        ),
    ).toBe(true);
});

it("charges influence and Horror misses while reusing one base", () => {
    const { result } = runPreparation();
    expect(result).toMatchObject({
        actions: 11,
        purchases: 1,
        cost: 4031,
        missingPrices: [],
        spending: {
            [`purchase:${sourceId}:buy-scour`]: 1,
            [transmute]: 1,
            [regal]: 1,
            [hunter]: 1,
            [primal]: 2000,
            [horror]: 3,
            [divine]: 2,
            [scour]: 2,
        },
    });
    expect(result.visits["suffixes-make-influence"]!.recovered).toBe(1);
    expect(result.visits["suffixes-make-roll"]!.recovered).toBe(2);
    expect(result.nodeItems!["suffixes-make-hunter"]!.mods).toHaveLength(4);
});

it("requires Elder influence and level 20 Burning Damage before locking", () => {
    const graph = preparation();
    const item = purchase(graph, "suffixes").alternative.item;
    const ready = graph.nodes.find((node) => node.id === "suffixes-make-roll")!.output;
    const query = createCraftingItemQuery(engine);
    expect(query.matches(item, ready)).toBe("match");
    expect(query.matches({ ...item, influences: [3] }, ready)).toBe("no-match");
    const lower = {
        ...item,
        mods: item.mods.map((mod) =>
            mod.id === burning
                ? engine.rollMod("IncreasedBurningDamageSupportedUber2", seededRandom(1))
                : mod,
        ),
    };
    expect(query.matches(engine.validateItem(lower), ready)).toBe("no-match");
});

it("keeps the RF shield purchase and route unchanged", () => {
    const previous = projectFromPreset(engine, prior, "sushi-rf-totem-shield");
    const current = projectFromPreset(engine, ruleset, "sushi-rf-totem-shield");
    expect(current.nodes).toEqual(previous.nodes);
    expect(current.outcomes).toEqual(previous.outcomes);
    expect(current.prices).toEqual(previous.prices);
});

it("excludes an Eldritch Normal Royal that cannot take Hunter influence from the source quote", () => {
    const graph = preparation();
    const { node, alternative } = purchase(graph, sourceId);
    const queries = createCraftingItemQuery(engine);
    const cohort = craftingPresetCohorts(engine, ruleset).find(
        (candidate) =>
            cohortPriceCoverage(
                candidate,
                queries.record(alternative.item),
                node.output,
                undefined,
                purchaseSourceProfile(alternative),
            ).covered,
    )!;
    const classifier = compileMarketCohorts(
        JSON.parse(readFileSync("../../packages/poe-market/data/cohorts-poe1.json", "utf8")),
    );
    const eldritch = engine.apply(
        alternative.item,
        currency("add_great_tangle_implicit_1"),
        seededRandom(1),
    ).item;
    const raw = {
        ...queries.record(eldritch).item,
        explicitMods: [],
        implicitMods: eldritch.implicits.flatMap((mod) =>
            rolledModText(catalog, mod, eldritch)!.split("\n"),
        ),
        extended: engine.counts(eldritch),
        tangled: true,
    };
    const magic = engine.apply(eldritch, currency("transmute_to_magic"), seededRandom(2)).item;
    const rare = engine.apply(magic, currency("upgrade_magic_to_rare"), seededRandom(2)).item;
    expect(() => engine.apply(rare, { kind: "currency", id: hunter }, seededRandom(2))).toThrow(
        "special implicits",
    );
    expect(classifier.classify(normalizeApiItem("poe1", "stash", raw)).matches).not.toContain(
        cohort.id,
    );
    const safe = {
        ...queries.record(alternative.item).item,
        rarity: "Rare",
        implicitMods: [],
        explicitMods: ["An unresolved disposable explicit modifier"],
    };
    expect(classifier.classify(normalizeApiItem("poe1", "stash", safe)).matches).toContain(
        cohort.id,
    );
    expect(
        classifier.classify(normalizeApiItem("poe1", "stash", { ...safe, ...raw, rarity: "Rare" }))
            .matches,
    ).not.toContain(cohort.id);
});

it.each([
    "base",
    transmute,
    regal,
    hunter,
    primal,
    horror,
    divine,
    scour,
])("remains unpriced without %s", (missing) => {
    const { result } = runPreparation(missing);
    expect(result.cost).toBeNull();
    expect(result.missingPrices).toEqual([
        missing === "base" ? `purchase:${sourceId}:buy-scour` : missing,
    ]);
});
