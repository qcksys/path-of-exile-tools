import { readFileSync } from "node:fs";
import { normalizeApiItem } from "@poe-tools/item-query";
import { compileMarketCohorts, marketCohortManifestSchema } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { CraftingEngine } from "../app/lib/crafting-engine";
import { marketModifierIdentities, marketModifierTextModel } from "../scripts/market-modifier-text";
import { catalog, engine } from "./crafting-fixtures";

const manifest = marketCohortManifestSchema.parse(
    JSON.parse(readFileSync("../../packages/poe-market/data/cohorts-poe1.json", "utf8")),
);
const id = "BreachBodyAllDefences1";
const mod = catalog.mods[id]!;
const cohort = manifest.cohorts.find(
    (entry) =>
        entry.id.startsWith("preset:") &&
        entry.query.groups.some((group) =>
            group.filters.some((filter) => filter.kind === "mod" && filter.ids?.includes(id)),
        ),
)!;
const model = marketModifierTextModel(engine, new Set(["Grasping Mail"]));
const identities = marketModifierIdentities(engine, model);
const raw = {
    baseType: "Grasping Mail",
    typeLine: "Grasping Mail",
    name: "Test Armour",
    frameType: 2,
    ilvl: 86,
    identified: true,
    corrupted: false,
    influences: {},
    extended: { prefixes: 1, suffixes: 0 },
    explicitMods: [
        {
            description: mod.text!,
            mods: [{ name: mod.name, tier: "P1", level: mod.required_level }],
        },
    ],
};

it("classifies the same isolated Grasping Mail with or without Chayula source metadata", () => {
    const classifier = compileMarketCohorts({
        ...manifest,
        cohorts: [cohort],
        modifierTextModel: model,
        modifierIdentities: identities,
    });
    for (const explicitMods of [raw.explicitMods, [{ description: mod.text! }]]) {
        const record = normalizeApiItem("poe1", "stash", { ...raw, explicitMods });
        expect(classifier.classify(record)).toEqual({ matches: [cohort.id], unknown: [] });
    }
    for (const invalid of [
        { ...raw, frameType: 3 },
        { ...raw, ilvl: 85 },
        { ...raw, corrupted: true },
        { ...raw, extended: { prefixes: 2, suffixes: 0 } },
    ]) {
        expect(classifier.classify(normalizeApiItem("poe1", "stash", invalid)).matches).toEqual([]);
    }
});

it("excludes unrelated identity domains while preserving supported non-native equipment metadata", () => {
    const watchstones = Object.entries(catalog.mods).filter(
        ([, entry]) =>
            entry.domain === "watchstone" &&
            entry.name === mod.name &&
            entry.required_level === mod.required_level &&
            !entry.text,
    );
    expect(watchstones).toHaveLength(4);
    for (const [id] of watchstones) {
        expect(model.modifiers.some((entry) => entry.id === id)).toBe(false);
        expect(identities.some((entry) => entry.id === id)).toBe(false);
    }
    for (const domain of ["item", "crafted", "unveiled", "delve", "mercenary", "ducat_crafted"]) {
        const entries = Object.entries(catalog.mods).filter(
            ([id, entry]) =>
                entry.domain === domain &&
                entry.name &&
                model.modifiers.some((mod) => mod.id === id),
        );
        expect(entries.length).toBeGreaterThan(0);
        for (const [id, entry] of entries) {
            expect(identities.find((identity) => identity.id === id)).toEqual({
                id,
                name: entry.name,
                side: entry.generation_type,
                level: entry.required_level,
                text: entry.text ?? null,
            });
        }
    }
});

it("keeps a legitimate equipment identity with missing text ambiguous", () => {
    const altered = structuredClone(catalog);
    const unknownId = "UntranslatedEquipmentDefences";
    altered.mods[unknownId] = { ...mod, text: null };
    const alteredEngine = new CraftingEngine(altered);
    const alteredModel = marketModifierTextModel(alteredEngine, new Set(["Grasping Mail"]));
    const alteredIdentities = marketModifierIdentities(alteredEngine, alteredModel);
    expect(alteredModel.modifiers.find((entry) => entry.id === unknownId)).toMatchObject({
        unsupported: true,
        text: null,
    });
    expect(alteredIdentities.find((entry) => entry.id === unknownId)?.text).toBeNull();
    const classifier = compileMarketCohorts({
        ...manifest,
        cohorts: [cohort],
        modifierTextModel: alteredModel,
        modifierIdentities: alteredIdentities,
    });
    expect(classifier.classify(normalizeApiItem("poe1", "stash", raw))).toEqual({
        matches: [],
        unknown: [cohort.id],
    });
});
