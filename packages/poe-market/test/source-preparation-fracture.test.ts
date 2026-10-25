import { readFileSync } from "node:fs";
import {
    compileModifierTextModel,
    normalizeApiItem,
    type SourcePreparationProfile,
} from "@poe-tools/item-query";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import {
    compileMarketCohorts,
    type MarketCohortManifest,
    marketCohortManifestSchema,
} from "../src/index.ts";

const target = "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1";
const hybrid = "LocalBaseArmourAndEvasionRating7";
const targetText = "Critical Strike Chance is increased by Overcapped Lightning Resistance";
const profile: SourcePreparationProfile = {
    kind: "fractured-fossil-v1",
    fractureId: target,
    crafted: false,
    enchanted: false,
};

function fixture(format: 1 | 2 | 3 | 4 = 3) {
    return marketCohortManifestSchema.parse({
        format: 1,
        game: "poe1",
        revision: "fracture-proof",
        catalogHash: "a".repeat(64),
        modifierTextModel: {
            format: 5,
            bases: [{ baseType: "Conquest Lamellar" }],
            modifiers: [
                {
                    id: target,
                    name: "of Esh",
                    side: "suffix",
                    groups: ["target"],
                    crafted: false,
                    text: targetText,
                },
                {
                    id: hybrid,
                    name: "Adaptable",
                    side: "prefix",
                    groups: ["hybrid"],
                    crafted: false,
                    text: "+(221-300) to Armour\n+(221-300) to Evasion Rating",
                },
                {
                    id: "armour",
                    name: "Armoured",
                    side: "prefix",
                    groups: ["armour"],
                    crafted: false,
                    text: "+(221-300) to Armour",
                },
                {
                    id: "evasion",
                    name: "Evasive",
                    side: "prefix",
                    groups: ["evasion"],
                    crafted: false,
                    text: "+(221-300) to Evasion Rating",
                },
            ],
        },
        sourcePreparationModel: {
            format,
            bases: [
                {
                    id: "conquest",
                    baseType: "Conquest Lamellar",
                    itemClass: "Body Armour",
                    scourImplicits: { ids: [], texts: [[]] },
                },
            ],
        },
        cohorts: [
            {
                id: "source",
                name: "Paid fracture source",
                purpose: "fracture",
                query: {
                    game: "poe1",
                    sourcePreparation: profile,
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: ["Conquest Lamellar"] },
                                { kind: "range", field: "ilvl", value: { min: 86, max: 86 } },
                            ],
                        },
                    ],
                },
            },
        ],
    });
}

function source() {
    return normalizeApiItem("poe1", "stash", {
        baseType: "Conquest Lamellar",
        ilvl: 86,
        rarity: "Rare",
        identified: true,
        fractured: true,
        extended: { prefixes: 1, suffixes: 0 },
        explicitMods: [
            { description: "+291 to Armour", flags: { fractured: true } },
            { description: "+292 to Evasion Rating", flags: { fractured: true } },
        ],
    });
}

it("retains the proven incompatible-fracture rejection from format 3 onward", () => {
    const record = source();
    const before = structuredClone(record);
    for (const format of [1, 2, 3, 4] as const) {
        const manifest = fixture(format);
        const resolved = compileModifierTextModel(manifest.modifierTextModel!)(record);
        expect(resolved.facts.modifiers).toEqual([
            expect.objectContaining({ id: hybrid, fractured: true }),
        ]);
        expect(resolved.facts.modifiersComplete).toBe(false);
        expect(compileMarketCohorts(manifest).classify(record)).toEqual({
            matches: [],
            unknown: format >= 3 ? [] : ["source"],
        });
    }
    expect(record).toEqual(before);
});

it("does not promote an agreeing resolved fracture to a successful source projection", () => {
    const manifest = fixture();
    manifest.cohorts[0]!.query.sourcePreparation = { ...profile, fractureId: hybrid };
    expect(compileMarketCohorts(manifest).classify(source())).toEqual({
        matches: [],
        unknown: ["source"],
    });
});

it("keeps the existing positive projection when disposable affixes cannot be resolved", () => {
    const record = source();
    record.item.explicitMods = [
        { description: targetText, flags: { fractured: true } },
        { description: "Unresolved disposable affix" },
    ];
    record.item.extended = { prefixes: 3, suffixes: 3 };
    record.facts.prefixes = 3;
    record.facts.suffixes = 3;
    for (const format of [1, 2, 3] as const) {
        const manifest = fixture(format);
        expect(compileModifierTextModel(manifest.modifierTextModel!)(record)).toBe(record);
        expect(compileMarketCohorts(manifest).classify(record)).toEqual({
            matches: ["source"],
            unknown: [],
        });
    }
});

it("does not infer a wrong fracture from ambiguity, missing identity or nonfractured facts", () => {
    const manifest = fixture();
    manifest.modifierTextModel!.modifiers.push({
        ...manifest.modifierTextModel!.modifiers[1]!,
        id: "hybrid-alias",
    });
    const ambiguous = source();
    const resolved = compileModifierTextModel(manifest.modifierTextModel!)(ambiguous);
    expect(resolved.facts.modifiers.some((mod) => mod.fractured && mod.id !== undefined)).toBe(
        false,
    );
    expect(compileMarketCohorts(manifest).classify(ambiguous)).toEqual({
        matches: [],
        unknown: ["source"],
    });
    for (const fact of [
        { fractured: true },
        { fractured: true, possibleIds: [target, "other"] },
        { id: "other", fractured: false },
    ]) {
        const record = source();
        record.item.explicitMods = [
            { description: "Unresolved fracture", flags: { fractured: true } },
        ];
        record.facts.modifiers = [fact];
        expect(compileMarketCohorts(fixture()).classify(record)).toEqual({
            matches: [],
            unknown: ["source"],
        });
    }
});

it("leaves Scouring and ordinary cohorts unchanged", () => {
    for (const format of [1, 2, 3] as const) {
        const manifest = fixture(format);
        manifest.cohorts[0]!.query.sourcePreparation = {
            kind: "scour-v1",
            crafted: false,
            enchanted: false,
        };
        expect(compileMarketCohorts(manifest).classify(source())).toEqual({
            matches: [],
            unknown: [],
        });
        const unfractured = source();
        unfractured.item.fractured = false;
        unfractured.item.explicitMods = [{ description: "Disposable affix" }];
        expect(compileMarketCohorts(manifest).classify(unfractured)).toEqual({
            matches: ["source"],
            unknown: [],
        });
        delete manifest.cohorts[0]!.query.sourcePreparation;
        expect(compileMarketCohorts(manifest).classify(source())).toEqual({
            matches: ["source"],
            unknown: [],
        });
    }
});

describe("generated fracture sources", () => {
    let generated: MarketCohortManifest;
    let resolve: ReturnType<typeof compileModifierTextModel>;
    let legacy: ReturnType<typeof compileMarketCohorts>;
    let current: ReturnType<typeof compileMarketCohorts>;

    beforeAll(() => {
        generated = marketCohortManifestSchema.parse(
            JSON.parse(readFileSync(new URL("../data/cohorts-poe1.json", import.meta.url), "utf8")),
        );
        generated.cohorts = generated.cohorts.filter(
            (cohort) => cohort.query.sourcePreparation?.kind === "fractured-fossil-v1",
        );
        resolve = compileModifierTextModel(generated.modifierTextModel!);
        legacy = compileMarketCohorts({
            ...generated,
            sourcePreparationModel: { ...generated.sourcePreparationModel!, format: 2 },
        });
        current = compileMarketCohorts({
            ...generated,
            sourcePreparationModel: { ...generated.sourcePreparationModel!, format: 3 },
        });
    });

    it("rejects the saved hybrid Conquest mechanics using generated ordinary facts without altering the item", () => {
        expect(generated.cohorts).toHaveLength(4);
        const record = source();
        record.item.extended = { prefixes: 1, suffixes: 3 };
        record.facts.suffixes = 3;
        record.item.explicitMods!.unshift(
            { description: "+41% to Fire Resistance" },
            { description: "25% increased Stun and Block Recovery" },
            { description: "8% additional Physical Damage Reduction" },
        );
        record.item.properties = [
            { name: "Armour", values: [["1108", 1]], displayMode: 0, type: 16 },
            { name: "Evasion Rating", values: [["1109", 1]], displayMode: 0, type: 17 },
        ];
        const before = structuredClone(record);
        expect(resolve(record).facts.modifiers).toContainEqual(
            expect.objectContaining({ id: hybrid, fractured: true }),
        );
        expect(legacy.classify(record).unknown).toHaveLength(1);
        expect(current.classify(record)).toEqual({ matches: [], unknown: [] });
        expect(record).toEqual(before);
    });

    it("captures an invariant Breach fracture behind a paid defence-enchantment removal only in model 4", () => {
        const record = normalizeApiItem("poe1", "stash", {
            baseType: "Conquest Lamellar",
            ilvl: 86,
            rarity: "Rare",
            identified: true,
            fractured: true,
            searing: true,
            tangled: true,
            extended: { prefixes: 3, suffixes: 3 },
            explicitMods: [
                { description: targetText, flags: { fractured: true } },
                { description: "Unresolved disposable affix" },
                { description: "+15% to Fire and Chaos Resistances", flags: { crafted: true } },
            ],
            implicitMods: [
                { description: "Melee Hits have 9% chance to Fortify" },
                { description: "Gain an Endurance Charge every 15 seconds" },
            ],
            enchantMods: ["8% increased Explicit Defence Modifier magnitudes"],
        });
        const before = structuredClone(record);
        const expected = generated.cohorts.find(
            (cohort) =>
                cohort.query.sourcePreparation?.crafted && cohort.query.sourcePreparation.enchanted,
        )!;
        expect(current.classify(record)).toEqual({ matches: [], unknown: [expected.id] });
        const next = compileMarketCohorts({
            ...generated,
            sourcePreparationModel: { ...generated.sourcePreparationModel!, format: 4 },
        });
        expect(next.classify(record)).toEqual({ matches: [expected.id], unknown: [] });
        expect(record).toEqual(before);
    });
});
