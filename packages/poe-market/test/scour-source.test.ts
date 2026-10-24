import {
    itemQuerySchema,
    normalizeApiItem,
    type ScourSourcePreparation,
} from "@poe-tools/item-query";
import { expect, it } from "vite-plus/test";
import {
    cohortPriceCoverage,
    compileMarketCohorts,
    decodeCohortPriceReference,
    encodeCohortPriceReference,
    marketCohortManifestSchema,
    sameSourcePreparation,
} from "../src/index.ts";

const nativeId = "ChanceToInflictScorchOnEnemyOnBlockImplicitE1";
const nativeText = "Scorch Enemies when you Block their Damage";
const profiles: ScourSourcePreparation[] = [false, true].flatMap((crafted) =>
    [false, true].map((enchanted) => ({ kind: "scour-v1", crafted, enchanted })),
);
const filters = [
    { kind: "base", field: "baseType", values: ["Heat-attuned Tower Shield"] },
    { kind: "base", field: "baseId", values: ["heat"] },
    { kind: "rarity", values: ["Normal"] },
    ...["ilvl", "prefixes", "suffixes"].map((field) => ({
        kind: "range",
        field,
        value: { min: field === "ilvl" ? 86 : 0, max: field === "ilvl" ? 86 : 0 },
    })),
    { kind: "flag", field: "identified", value: true },
    ...["corrupted", "mirrored", "fractured", "synthesised"].map((field) => ({
        kind: "flag",
        field,
        value: false,
    })),
    { kind: "influence", values: ["shaper"] },
    { kind: "mod", side: "implicit", ids: [nativeId], count: { min: 1, max: 1 } },
];
const groups = [
    { type: "and", filters },
    {
        type: "not",
        filters: [
            { kind: "influence", values: ["elder", "crusader", "redeemer", "hunter", "warlord"] },
        ],
    },
];
const manifest = marketCohortManifestSchema.parse({
    format: 1,
    game: "poe1",
    revision: "scour-test",
    catalogHash: "a".repeat(64),
    modifierTextModel: { format: 4, modifiers: [], bases: [] },
    sourcePreparationModel: {
        format: 1,
        bases: [
            {
                id: "heat",
                baseType: "Heat-attuned Tower Shield",
                itemClass: "Shield",
                scourImplicits: { ids: [nativeId], texts: [[nativeText]] },
            },
        ],
    },
    cohorts: [
        ...profiles.map((profile, i) => ({
            id: `scour-${i}`,
            name: "Paid Scouring source",
            purpose: "base",
            query: { game: "poe1", sourcePreparation: profile, groups },
        })),
        {
            id: "ordinary",
            name: "Ordinary Normal base",
            purpose: "base",
            query: { game: "poe1", groups },
        },
    ],
});
const classifier = compileMarketCohorts(manifest);
const template = normalizeApiItem(
    "poe1",
    "craft",
    {
        baseType: "Heat-attuned Tower Shield",
        rarity: "Normal",
        identified: true,
        ilvl: 86,
        implicitMods: [nativeText],
        influences: { shaper: true },
    },
    {
        baseId: "heat",
        prefixes: 0,
        suffixes: 0,
        modifiersComplete: true,
        modifiers: [{ id: nativeId, side: "implicit" }],
    },
);
const requirements = itemQuerySchema.parse({ game: "poe1" });
function source(profile: ScourSourcePreparation) {
    return normalizeApiItem("poe1", "stash", {
        ...template.item,
        rarity: "Magic",
        explicitMods: ["A disposable affix with no canonical identity"],
        ...(profile.crafted ? { craftedMods: ["Prefixes Cannot Be Changed"] } : {}),
        ...(profile.enchanted ? { enchantMods: ["Quality does not increase Defences"] } : {}),
        note: "~price 6 chaos",
    });
}

it("classifies each raw cleanup partition only into its paid source cohort, preserving the raw ask and record", () => {
    for (const [i, profile] of profiles.entries()) {
        const input = source(profile);
        const before = structuredClone(input);
        const classified = classifier.classify(input);
        expect(classified.matches).toEqual([`scour-${i}`]);
        expect(classified.unknown.filter((id) => id.startsWith("scour-"))).toEqual([]);
        expect(input).toEqual(before);
        expect(classifier.definition(`scour-${i}`)?.query.sourcePreparation).toEqual(profile);
    }
});

it("keeps exact level, influence, native implicit and known-ineligible controls", () => {
    for (const item of [
        { ...source(profiles[0]!).item, ilvl: 85 },
        { ...source(profiles[0]!).item, ilvl: 87 },
        { ...source(profiles[0]!).item, influences: {} },
        { ...source(profiles[0]!).item, influences: { shaper: true, elder: true } },
        { ...source(profiles[0]!).item, fractured: true },
        { ...source(profiles[0]!).item, rarity: "Normal" as const },
    ]) {
        const result = classifier.classify(normalizeApiItem("poe1", "stash", item));
        expect(result.matches.filter((id) => id.startsWith("scour-"))).toEqual([]);
        expect(result.unknown.filter((id) => id.startsWith("scour-"))).toEqual([]);
    }
    const input = source(profiles[0]!);
    input.item.implicitMods = ["Unresolved persistent implicit"];
    expect(classifier.classify(input).unknown).toContain("scour-0");
    expect(classifier.classify({ ...input, game: "poe2" })).toEqual({ matches: [], unknown: [] });
});

it("requires exact profile agreement and a Normal native-only template for coverage and reference round trips", () => {
    const profile = profiles[3]!;
    const cohort = manifest.cohorts[3]!;
    expect(cohortPriceCoverage(cohort, template, requirements, undefined, profile)).toEqual({
        covered: true,
        reasons: [],
    });
    expect(cohortPriceCoverage(cohort, template, requirements).covered).toBe(false);
    for (const other of profiles.slice(0, 3))
        expect(cohortPriceCoverage(cohort, template, requirements, undefined, other).covered).toBe(
            false,
        );
    expect(
        cohortPriceCoverage(manifest.cohorts[4]!, template, requirements, undefined, profile)
            .covered,
    ).toBe(false);
    expect(
        sameSourcePreparation(profile, {
            kind: "fractured-fossil-v1",
            fractureId: nativeId,
            crafted: true,
            enchanted: true,
        }),
    ).toBe(false);
    const withExtra = structuredClone(template);
    withExtra.facts.modifiers.push({ id: "extra", side: "prefix" });
    expect(cohortPriceCoverage(cohort, withExtra, requirements, undefined, profile).covered).toBe(
        false,
    );
    const reference = {
        realm: "pc" as const,
        league: "Allflame",
        revision: manifest.revision,
        cohortId: cohort.id,
        sourcePreparation: profile,
    };
    expect(decodeCohortPriceReference(encodeCohortPriceReference(reference))).toEqual(reference);
    const forged = { ...reference, sourcePreparation: { ...profile, fractureId: "forged" } };
    expect(
        decodeCohortPriceReference(`cohort:v1:${encodeURIComponent(JSON.stringify(forged))}`),
    ).toBeNull();
});

it("does not treat retained models without native proof as a known empty implicit set", () => {
    const old = structuredClone(manifest);
    delete old.sourcePreparationModel!.bases[0]!.scourImplicits;
    expect(compileMarketCohorts(old).classify(source(profiles[0]!)).unknown).toContain("scour-0");
});
