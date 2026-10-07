import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { compileModifierTextModel, normalizeApiItem } from "@poe-tools/item-query";
import { describe, expect, it } from "vite-plus/test";
import {
    askingPriceConfidence,
    compileMarketCohorts,
    marketCohortManifestSchema,
    modifierLevelBands,
} from "../src/index.ts";

const manifest = marketCohortManifestSchema.parse({
    format: 1,
    game: "poe1",
    revision: "test",
    catalogHash: "a".repeat(64),
    cohorts: [
        {
            id: "base",
            name: "Base",
            purpose: "base",
            query: {
                game: "poe1",
                groups: [
                    {
                        type: "and",
                        filters: [
                            {
                                kind: "base",
                                field: "baseType",
                                values: ["Necrotic Armour", "Necrotic Armour"],
                            },
                            { kind: "range", field: "ilvl", value: { min: 84 } },
                            { kind: "flag", field: "fractured", value: false },
                        ],
                    },
                ],
            },
        },
        {
            id: "linked",
            name: "Six-linked",
            purpose: "base",
            query: {
                game: "poe1",
                groups: [
                    {
                        type: "and",
                        filters: [
                            { kind: "base", field: "baseType", values: ["Necrotic Armour"] },
                            { kind: "range", field: "links", value: { min: 6 } },
                        ],
                    },
                ],
            },
        },
        {
            id: "either",
            name: "Either base",
            purpose: "base",
            query: {
                game: "poe1",
                groups: [
                    {
                        type: "or",
                        filters: [
                            { kind: "base", field: "baseType", values: ["Vaal Axe"] },
                            { kind: "base", field: "baseType", values: ["Necrotic Armour"] },
                        ],
                    },
                ],
            },
        },
    ],
});

describe("market cohorts", () => {
    it("resolves supported facts from the captured catalyst context without forcing ambiguous fractures", () => {
        const generated = marketCohortManifestSchema.parse(
            JSON.parse(readFileSync(new URL("../data/cohorts-poe1.json", import.meta.url), "utf8")),
        );
        const resolve = compileModifierTextModel(generated.modifierTextModel!);
        const source = JSON.parse(
            readFileSync(
                new URL(
                    "../../poe-item-query/test/fixtures/poe1-public-stash-quality-2026-10-07.json",
                    import.meta.url,
                ),
                "utf8",
            ),
        );
        const jewellery = source.items.find(
            (entry: { item: { baseType: string } }) => entry.item.baseType === "Vermillion Ring",
        ).item;
        const record = normalizeApiItem("poe1", "stash", jewellery);
        const result = resolve(record);
        expect(result.item).toBe(record.item);
        expect(result.facts.modifiers).toContainEqual(
            expect.objectContaining({ id: "LifeRegeneration5", tier: 3 }),
        );
        expect(result.facts.modifiers).toContainEqual(
            expect.objectContaining({ id: "JunMaster2BaseManaAndLifeRegen3", crafted: true }),
        );
        const manifold = normalizeApiItem(
            "poe1",
            "stash",
            source.items.find(
                (entry: { item: { baseType: string } }) => entry.item.baseType === "Manifold Ring",
            ).item,
        );
        const resolved = resolve(manifold);
        expect(resolved.facts.modifiers).toContainEqual(
            expect.objectContaining({ id: "LifeGainedFromEnemyDeath5", tier: 2 }),
        );
        expect(resolved.facts.modifiers.some((mod) => mod.fractured)).toBe(false);
        expect(resolved.facts.modifiersComplete).toBe(false);
    });

    it.each([
        ["Simplex Amulet", 103],
        ["Focused Amulet", 103],
        ["Helical Ring", 79],
        ["Manifold Ring", 56],
    ] as const)("classifies a scaled T1 fracture on %s only with verified native implicit text", (baseType, resistance) => {
        const generated = marketCohortManifestSchema.parse(
            JSON.parse(readFileSync(new URL("../data/cohorts-poe1.json", import.meta.url), "utf8")),
        );
        const classifier = compileMarketCohorts(generated);
        const base = generated.modifierTextModel!.bases.find((base) => base.baseType === baseType)!;
        const source = {
            baseType,
            rarity: "Rare",
            identified: true,
            fractured: true,
            ilvl: 85,
            properties: [
                { name: "Quality (Resistance Modifiers)", type: 6, values: [["+20%", 1]] },
            ],
            implicitMods: base.magnitude!.texts.map((description) => ({ description })),
            explicitMods: [
                { description: `+${resistance}% to Cold Resistance`, flags: { fractured: true } },
            ],
            extended: { prefixes: 0, suffixes: 1 },
        };
        const cohort = generated.cohorts.find(
            (entry) => entry.name === `${baseType}, T1 of Haast, fractured, ilvl 84–85`,
        )!;
        expect(cohort).toBeDefined();
        expect(classifier.classify(normalizeApiItem("poe1", "stash", source)).matches).toContain(
            cohort.id,
        );
        const incomplete = normalizeApiItem("poe1", "stash", { ...source, implicitMods: [] });
        expect(classifier.classify(incomplete).matches).not.toContain(cohort.id);
        expect(classifier.classify(incomplete).unknown).toContain(cohort.id);
    });

    it("prices an unscaled jewellery fracture but not the same displayed value with catalyst quality", () => {
        const generated = marketCohortManifestSchema.parse(
            JSON.parse(readFileSync(new URL("../data/cohorts-poe1.json", import.meta.url), "utf8")),
        );
        const classifier = compileMarketCohorts(generated);
        const item = {
            baseType: "Two-Stone Ring",
            rarity: "Rare",
            identified: true,
            fractured: true,
            ilvl: 85,
            explicitMods: [{ description: "+47% to Cold Resistance", flags: { fractured: true } }],
            extended: { prefixes: 0, suffixes: 1 },
        };
        const record = normalizeApiItem("poe1", "stash", item);
        const cohort = generated.cohorts.find(
            (entry) => entry.name === "Two-Stone Ring, T1 of Haast, fractured, ilvl 84–85",
        )!;
        expect(classifier.classify(record).matches).toContain(cohort.id);
        const scaled = normalizeApiItem("poe1", "stash", {
            ...item,
            properties: [
                { name: "Quality (Resistance Modifiers)", values: [["+20%", 1]], type: 6 },
            ],
        });
        expect(classifier.classify(scaled).matches).not.toContain(cohort.id);
        expect(classifier.classify(scaled).unknown).toContain(cohort.id);
        const top = normalizeApiItem("poe1", "stash", {
            ...scaled.item,
            explicitMods: [{ description: "+57% to Cold Resistance", flags: { fractured: true } }],
        });
        expect(classifier.classify(top).matches).toContain(cohort.id);
    });

    it.each([
        [
            "Slink Gloves",
            "ColdResistEnhancedModAilments__",
            ["+47% to Cold Resistance", "40% increased Damage with Hits against Chilled Enemies"],
            false,
        ],
        [
            "Grasping Mail",
            "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1",
            ["Critical Strike Chance is increased by Overcapped Lightning Resistance"],
            true,
        ],
    ] as const)("preserves description-only donor certainty on %s", (baseType, id, descriptions, resolved) => {
        const generated = marketCohortManifestSchema.parse(
            JSON.parse(readFileSync(new URL("../data/cohorts-poe1.json", import.meta.url), "utf8")),
        );
        const classifier = compileMarketCohorts(generated);
        const record = normalizeApiItem("poe1", "stash", {
            baseType,
            rarity: "Rare",
            identified: true,
            ilvl: 86,
            explicitMods: descriptions.map((description) => ({ description })),
            extended: { prefixes: 0, suffixes: 1 },
        });
        const matches = classifier
            .classify(record)
            .matches.map((key) => classifier.definition(key)!);
        expect(
            matches.some(
                (cohort) =>
                    cohort.purpose === "isolated-modifier" &&
                    cohort.query.groups.some((group) =>
                        group.filters.some(
                            (filter) =>
                                filter.kind === "mod" &&
                                filter.ids?.length === 1 &&
                                filter.ids.includes(id),
                        ),
                    ),
            ),
        ).toBe(resolved);
        if (!resolved) {
            expect(
                matches.some(
                    (cohort) =>
                        cohort.id.startsWith("donor-family:") &&
                        cohort.purpose === "isolated-modifier",
                ),
            ).toBe(true);
            expect(
                classifier
                    .classify(record)
                    .unknown.some((key) =>
                        classifier
                            .definition(key)
                            ?.query.groups.some((group) =>
                                group.filters.some(
                                    (filter) =>
                                        filter.kind === "mod" &&
                                        filter.ids?.length === 1 &&
                                        filter.ids.includes(id),
                                ),
                            ),
                    ),
            ).toBe(true);
        }
        const incomplete = { ...record, item: { ...record.item, extended: { prefixes: 0 } } };
        expect(
            classifier
                .classify(incomplete)
                .matches.map((key) => classifier.definition(key)!.purpose),
        ).not.toContain("isolated-modifier");
    });

    it("resolves captured stash fractures from descriptions and counts without trade metadata", () => {
        const generated = marketCohortManifestSchema.parse(
            JSON.parse(readFileSync(new URL("../data/cohorts-poe1.json", import.meta.url), "utf8")),
        );
        const fixture = JSON.parse(
            readFileSync(
                new URL(
                    "../../poe-item-query/test/fixtures/poe1-public-stash-2026-10-07.json",
                    import.meta.url,
                ),
                "utf8",
            ),
        );
        const resolve = compileModifierTextModel(generated.modifierTextModel!);
        const classifier = compileMarketCohorts(generated);
        const records = fixture.items.map((item: unknown) =>
            normalizeApiItem("poe1", "stash", item),
        );
        const helmet = records.find(
            (record: ReturnType<typeof normalizeApiItem>) =>
                record.item.baseType === "Conqueror's Helmet",
        )!;
        const gloves = records.find(
            (record: ReturnType<typeof normalizeApiItem>) =>
                record.item.baseType === "Vaal Gauntlets",
        )!;
        expect(resolve(gloves).facts.modifiers).toContainEqual(
            expect.objectContaining({ id: "ColdResist8", tier: 1, fractured: true }),
        );
        expect(resolve(helmet).facts.modifiers).toContainEqual(
            expect.objectContaining({ id: "Intelligence10", tier: 1, fractured: true }),
        );
        expect(
            classifier.classify(helmet).matches.map((id) => classifier.definition(id)?.name),
        ).toContain("Conqueror's Helmet, T1 of the Polymath, fractured, ilvl 84–85");
        for (const record of records.filter((record: ReturnType<typeof normalizeApiItem>) =>
            record.item.baseType.includes("Ring"),
        ))
            expect(resolve(record)).toBe(record);
    });

    it("captures the generated 84/86 Necrotic Armour markets without mixing in damaged or fractured bases", () => {
        const generated = marketCohortManifestSchema.parse(
            JSON.parse(readFileSync(new URL("../data/cohorts-poe1.json", import.meta.url), "utf8")),
        );
        expect(
            createHash("sha256")
                .update(
                    JSON.stringify({
                        catalogHash: generated.catalogHash,
                        cohorts: generated.cohorts,
                        modifierIdentities: generated.modifierIdentities,
                        modifierTextModel: generated.modifierTextModel,
                    }),
                )
                .digest("hex"),
        ).toBe(generated.revision);
        const classifier = compileMarketCohorts(generated);
        const item = {
            baseType: "Necrotic Armour",
            frameType: 2,
            identified: true,
            ilvl: 84,
            sockets: Array.from({ length: 6 }, () => ({ group: 0 })),
        };
        expect(classifier.classify(normalizeApiItem("poe1", "stash", item))).toEqual({
            matches: ["base:necrotic-armour:84-85:any-links", "base:necrotic-armour:84-85:6-link"],
            unknown: [],
        });
        expect(
            classifier.classify(normalizeApiItem("poe1", "stash", { ...item, ilvl: 86 })).matches,
        ).toEqual(["base:necrotic-armour:86-100:any-links", "base:necrotic-armour:86-100:6-link"]);
        for (const flags of [
            { corrupted: true },
            { duplicated: true },
            { fracturedMods: ["+100 to maximum Life"] },
            { synthesised: true },
            { influences: { shaper: true } },
            { frameType: 3 },
        ]) {
            expect(
                classifier.classify(normalizeApiItem("poe1", "stash", { ...item, ...flags }))
                    .matches,
            ).toEqual([]);
        }
        expect(classifier.acceptsBase("Grasping Mail")).toBe(true);
        expect(classifier.acceptsBase("Rusted Sword")).toBe(false);
    });
    it("uses shared query semantics, preserves overlapping membership and does not duplicate it", () => {
        const classifier = compileMarketCohorts(manifest);
        const item = normalizeApiItem("poe1", "stash", {
            baseType: "Necrotic Armour",
            ilvl: 86,
            sockets: Array.from({ length: 6 }, () => ({ group: 0 })),
        });
        expect(classifier.classify(item)).toEqual({
            matches: ["either", "base", "linked"],
            unknown: [],
        });
        expect(classifier.classify({ ...item, game: "poe2" })).toEqual({
            matches: [],
            unknown: [],
        });
        expect(
            classifier.classify(normalizeApiItem("poe1", "stash", { baseType: "Vaal Axe" }))
                .matches,
        ).toEqual(["either"]);
    });
    it("keeps missing item-level/socket facts out of priced membership", () => {
        expect(
            compileMarketCohorts(manifest).classify(
                normalizeApiItem("poe1", "stash", { baseType: "Necrotic Armour" }),
            ),
        ).toEqual({ matches: ["either"], unknown: ["base", "linked"] });
        const narrow = compileMarketCohorts({ ...manifest, cohorts: manifest.cohorts.slice(0, 2) });
        expect(narrow.acceptsBase("Rusted Sword")).toBe(false);
    });
    it("rejects conflicting cohort identities and games", () => {
        expect(() =>
            compileMarketCohorts({
                ...manifest,
                cohorts: [manifest.cohorts[0]!, manifest.cohorts[0]!],
            }),
        ).toThrow("Duplicate");
        expect(marketCohortManifestSchema.safeParse({ ...manifest, game: "poe2" }).success).toBe(
            false,
        );
    });
    it("groups unchanged modifier pools and splits on appearance, removal and weight changes", () => {
        expect(
            modifierLevelBands([1, 20, 21, 40, 41, 70, 90, 101], (level) => [
                { id: "base", weight: level < 70 ? 100 : 200 },
                ...(level >= 20 && level <= 40 ? [{ id: "capped", weight: 10 }] : []),
            ]),
        ).toEqual([
            { min: 1, max: 19 },
            { min: 20, max: 40 },
            { min: 41, max: 69 },
            { min: 70, max: 100 },
        ]);
    });
    it("discounts asking-price confidence for few sellers, unpriced listings and unknown membership", () => {
        expect(askingPriceConfidence(10, 10, 10, 0)).toBe(0.5);
        expect(askingPriceConfidence(10, 10, 10, 10)).toBe(0.25);
        expect(askingPriceConfidence(1, 100, 100, 0)).toBeLessThan(0.1);
        expect(askingPriceConfidence(0, 0, 0, 0)).toBe(0);
    });
});
