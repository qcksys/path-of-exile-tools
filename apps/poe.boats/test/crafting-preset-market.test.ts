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
    (entry) => entry.game === "poe1" && entry.revision === "r9",
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
                      ? [{ preset: preset.id, graph, node, alternative, item: alternative.item }]
                      : [],
              )
            : [],
    );
});
const startingBases = purchases.filter(({ node }) => node.id.endsWith("-make-base"));
const originalPurchases = purchases.filter(
    ({ node, alternative }) => alternative.id === "buy" && !node.id.includes("-make-"),
);

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
    expect(purchases).toHaveLength(60);
    expect(cohorts).toHaveLength(51);
    const definitions = new Map(manifest.cohorts.map((cohort) => [cohort.id, cohort]));
    for (const cohort of cohorts) expect(definitions.get(cohort.id)).toEqual(cohort);
    for (const { preset, graph: project, node, alternative, item } of purchases) {
        const record = queries.record(item);
        const matching = cohorts.filter(
            (cohort) => cohortPriceCoverage(cohort, record, node.output).covered,
        );
        expect(matching.length, `${preset}/${node.id}/${alternative.id}`).toBeGreaterThan(0);
        expect(capture(rawItem(item)), `${preset}/${node.id}/${alternative.id} capture`).toBe(true);
        const graph = { ...project, league: "Standard" };
        const cohort = matching[0]!;
        const bind = () =>
            bindCohortPurchasePrice(graph, engine, node.id, alternative.id, {
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
        if (priced.kind !== "acquire") throw new Error("Expected acquisition");
        const boundAlternative = priced.alternatives.find((entry) => entry.id === alternative.id)!;
        expect(boundAlternative.kind === "purchase" && boundAlternative.price?.amount).toBe(20);
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

it("can populate 24 original purchase inputs with optional identity metadata and preserves the three elemental ambiguities", () => {
    const unknown: string[] = [];
    expect(originalPurchases).toHaveLength(27);
    for (const { preset, node, item } of originalPurchases) {
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

it("captures every exact Normal preparation base without modifier metadata", () => {
    expect(startingBases).toHaveLength(15);
    const matched = new Set<string>();
    for (const { node, item } of startingBases) {
        expect(item.rarity).toBe("normal");
        expect(item.mods).toEqual([]);
        const cohort = cohorts.find(
            (cohort) => cohortPriceCoverage(cohort, queries.record(item), node.output).covered,
        )!;
        expect(
            classifier.classify(normalizeApiItem("poe1", "stash", rawItem(item))).matches,
        ).toContain(cohort.id);
        matched.add(cohort.id);
    }
    expect(matched.size).toBe(7);
});

it("prices the uninfluenced Hunter preparation base under the ordinary purchase requirements", () => {
    const { node, item } = startingBases.find(
        (entry) => entry.node.id === "tailwind-base-make-base",
    )!;
    const cohort = cohorts.find(
        (entry) => cohortPriceCoverage(entry, queries.record(item), node.output).covered,
    )!;
    expect(item.influences).toEqual([]);
    for (const value of [8, 10, 12]) {
        const listed = {
            ...item,
            sockets: 2,
            implicits: item.implicits.map((mod) => ({ ...mod, values: [value] })),
        };
        expect(craftingMarketItemIssue(engine, listed)).toBeNull();
        const raw = rawItem(listed);
        expect(capture(raw)).toBe(true);
        expect(classifier.classify(normalizeApiItem("poe1", "stash", raw)).matches).toContain(
            cohort.id,
        );
        for (const invalid of [
            { ...raw, ilvl: 85 },
            { ...raw, rarity: "Magic" },
            { ...raw, influences: { hunter: true } },
            { ...raw, corrupted: true },
            rawItem(engine.createItem("Metadata/Items/Armours/Boots/BootsAtlas2", 86)),
        ])
            expect(
                classifier.classify(normalizeApiItem("poe1", "stash", invalid)).matches,
            ).not.toContain(cohort.id);
    }
    expect(
        cohortPriceCoverage(cohort, queries.record(item), {
            ...node.output,
            groups: [
                { type: "and", filters: [{ kind: "range", field: "sockets", value: { min: 4 } }] },
            ],
        }).covered,
    ).toBe(false);
});

it.each([
    {
        preset: "life-block-shield",
        nodeId: "shield-make-heat-base",
        typeLine: "Heat-attuned Tower Shield of the Leviathan",
        description: "+38 to Strength",
        implicit: "Scorch Enemies when you Block their Damage",
        extended: { suffixes: 1 },
        missing: "prefixes",
        needsName: true,
    },
    {
        preset: "life-block-shield",
        nodeId: "shield-make-pinnacle-base",
        typeLine: "Pinnacle Tower Shield of Shaping",
        description: "Socketed Gems have 30% increased Reservation Efficiency",
        implicit: "+29 to maximum Life",
        extended: { suffixes: 1 },
        missing: "prefixes",
        needsName: true,
    },
    {
        preset: "es-block-shield",
        nodeId: "shield-make-titanium-base",
        typeLine: "Unyielding Titanium Spirit Shield",
        description: "78% increased Chance to Block",
        implicit: undefined,
        extended: { prefixes: 1 },
        missing: "suffixes",
        needsName: false,
    },
] as const)("captures and explicitly prices the actual Magic source for $nodeId", (sample) => {
    const {
        graph: project,
        node,
        alternative,
        item,
    } = purchases.find(
        (entry) => entry.preset === sample.preset && entry.node.id === sample.nodeId,
    )!;
    const cohort = cohorts.find(
        (entry) => cohortPriceCoverage(entry, queries.record(item), node.output).covered,
    )!;
    expect(cohort).toBeDefined();
    expect(alternative.price).toBeNull();
    expect(craftingMarketItemIssue(engine, item)).toBeNull();
    const raw = {
        ...rawItem(item),
        typeLine: sample.typeLine,
        explicitMods: [{ description: sample.description }],
        implicitMods: sample.implicit ? [{ description: sample.implicit }] : [],
        extended: sample.extended,
        sockets: [{ group: 0 }, { group: 1 }],
    };
    const record = normalizeApiItem("poe1", "stash", raw);
    expect(record.facts[sample.missing]).toBeUndefined();
    expect(capture(raw)).toBe(true);
    const classified = classifier.classify(record);
    expect(classified.matches).toContain(cohort.id);
    expect(classified.unknown).not.toContain(cohort.id);
    expect(record.item.typeLine).toBe(sample.typeLine);
    expect(record.item.extended).toEqual(sample.extended);
    expect(record.facts[sample.missing]).toBeUndefined();
    expect(
        classifier
            .classify(normalizeApiItem("poe1", "stash", { ...raw, typeLine: raw.baseType }))
            .matches.includes(cohort.id),
    ).toBe(!sample.needsName);
    for (const invalid of [
        { ...raw, extended: { prefixes: 1, suffixes: 1 } },
        { ...raw, explicitMods: [] },
        { ...raw, influences: {} },
        { ...raw, corrupted: true },
    ])
        expect(
            classifier.classify(normalizeApiItem("poe1", "stash", invalid)).matches,
        ).not.toContain(cohort.id);

    const graph = { ...project, league: "Standard" };
    const bound = bindCohortPurchasePrice(graph, engine, node.id, alternative.id, {
        definition: { ...cohort, revision: manifest.revision, catalogHash: manifest.catalogHash },
        latest: {
            realm: "pc",
            league: "Standard",
            hour: 1_790_899_200,
            revision: manifest.revision,
            cohortId: cohort.id,
            listingCount: 1,
            uniqueSellers: 1,
            unknownCount: 0,
            prices: {
                chaos: { min: 17, median: 17, max: 17, count: 1, sellers: 1, confidence: 0 },
            },
            confidenceMethod: "asking-sellers-coverage-v1",
            firstSeenAt: null,
            lastSeenAt: null,
        },
        covered: true,
        reasons: [],
    });
    const priced = bound.nodes.find((entry) => entry.id === node.id)!;
    if (priced.kind !== "acquire") throw new Error("Expected acquisition");
    const purchase = priced.alternatives.find((entry) => entry.id === alternative.id)!;
    if (purchase.kind !== "purchase") throw new Error("Expected purchase");
    expect(purchase.price).toMatchObject({
        amount: 17,
        currency: graph.currency,
        source: "market",
        samples: 1,
        confidence: 0,
    });
    expect(purchase.item).toEqual(item);
    expect(priced.choice).toEqual(node.choice);
    expect(bound.nodes.filter((entry) => entry.id !== node.id)).toEqual(
        graph.nodes.filter((entry) => entry.id !== node.id),
    );
    expect(bound.prices).toEqual(graph.prices);
    expect(alternative.price).toBeNull();
});

it("populates 19 original inputs from descriptions, flags and influence while preserving eight ambiguous rolls", () => {
    const unknown = originalPurchases.flatMap(({ preset, node, item }) => {
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

it("captures Magic alternatives separately from Rare and retains unresolved modifier identities", () => {
    const magic = purchases.filter(({ alternative }) => alternative.id === "buy-magic");
    expect(magic).toHaveLength(15);
    const unknownDescriptions: string[] = [];
    const unknownMetadata: string[] = [];
    for (const { preset, node, item } of magic) {
        const cohort = cohorts.find(
            (cohort) => cohortPriceCoverage(cohort, queries.record(item), node.output).covered,
        )!;
        const rare = originalPurchases.find(
            (entry) => entry.preset === preset && entry.node.id === node.id,
        )!;
        const rareCohort = cohorts.find(
            (cohort) => cohortPriceCoverage(cohort, queries.record(rare.item), node.output).covered,
        )!;
        expect(cohort.id).not.toBe(rareCohort.id);
        expect(cohortPriceCoverage(cohort, queries.record(rare.item), node.output).covered).toBe(
            false,
        );
        expect(cohortPriceCoverage(rareCohort, queries.record(item), node.output).covered).toBe(
            false,
        );
        for (const [metadata, unknown] of [
            [false, unknownDescriptions],
            [true, unknownMetadata],
        ] as const) {
            const result = classifier.classify(
                normalizeApiItem("poe1", "stash", rawItem(item, metadata)),
            );
            expect(result.matches).not.toContain(rareCohort.id);
            if (!result.matches.includes(cohort.id)) {
                expect(result.unknown).toContain(cohort.id);
                unknown.push(`${preset}/${node.id}`);
            }
        }
    }
    expect(unknownDescriptions).toEqual([
        "es-block-shield/flat",
        "elemental-bow/donor-0",
        "elemental-bow/donor-1",
        "elemental-bow/donor-2",
    ]);
    expect(unknownMetadata).toEqual([
        "elemental-bow/donor-0",
        "elemental-bow/donor-1",
        "elemental-bow/donor-2",
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
    for (const { node, item } of purchases.filter(
        (entry) => entry.preset === "elemental-bow" && entry.item.mods.length,
    )) {
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

it("classifies an omitted zero suffix count only when the complete catalog interpretation proves it", () => {
    expect(manifest.modifierTextModel?.format).toBe(3);
    for (const [preset, nodeId, expected] of [
        ["physical-bow", "donor-2", true],
        ["physical-bow", "donor-1", false],
        ["elemental-bow", "donor-0", false],
    ] as const) {
        const { node, item } = purchases.find(
            (entry) =>
                entry.preset === preset &&
                entry.node.id === nodeId &&
                entry.alternative.id === "buy-magic",
        )!;
        const cohort = cohorts.find(
            (entry) => cohortPriceCoverage(entry, queries.record(item), node.output).covered,
        )!;
        const raw = { ...rawItem(item), extended: { prefixes: 1 } };
        const record = normalizeApiItem("poe1", "stash", raw);
        expect(capture(raw)).toBe(true);
        const classified = classifier.classify(record);
        expect(classified.matches.includes(cohort.id), `${preset}/${nodeId}`).toBe(expected);
        expect(classified.unknown.includes(cohort.id), `${preset}/${nodeId}`).toBe(!expected);
        expect(record.facts.suffixes).toBeUndefined();
        expect(record.item.extended).toEqual({ prefixes: 1 });
        for (const invalid of [
            { ...raw, extended: {} },
            { ...raw, extended: { prefixes: 1, suffixes: 1 } },
            {
                ...raw,
                explicitMods: [...raw.explicitMods, { description: "Unsupported extra stat" }],
            },
        ])
            expect(
                classifier.classify(normalizeApiItem("poe1", "stash", invalid)).matches,
            ).not.toContain(cohort.id);
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
