import { readFileSync } from "node:fs";
import { normalizeApiItem } from "@poe-tools/item-query";
import {
    cohortPriceCoverage,
    compileMarketCohorts,
    marketCohortManifestSchema,
} from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { bindCohortPurchasePrice } from "../app/lib/crafting-market";
import { projectFromPreset } from "../app/lib/crafting-presets";
import {
    estimateSourcePurchase,
    purchaseSourceProfile,
} from "../app/lib/crafting-source-preparation";
import { rolledModText } from "../app/lib/crafting-text";
import { craftingPresetCohorts } from "../scripts/crafting-preset-cohorts";
import { catalog, currency, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import { historyIndex } from "./crafting-history-fixtures";
import { marketCandidate } from "./crafting-market-fixtures";

const ruleset = {
    ...historyIndex.revisions.find((entry) => entry.game === "poe1" && entry.revision === "r15")!,
    engine: "crafting-graph-16",
    revision: "r16",
};
const manifest = marketCohortManifestSchema.parse(
    JSON.parse(readFileSync("../../packages/poe-market/data/cohorts-poe1.json", "utf8")),
);
const classifier = compileMarketCohorts(manifest);
const generated = craftingPresetCohorts(engine, ruleset);
const queries = createCraftingItemQuery(engine);
const scour = currency("convert_to_normal").id;
const cleanupAlternatives = [
    "buy-scour",
    "buy-scour-crafted",
    "buy-scour-enchanted",
    "buy-scour-crafted-enchanted",
] as const;
const sources = [
    {
        presetId: "life-block-shield",
        nodeId: "shield-make-heat-influence-base",
        baseId: "Metadata/Items/Armours/Shields/ShieldStrE3",
        nativeIds: ["ChanceToInflictScorchOnEnemyOnBlockImplicitE1"],
        nativeTexts: ["Scorch Enemies when you Block their Damage"],
        alternatives: ["buy", ...cleanupAlternatives],
    },
    {
        presetId: "energy-shield-chest",
        nodeId: "donor-0-make-base",
        baseId: "Metadata/Items/Armours/BodyArmours/BodyInt17",
        nativeIds: [],
        nativeTexts: [],
        alternatives: cleanupAlternatives,
    },
] as const;
type Source = (typeof sources)[number];
const cases = sources.flatMap((source) =>
    source.alternatives.map((alternativeId) => ({
        source,
        alternativeId,
        label: `${source.presetId}/${alternativeId}`,
    })),
);

function fixture(source: Source, alternativeId: string) {
    const graph = projectFromPreset(engine, ruleset, source.presetId);
    graph.league = "Standard";
    const node = graph.nodes.find((entry) => entry.id === source.nodeId);
    if (node?.kind !== "acquire") throw new Error("Missing r16 source acquisition.");
    const purchase = node.alternatives.find((entry) => entry.id === alternativeId);
    if (purchase?.kind !== "purchase") throw new Error("Missing r16 source purchase.");
    const profile = purchaseSourceProfile(purchase);
    if (!profile) throw new Error("Missing r16 source profile.");
    const cleanup = profile.kind === "scour-v1" ? profile : undefined;
    const record = queries.record(purchase.item);
    const definitions = generated.filter(
        (cohort) => cohortPriceCoverage(cohort, record, node.output, undefined, profile).covered,
    );
    expect(definitions).toHaveLength(1);
    const definition = definitions[0]!;
    expect(manifest.cohorts.find((cohort) => cohort.id === definition.id)).toEqual(definition);
    const baseType = engine.base(purchase.item).name;
    const raw = {
        baseType,
        typeLine: baseType,
        ilvl: purchase.item.level,
        rarity: cleanup ? "Rare" : "Normal",
        frameType: cleanup ? 2 : 0,
        identified: true,
        corrupted: false,
        duplicated: false,
        fractured: false,
        synthesised: false,
        influences: {},
        implicitMods: purchase.item.implicits.flatMap((mod) =>
            rolledModText(catalog, mod, purchase.item)!.split("\n"),
        ),
        explicitMods: cleanup ? ["Unresolved disposable affix"] : [],
        craftedMods: cleanup?.crafted ? ["Prefixes Cannot Be Changed"] : [],
        enchantMods: cleanup?.enchanted ? ["Quality does not increase Defences"] : [],
    };
    const candidate = structuredClone(marketCandidate);
    candidate.definition = {
        ...definition,
        revision: manifest.revision,
        catalogHash: manifest.catalogHash,
    };
    candidate.latest.revision = manifest.revision;
    candidate.latest.cohortId = definition.id;
    candidate.sourcePreparation = profile;
    return { graph, node, purchase, profile, definition, raw, candidate };
}

it.each(cases)("captures and binds the exact published source for $label", ({
    source,
    alternativeId,
}) => {
    const { graph, node, purchase, profile, definition, raw, candidate } = fixture(
        source,
        alternativeId,
    );
    expect(manifest.sourcePreparationModel?.format).toBe(6);
    expect(purchase.item).toMatchObject({
        baseId: source.baseId,
        level: 86,
        quality: 0,
        rarity: "normal",
        influences: [],
        mods: [],
    });
    expect(purchase.item.implicits.map((mod) => mod.id)).toEqual(source.nativeIds);
    expect(raw.implicitMods).toEqual(source.nativeTexts);
    for (const rarity of profile.kind === "scour-v1" ? ["Magic", "Rare"] : ["Normal"]) {
        const item = {
            ...raw,
            rarity,
            frameType: rarity === "Magic" ? 1 : rarity === "Rare" ? 2 : 0,
        };
        const beforeItem = structuredClone(item);
        const record = normalizeApiItem("poe1", "stash", item);
        const beforeRecord = structuredClone(record);
        const result = classifier.classify(record);
        expect(result.matches).toContain(definition.id);
        expect(result.unknown).not.toContain(definition.id);
        expect(record).toEqual(beforeRecord);
        expect(item).toEqual(beforeItem);
    }
    const beforeGraph = structuredClone(graph);
    const bound = bindCohortPurchasePrice(graph, engine, node.id, purchase.id, candidate);
    expect(graph).toEqual(beforeGraph);
    const boundNode = bound.nodes.find((entry) => entry.id === node.id);
    const boundPurchase =
        boundNode?.kind === "acquire"
            ? boundNode.alternatives.find((entry) => entry.id === purchase.id)
            : undefined;
    if (boundNode?.kind !== "acquire" || boundPurchase?.kind !== "purchase")
        throw new Error("Missing bound source purchase.");
    expect(boundPurchase.price).toMatchObject({ amount: 20, currency: "chaos", source: "market" });
    bound.prices = {};
    if (profile.kind === "influence-ready-v1") {
        expect(estimateSourcePurchase(engine, bound, boundNode, boundPurchase)).toMatchObject({
            expectedCost: 20,
            expectedActions: 0,
            missingPrices: [],
        });
    } else {
        if (profile.kind !== "scour-v1") throw new Error("Expected paid Scouring profile.");
        expect(estimateSourcePurchase(engine, bound, boundNode, boundPurchase)).toMatchObject({
            expectedCost: null,
            missingPrices: [scour],
        });
        bound.prices[scour] = quote(2);
        expect(estimateSourcePurchase(engine, bound, boundNode, boundPurchase)).toMatchObject({
            expectedCost: 20 + 2 * (1 + Number(profile.crafted) + 3 * Number(profile.enchanted)),
            expectedActions: 1 + Number(profile.crafted) + Number(profile.enchanted),
            missingPrices: [],
        });
    }
});

it.each(cases)("refuses incompatible captured state and mismatched prices for $label", ({
    source,
    alternativeId,
}) => {
    const { graph, node, purchase, profile, definition, raw, candidate } = fixture(
        source,
        alternativeId,
    );
    for (const change of [
        { influences: { shaper: true } },
        { influences: { hunter: true } },
        { implicitMods: ["Unknown persistent implicit"] },
        { implicitMods: [...raw.implicitMods, "Extra implicit"] },
        ...(source.nativeIds.length ? [{ implicitMods: [] }] : []),
        { fractured: true, fracturedMods: ["+70 to maximum Life"] },
        { corrupted: true },
        { duplicated: true },
        { synthesised: true },
        { searing: true },
        { tangled: true },
        { memoryItem: true },
        { unknownPersistentFlag: true },
        { intangibility: 84 },
        { properties: [{ name: "Intangibility", type: 110, values: [["84%", 0]] }] },
        { ilvl: raw.ilvl - 1 },
        { ilvl: raw.ilvl + 1 },
        { identified: false },
        { craftedMods: raw.craftedMods.length ? [] : ["Prefixes Cannot Be Changed"] },
        { enchantMods: raw.enchantMods.length ? [] : ["Unremoved enchantment"] },
    ]) {
        const result = classifier.classify(
            normalizeApiItem("poe1", "stash", { ...raw, ...change }),
        );
        expect(result.matches, JSON.stringify(change)).not.toContain(definition.id);
    }
    const unguarded = structuredClone(candidate);
    delete unguarded.definition.query.sourcePreparation;
    expect(() => bindCohortPurchasePrice(graph, engine, node.id, purchase.id, unguarded)).toThrow();
    const mismatched = structuredClone(candidate);
    mismatched.sourcePreparation =
        profile.kind === "scour-v1"
            ? { ...profile, crafted: !profile.crafted }
            : { kind: "scour-v1", crafted: false, enchanted: false };
    expect(() => bindCohortPurchasePrice(graph, engine, node.id, purchase.id, mismatched)).toThrow(
        "different source preparation",
    );
});

it("requires source model 6 for the clean Heat-attuned source", () => {
    const { raw, definition } = fixture(sources[0], "buy");
    if (!manifest.sourcePreparationModel) throw new Error("Missing source model.");
    const previous = compileMarketCohorts({
        ...manifest,
        cohorts: [definition],
        sourcePreparationModel: { ...manifest.sourcePreparationModel, format: 5 },
    });
    expect(previous.classify(normalizeApiItem("poe1", "stash", raw)).matches).toEqual([]);
    expect(classifier.classify(normalizeApiItem("poe1", "stash", raw)).matches).toContain(
        definition.id,
    );
});

it("requires the exact clean Heat-attuned canonical template for coverage", () => {
    const { purchase, profile, definition, node } = fixture(sources[0], "buy");
    const record = queries.record(purchase.item);
    const changes: Array<(input: typeof record) => void> = [
        (input) => {
            input.facts.baseId = "Metadata/Items/Armours/Shields/ShieldStr17";
        },
        (input) => {
            input.item.baseType = "Pinnacle Tower Shield";
        },
        (input) => {
            input.facts.modifiers = [];
        },
        (input) => {
            input.facts.modifiers[0]!.id = "IncreasedLifeImplicitShield2";
        },
        (input) => {
            input.facts.modifiers.push({ id: "extra-implicit", side: "implicit" });
        },
        (input) => {
            input.facts.modifiers[0]!.fractured = true;
        },
        (input) => {
            input.facts.quality = 20;
        },
        (input) => {
            input.item.influences = { shaper: true };
        },
        (input) => {
            input.item.implicitMods = [...sources[0].nativeTexts];
        },
        (input) => {
            input.item.properties = [{ name: "Quality", values: [["20%", 0]] }];
        },
    ];
    for (const change of changes) {
        const incompatible = structuredClone(record);
        change(incompatible);
        expect(
            cohortPriceCoverage(definition, incompatible, node.output, undefined, profile).covered,
        ).toBe(false);
    }
});
