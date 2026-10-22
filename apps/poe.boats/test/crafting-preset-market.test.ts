import { readFileSync } from "node:fs";
import { normalizeApiItem } from "@poe-tools/item-query";
import {
    cohortPriceCoverage,
    compileMarketCohorts,
    marketCohortManifestSchema,
} from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { compileCraftingCapture } from "../../../packages/poe-stash-ingest/src/ps/crafting-capture";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { bindCohortPurchasePrice, craftingMarketItemIssue } from "../app/lib/crafting-market";
import { craftingPresets, projectFromPreset } from "../app/lib/crafting-presets";
import { rolledModText } from "../app/lib/crafting-text";
import type { CraftingItem } from "../app/schemas/crafting";
import { craftingPresetCohorts } from "../scripts/crafting-preset-cohorts";
import { marketModifierTextModel } from "../scripts/market-modifier-text";
import { catalog, engine } from "./crafting-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r8",
)!;
const cohorts = craftingPresetCohorts(engine, ruleset);
const manifest = marketCohortManifestSchema.parse(
    JSON.parse(readFileSync("../../packages/poe-market/data/cohorts-poe1.json", "utf8")),
);
const classifier = compileMarketCohorts(manifest);
const capture = compileCraftingCapture(
    manifest,
    JSON.parse(readFileSync("../../packages/poe-market/data/capture-poe1.json", "utf8")),
);
const queries = createCraftingItemQuery(engine);
const purchases = craftingPresets.flatMap((preset) => {
    const graph = projectFromPreset(engine, ruleset, preset.id);
    return graph.nodes.flatMap((node) =>
        node.kind === "acquire"
            ? node.alternatives.flatMap((alternative) =>
                  alternative.kind === "purchase"
                      ? [{ preset: preset.id, graph, node, item: alternative.item }]
                      : [],
              )
            : [],
    );
});

function rawItem(item: CraftingItem, metadata = false) {
    const record = queries.record(item);
    return {
        ...record.item,
        sockets: record.item.sockets?.map(({ group }) => ({ group })),
        name: "",
        typeLine: record.item.baseType,
        verified: true,
        identified: true,
        w: 2,
        h: 2,
        icon: "https://example.invalid/item",
        explicitMods: item.mods.flatMap((rolled) => {
            const mod = engine.mod(rolled.id);
            return rolledModText(catalog, rolled, item)!
                .split("\n")
                .map((description) => ({
                    description,
                    ...(metadata
                        ? {
                              mods: [
                                  {
                                      name: mod.name,
                                      tier: `${mod.generation_type === "prefix" ? "P" : "S"}1`,
                                      level: mod.required_level,
                                  },
                              ],
                          }
                        : {}),
                }));
        }),
        implicitMods: item.implicits.flatMap((mod) =>
            rolledModText(catalog, mod, item)!.split("\n"),
        ),
        extended: engine.counts(item),
    };
}

it("has exact equipment definitions for every preset purchase including canonical base variants", () => {
    expect(purchases).toHaveLength(27);
    expect(cohorts).toHaveLength(26);
    const definitions = new Map(manifest.cohorts.map((cohort) => [cohort.id, cohort]));
    for (const cohort of cohorts) expect(definitions.get(cohort.id)).toEqual(cohort);
    for (const { preset, graph: project, node, item } of purchases) {
        const record = queries.record(item);
        const matching = cohorts.filter(
            (cohort) => cohortPriceCoverage(cohort, record, node.output).covered,
        );
        expect(matching.length, `${preset}/${node.id}`).toBeGreaterThan(0);
        expect(capture(rawItem(item)), `${preset}/${node.id} capture`).toBe(true);
        const graph = { ...project, league: "Standard" };
        const cohort = matching[0]!;
        const bind = () =>
            bindCohortPurchasePrice(graph, engine, node.id, "buy", {
                definition: {
                    ...cohort,
                    revision: manifest.revision,
                    catalogHash: manifest.catalogHash,
                },
                latest: {
                    realm: "pc",
                    league: "Standard",
                    hour: 1_790_899_200,
                    revision: manifest.revision,
                    cohortId: cohort.id,
                    listingCount: 10,
                    uniqueSellers: 10,
                    unknownCount: 0,
                    prices: {
                        chaos: {
                            min: 10,
                            median: 20,
                            max: 30,
                            count: 10,
                            sellers: 10,
                            confidence: 0.5,
                        },
                    },
                    confidenceMethod: "asking-sellers-coverage-v1",
                    firstSeenAt: null,
                    lastSeenAt: null,
                },
                covered: true,
                reasons: [],
            });
        const bound = bind();
        const priced = bound.nodes.find((entry) => entry.id === node.id)!;
        expect(
            priced.kind === "acquire" &&
                priced.alternatives[0]?.kind === "purchase" &&
                priced.alternatives[0].price?.amount,
        ).toBe(20);
    }
});

it("does not treat matching Two-Toned Boots display names as proof of canonical base identity", () => {
    const { item, node } = purchases.find(
        ({ preset, node }) => preset === "tailwind-boots" && node.id === "tailwind-base",
    )!;
    const cohort = cohorts.find(
        (cohort) => cohortPriceCoverage(cohort, queries.record(item), node.output).covered,
    )!;
    const other = {
        ...engine.createItem("Metadata/Items/Armours/Boots/BootsAtlas2", item.level),
        influences: item.influences,
    };
    expect(engine.base(other).name).toBe(engine.base(item).name);
    expect(other.implicits).not.toEqual(item.implicits);
    expect(cohortPriceCoverage(cohort, queries.record(other), node.output).covered).toBe(false);
    const legacy = structuredClone(cohort);
    for (const group of legacy.query.groups)
        group.filters = group.filters.filter(
            (filter) => !(filter.kind === "base" && filter.field === "baseId"),
        );
    for (const variant of [item, other])
        expect(cohortPriceCoverage(legacy, queries.record(variant), node.output).reasons).toContain(
            "The cohort does not distinguish the canonical variants sharing this base name.",
        );
    expect(craftingMarketItemIssue(engine, item)).toBeNull();
    expect(craftingMarketItemIssue(engine, { ...item, implicits: [] })).toContain(
        "modified implicits",
    );
    expect(classifier.classify(normalizeApiItem("poe1", "stash", rawItem(item))).matches).toContain(
        cohort.id,
    );
    expect(
        classifier.classify(normalizeApiItem("poe1", "stash", rawItem(other))).matches,
    ).not.toContain(cohort.id);
    expect(
        classifier.classify(
            normalizeApiItem("poe1", "stash", { ...rawItem(item), implicitMods: [] }),
        ).unknown,
    ).toContain(cohort.id);
});

it("exports mandatory influence constraints separately from native spawn eligibility", () => {
    const names = ["shaper", "elder", "crusader", "redeemer", "hunter", "warlord"];
    const model = manifest.modifierTextModel!;
    expect(model.modifiers.map((mod) => [mod.id, mod.requiredInfluence])).toEqual(
        model.modifiers.map((mod) => [
            mod.id,
            names[catalog.crafting.modRules[mod.id]?.influence ?? -1],
        ]),
    );
    expect(
        model.modifiers.find((mod) => mod.id === "RecoverLifePercentOnBlockUber1_"),
    ).toMatchObject({ requiredInfluence: "shaper" });
    const { item } = purchases.find(
        (entry) => entry.preset === "life-block-shield" && entry.node.id === "recovery",
    )!;
    expect(() => engine.validateItem({ ...item, influences: [] })).toThrow(
        "This modifier requires its matching influence.",
    );
    const fixed = marketModifierTextModel(engine, new Set(["Astrolabe Amulet"])).bases[0]!;
    expect(fixed.unsupported).toBeUndefined();
    expect(fixed.fixedInfluences).toEqual({
        values: names,
        texts: [catalog.mods.CanHaveEveryInfluenceTypeImplicitE1!.text],
    });
});

it("can populate 24 purchase inputs with optional identity metadata and preserves the three elemental ambiguities", () => {
    const unknown: string[] = [];
    for (const { preset, node, item } of purchases) {
        const cohort = cohorts.find(
            (cohort) => cohortPriceCoverage(cohort, queries.record(item), node.output).covered,
        )!;
        const populated = [false, true].some((metadata) =>
            classifier
                .classify(normalizeApiItem("poe1", "stash", rawItem(item, metadata)))
                .matches.includes(cohort.id),
        );
        if (!populated) unknown.push(`${preset}/${node.id}`);
    }
    expect(unknown).toEqual([
        "elemental-bow/donor-0",
        "elemental-bow/donor-1",
        "elemental-bow/donor-2",
    ]);
});

it("populates 19 inputs from descriptions, flags and influence while preserving eight ambiguous rolls", () => {
    const unknown = purchases.flatMap(({ preset, node, item }) => {
        const cohort = cohorts.find(
            (cohort) => cohortPriceCoverage(cohort, queries.record(item), node.output).covered,
        )!;
        const result = classifier.classify(normalizeApiItem("poe1", "stash", rawItem(item)));
        if (result.matches.includes(cohort.id)) return [];
        expect(result.unknown).toContain(cohort.id);
        return [`${preset}/${node.id}`];
    });
    expect(unknown).toEqual([
        "es-block-shield/flat",
        "es-block-shield/percent",
        "es-block-shield/block",
        "elemental-bow/donor-0",
        "elemental-bow/donor-1",
        "elemental-bow/donor-2",
        "energy-shield-chest/donor-1",
        "energy-shield-chest/donor-2",
    ]);
});

it.each([
    ["life-block-shield", "recovery", false],
    ["es-block-shield", "percent", true],
    ["es-block-shield", "flat-block", false],
    ["tailwind-boots", "onslaught-base", false],
    ["physical-bow", "donor-1", false],
    ["suppression-chest", "suppression-base", false],
    ["global-defence-chest", "defences", false],
    ["rarity-helmet", "donor-0-0", false],
    ["energy-shield-chest", "donor-1", true],
    ["strength-helical-ring", "base", false],
] as const)("classifies raw %s/%s listings without supplied canonical facts", (preset, id, metadata) => {
    const { node, item } = purchases.find(
        (entry) => entry.preset === preset && entry.node.id === id,
    )!;
    const cohort = cohorts.find(
        (cohort) => cohortPriceCoverage(cohort, queries.record(item), node.output).covered,
    )!;
    const raw = rawItem(item, metadata);
    expect(classifier.classify(normalizeApiItem("poe1", "stash", raw)).matches).toContain(
        cohort.id,
    );
    for (const invalid of [
        { ...raw, ilvl: 85 },
        { ...raw, baseType: "Wrong Base" },
        { ...raw, corrupted: true },
        { ...raw, extended: { ...raw.extended, suffixes: raw.extended.suffixes + 1 } },
        { ...raw, influences: { ...raw.influences, elder: true } },
    ])
        expect(
            classifier.classify(normalizeApiItem("poe1", "stash", invalid)).matches,
        ).not.toContain(cohort.id);
    if (item.mods.length) {
        expect(
            classifier.classify(normalizeApiItem("poe1", "stash", { ...raw, explicitMods: [] }))
                .matches,
        ).not.toContain(cohort.id);
    }
});

it("does not price ambiguous elemental modifier identities from names, tiers or numeric rolls", () => {
    for (const { node, item } of purchases.filter((entry) => entry.preset === "elemental-bow")) {
        const cohort = cohorts.find(
            (cohort) => cohortPriceCoverage(cohort, queries.record(item), node.output).covered,
        )!;
        for (const metadata of [false, true]) {
            const result = classifier.classify(
                normalizeApiItem("poe1", "stash", rawItem(item, metadata)),
            );
            expect(result.matches).not.toContain(cohort.id);
            expect(result.unknown).toContain(cohort.id);
        }
    }
});

it("rejects a named high-tier donor when its actual stat roll is outside the canonical range", () => {
    const { node, item } = purchases.find(
        (entry) => entry.preset === "physical-bow" && entry.node.id === "donor-0",
    )!;
    const cohort = cohorts.find(
        (cohort) => cohortPriceCoverage(cohort, queries.record(item), node.output).covered,
    )!;
    const raw = rawItem(item, true);
    raw.explicitMods[0]!.description = "120% increased Physical Damage";
    expect(classifier.classify(normalizeApiItem("poe1", "stash", raw)).matches).not.toContain(
        cohort.id,
    );
});

it("keeps explicit tier requirements and unknown additional defence lines unpriced", () => {
    const { node, item } = purchases.find(
        (entry) => entry.preset === "global-defence-chest" && entry.node.id === "defences",
    )!;
    const record = queries.record(item);
    const cohort = cohorts.find(
        (cohort) => cohortPriceCoverage(cohort, record, node.output).covered,
    )!;
    expect(
        cohortPriceCoverage(cohort, record, {
            ...node.output,
            groups: [
                ...node.output.groups,
                {
                    type: "and",
                    filters: [
                        {
                            kind: "mod",
                            ids: [item.mods[0]!.id],
                            tier: { max: 1 },
                            count: { min: 1 },
                        },
                    ],
                },
            ],
        }).covered,
    ).toBe(false);
    const raw = rawItem(item);
    raw.explicitMods.push({ description: "999999% increased Global Defences" });
    const result = classifier.classify(normalizeApiItem("poe1", "stash", raw));
    expect(result.matches).not.toContain(cohort.id);
    expect(result.unknown).toContain(cohort.id);
});

it.each([
    ["es-block-shield", "flat-block", "RecoverEnergyShieldPercentOnBlockUber1"],
    ["tailwind-boots", "onslaught-base", "OnslaughtOnKillInfluence2_"],
    ["energy-shield-chest", "donor-1", "LocalIncreasedEvasionRating8"],
])("classifies %s/%s when only the ambiguous affix supplies identity metadata", (preset, nodeId, knownId) => {
    const { node, item } = purchases.find(
        (entry) => entry.preset === preset && entry.node.id === nodeId,
    )!;
    const cohort = cohorts.find(
        (entry) => cohortPriceCoverage(entry, queries.record(item), node.output).covered,
    )!;
    const raw = rawItem(item, true);
    const name = engine.mod(knownId).name;
    raw.explicitMods = raw.explicitMods.map((row) =>
        row.mods?.[0]?.name === name ? row : { description: row.description },
    );
    expect(raw.explicitMods.some((row) => row.mods?.length)).toBe(true);
    expect(raw.explicitMods.some((row) => !row.mods?.length)).toBe(true);
    expect(classifier.classify(normalizeApiItem("poe1", "stash", raw)).matches).toContain(
        cohort.id,
    );
});
