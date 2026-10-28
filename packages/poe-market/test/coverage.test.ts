import { itemQuerySchema, normalizeApiItem } from "@poe-tools/item-query";
import { expect, it } from "vite-plus/test";
import { type MarketCohort, marketCohortSchema } from "../src/cohorts.ts";
import { cohortPriceCoverage } from "../src/coverage.ts";
import { decodeCohortPriceReference, encodeCohortPriceReference } from "../src/reference.ts";

const item = normalizeApiItem(
    "poe1",
    "craft",
    { baseType: "Necrotic Armour", rarity: "Normal", identified: true, ilvl: 86 },
    { modifiersComplete: true, prefixes: 0, suffixes: 0 },
);
const requirements = itemQuerySchema.parse({ game: "poe1" });
function exactCohort(): MarketCohort {
    return marketCohortSchema.parse({
        id: "exact-base",
        name: "Normal Necrotic Armour, ilvl 86",
        purpose: "base",
        query: {
            game: "poe1",
            groups: [
                {
                    type: "and",
                    filters: [
                        { kind: "base", field: "baseType", values: ["Necrotic Armour"] },
                        { kind: "rarity", values: ["Normal"] },
                        ...["ilvl", "prefixes", "suffixes"].map((field) => ({
                            kind: "range",
                            field,
                            value: {
                                min: field === "ilvl" ? 86 : 0,
                                max: field === "ilvl" ? 86 : 0,
                            },
                        })),
                        { kind: "flag", field: "identified", value: true },
                        ...["corrupted", "mirrored", "fractured", "synthesised", "influenced"].map(
                            (field) => ({ kind: "flag", field, value: false }),
                        ),
                    ],
                },
            ],
        },
    });
}

it("prices an exact starting state without requiring the output query to repeat it", () => {
    expect(cohortPriceCoverage(exactCohort(), item, requirements)).toEqual({
        covered: true,
        reasons: [],
    });
});

it.each([
    "base",
    "rarity",
    "level-low",
    "level-high",
    "prefixes",
    "suffixes",
    "influences",
    "corrupted",
])("rejects a cohort that matches the configured item but does not guarantee its %s", (field) => {
    const cohort = exactCohort();
    const filters = cohort.query.groups[0]!.filters;
    if (field === "base")
        filters[0] = {
            kind: "base",
            field: "baseType",
            values: ["Necrotic Armour", "Vaal Regalia"],
        };
    else if (field === "rarity")
        filters[1] = { kind: "rarity", values: ["Normal", "Magic", "Rare"] };
    else if (field.startsWith("level"))
        filters[2] = {
            kind: "range",
            field: "ilvl",
            value: field === "level-low" ? { min: 85, max: 86 } : { min: 86, max: 100 },
        };
    else
        cohort.query.groups[0]!.filters = filters.filter(
            (filter) =>
                !(
                    "field" in filter &&
                    filter.field === (field === "influences" ? "influenced" : field)
                ),
        );
    expect(cohortPriceCoverage(cohort, item, requirements).covered).toBe(false);
});

it("requires each configured influence and excludes additional influences", () => {
    const influenced = { ...item, item: { ...item.item, influences: { shaper: true } } };
    const cohort = exactCohort();
    cohort.query.groups[0]!.filters = cohort.query.groups[0]!.filters.filter(
        (filter) => !(filter.kind === "flag" && filter.field === "influenced"),
    );
    cohort.query.groups[0]!.filters.push({ kind: "influence", values: ["shaper"] });
    expect(cohortPriceCoverage(cohort, influenced, requirements).covered).toBe(false);
    cohort.query.groups.push({
        type: "not",
        filters: [
            { kind: "influence", values: ["elder", "crusader", "redeemer", "hunter", "warlord"] },
        ],
    });
    expect(cohortPriceCoverage(cohort, influenced, requirements)).toEqual({
        covered: true,
        reasons: [],
    });
    cohort.query.groups[0]!.filters = cohort.query.groups[0]!.filters.filter(
        (filter) => filter.kind !== "influence",
    );
    expect(cohortPriceCoverage(cohort, influenced, requirements).covered).toBe(false);
});

it("requires the intrinsic preparation profile to price a projected fracture source", () => {
    const profile = {
        kind: "fractured-fossil-v1" as const,
        fractureId: "fracture",
        crafted: true,
        enchanted: true,
    };
    const template = normalizeApiItem(
        "poe1",
        "craft",
        { ...item.item, rarity: "Rare", fractured: true },
        {
            modifiersComplete: true,
            prefixes: 0,
            suffixes: 1,
            modifiers: [{ id: "fracture", side: "suffix", fractured: true }],
        },
    );
    const cohort = exactCohort();
    cohort.query.sourcePreparation = profile;
    cohort.query.groups[0]!.filters = cohort.query.groups[0]!.filters.map((condition) => {
        if (condition.kind === "rarity") return { ...condition, values: ["Rare"] };
        if (condition.kind === "flag" && condition.field === "fractured")
            return { ...condition, value: true };
        if (condition.kind === "range" && condition.field === "suffixes")
            return { ...condition, value: { min: 1, max: 1 } };
        return condition;
    });
    cohort.query.groups[0]!.filters.push({
        kind: "mod",
        ids: ["fracture"],
        fractured: true,
        count: { min: 1 },
    });
    expect(cohortPriceCoverage(cohort, template, requirements, undefined, profile)).toEqual({
        covered: true,
        reasons: [],
    });
    for (const preparation of [
        undefined,
        { ...profile, crafted: false },
        { ...profile, enchanted: false },
        { ...profile, fractureId: "different" },
    ]) {
        expect(
            cohortPriceCoverage(cohort, template, requirements, undefined, preparation).covered,
        ).toBe(false);
    }
    const ordinary = structuredClone(cohort);
    delete ordinary.query.sourcePreparation;
    expect(cohortPriceCoverage(ordinary, template, requirements, undefined, profile).covered).toBe(
        false,
    );
    const reference = {
        realm: "pc" as const,
        league: "Allflame",
        cohortId: cohort.id,
        sourcePreparation: profile,
    };
    expect(decodeCohortPriceReference(encodeCohortPriceReference(reference))).toEqual(reference);
});
