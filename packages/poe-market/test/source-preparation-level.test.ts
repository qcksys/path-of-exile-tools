import {
    type ItemQueryGroup,
    normalizeApiItem,
    type SourcePreparationProfile,
} from "@poe-tools/item-query";
import { expect, it } from "vite-plus/test";
import { compileMarketCohorts, marketCohortManifestSchema } from "../src/index.ts";

const fractureText = "Critical Strike Chance is increased by Overcapped Lightning Resistance";
const kinds = ["fractured-fossil-v1", "scour-v1"] as const;

function fixture(kind: SourcePreparationProfile["kind"], format: 1 | 2 | 3) {
    const fractured = kind === "fractured-fossil-v1";
    return marketCohortManifestSchema.parse({
        format: 1,
        game: "poe1",
        revision: `source-level-${format}`,
        catalogHash: "a".repeat(64),
        modifierTextModel: {
            format: 4,
            modifiers: [
                {
                    id: "target",
                    name: "of Esh",
                    side: "suffix",
                    groups: ["critical"],
                    crafted: false,
                    text: fractureText,
                },
            ],
            bases: [{ baseType: "Conquest Lamellar" }],
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
                name: "Paid source",
                purpose: "base",
                query: {
                    game: "poe1",
                    sourcePreparation: {
                        kind,
                        crafted: false,
                        enchanted: false,
                        ...(fractured ? { fractureId: "target" } : {}),
                    },
                    groups: [
                        {
                            type: "and",
                            filters: [
                                { kind: "base", field: "baseType", values: ["Conquest Lamellar"] },
                                { kind: "range", field: "ilvl", value: { min: 86, max: 86 } },
                                { kind: "rarity", values: [fractured ? "Rare" : "Normal"] },
                                { kind: "range", field: "prefixes", value: { min: 0, max: 0 } },
                                {
                                    kind: "range",
                                    field: "suffixes",
                                    value: { min: fractured ? 1 : 0, max: fractured ? 1 : 0 },
                                },
                                ...(fractured
                                    ? [
                                          {
                                              kind: "mod",
                                              ids: ["target"],
                                              side: "suffix",
                                              fractured: true,
                                              count: { min: 1, max: 1 },
                                          },
                                      ]
                                    : []),
                            ],
                        },
                    ],
                },
            },
        ],
    });
}

function source(kind: SourcePreparationProfile["kind"], resolved = false) {
    return normalizeApiItem("poe1", "stash", {
        baseType: "Conquest Lamellar",
        ilvl: 86,
        rarity: "Rare",
        identified: true,
        extended: { prefixes: 3, suffixes: 3 },
        ...(kind === "fractured-fossil-v1"
            ? {
                  fractured: true,
                  explicitMods: [
                      {
                          description: resolved ? fractureText : "Unresolved protected modifier",
                          flags: { fractured: true },
                      },
                  ],
              }
            : {
                  explicitMods: ["Disposable affix"],
                  implicitMods: resolved ? [] : ["Unresolved persistent implicit"],
              }),
    });
}

it("excludes known wrong levels before unresolved preparation only in format 2", () => {
    for (const kind of kinds) {
        const legacy = compileMarketCohorts(fixture(kind, 1));
        const current = compileMarketCohorts(fixture(kind, 2));
        for (const ilvl of [84, 85, 88, 90]) {
            const record = source(kind);
            record.item.ilvl = ilvl;
            expect(legacy.classify(record)).toEqual({ matches: [], unknown: ["source"] });
            expect(current.classify(record)).toEqual({ matches: [], unknown: [] });
        }
    }
});

it("retains uncertainty for matching or missing levels and uses the shared level fallback", () => {
    for (const kind of kinds) {
        const classifier = compileMarketCohorts(fixture(kind, 2));
        for (const fields of [
            { ilvl: 86 },
            { ilvl: undefined },
            { ilvl: undefined, itemLevel: 86 },
        ]) {
            const record = source(kind);
            Object.assign(record.item, fields);
            expect(classifier.classify(record)).toEqual({ matches: [], unknown: ["source"] });
        }
        for (const fields of [
            { ilvl: undefined, itemLevel: 85 },
            { ilvl: 85, itemLevel: 86 },
        ]) {
            const record = source(kind);
            Object.assign(record.item, fields);
            expect(classifier.classify(record)).toEqual({ matches: [], unknown: [] });
        }
    }
});

it("preserves level filtering when source preparation advances to format 3", () => {
    for (const kind of kinds) {
        const classifier = compileMarketCohorts(fixture(kind, 3));
        for (const fields of [
            { ilvl: 85 },
            { ilvl: undefined, itemLevel: 85 },
            { ilvl: 85, itemLevel: 86 },
        ]) {
            const record = source(kind);
            Object.assign(record.item, fields);
            expect(classifier.classify(record)).toEqual({ matches: [], unknown: [] });
        }
        for (const fields of [{ ilvl: 86 }, { ilvl: undefined }]) {
            const record = source(kind);
            Object.assign(record.item, fields);
            expect(classifier.classify(record)).toEqual({ matches: [], unknown: ["source"] });
        }
        expect(classifier.classify(source(kind, true))).toEqual({
            matches: ["source"],
            unknown: [],
        });
    }
});

it("does not treat an individual OR, NOT or COUNT level condition as mandatory", () => {
    for (const kind of kinds) {
        for (const type of ["or", "not", "count"] as const) {
            const manifests = ([1, 2, 3] as const).map((format) => fixture(kind, format));
            const group: ItemQueryGroup = {
                type,
                filters: [
                    { kind: "range", field: "ilvl", value: { min: 86, max: 86 } },
                    ...(type === "not"
                        ? []
                        : [{ kind: "flag" as const, field: "identified" as const, value: true }]),
                ],
                ...(type === "count" ? { value: { min: 1, max: 1 } } : {}),
            };
            for (const manifest of manifests) {
                manifest.cohorts[0]!.query.groups = [group];
                const record = source(kind);
                record.item.ilvl = 85;
                expect(compileMarketCohorts(manifest).classify(record)).toEqual({
                    matches: [],
                    unknown: ["source"],
                });
            }
        }
    }
});

it("evaluates transformed rarity and affix requirements only after successful preparation", () => {
    for (const kind of kinds) {
        const record = source(kind, true);
        const before = structuredClone(record);
        for (const format of [1, 2, 3] as const) {
            const classifier = compileMarketCohorts(fixture(kind, format));
            expect(classifier.classify(record)).toEqual({ matches: ["source"], unknown: [] });
            const wrongLevel = structuredClone(record);
            wrongLevel.item.ilvl = 85;
            expect(classifier.classify(wrongLevel)).toEqual({ matches: [], unknown: [] });
        }
        expect(record).toEqual(before);
    }
});

it("leaves ordinary cohorts and missing preparation-model behavior unchanged", () => {
    for (const kind of kinds) {
        for (const format of [1, 2, 3] as const) {
            const manifest = fixture(kind, format);
            delete manifest.cohorts[0]!.query.sourcePreparation;
            const record = source(kind);
            record.item.ilvl = 85;
            expect(compileMarketCohorts(manifest).classify(record)).toEqual({
                matches: [],
                unknown: [],
            });
        }
        const manifest = fixture(kind, 1);
        delete manifest.sourcePreparationModel;
        const record = source(kind);
        record.item.ilvl = 85;
        expect(compileMarketCohorts(manifest).classify(record)).toEqual({
            matches: [],
            unknown: ["source"],
        });
    }
});
