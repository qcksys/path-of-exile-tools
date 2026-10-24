import { readFileSync } from "node:fs";
import { normalizeApiItem } from "@poe-tools/item-query";
import { compileMarketCohorts, marketCohortManifestSchema } from "@poe-tools/market";
import { expect, it } from "vite-plus/test";
import { projectFromPreset } from "../app/lib/crafting-presets";
import { rolledModText } from "../app/lib/crafting-text";
import { craftingPresetCohorts } from "../scripts/crafting-preset-cohorts";
import { catalog, engine } from "./crafting-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

const ruleset = {
    ...historyIndex.revisions.find((entry) => entry.game === "poe1" && entry.revision === "r10")!,
    engine: "crafting-graph-11",
    revision: "r11",
};
const graph = projectFromPreset(engine, ruleset, "sushi-mercenary-chest");
const node = graph.nodes.find((entry) => entry.id === "fractured-base")!;
if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
    throw new Error("Source fixture");
const template = node.alternatives[0].item;
const cohorts = craftingPresetCohorts(engine, ruleset).filter(
    (cohort) => cohort.query.sourcePreparation,
);
const manifest = marketCohortManifestSchema.parse({
    ...JSON.parse(readFileSync("../../packages/poe-market/data/cohorts-poe1.json", "utf8")),
    cohorts,
    sourcePreparationModel: {
        format: 1,
        bases: [{ id: template.baseId, baseType: "Conquest Lamellar", itemClass: "Body Armour" }],
    },
});
const classifier = compileMarketCohorts(manifest);

it.each([
    false,
    true,
])("captures replaceable Eldritch source state with separate fracture array=%s", (separate) => {
    const fracture = rolledModText(catalog, template.mods[0]!, template)!;
    // Synthetic disposable text tests the source contract without inventing canonical affix identities.
    const raw = {
        baseType: "Conquest Lamellar",
        rarity: "Rare",
        ilvl: 86,
        identified: true,
        fractured: true,
        extended: { prefixes: 3, suffixes: 3 },
        explicitMods: [
            { description: "Unresolved disposable prefix" },
            { description: "Unresolved disposable suffix" },
            { description: "Crafted disposable line", flags: { crafted: true } },
            ...(separate ? [] : [{ description: fracture, flags: { fractured: true } }]),
        ],
        fracturedMods: separate ? [fracture] : [],
        enchantMods: [
            "Quality does not increase Defences",
            "Grants +1% to Lightning Resistance per 2% Quality",
        ],
        implicitMods: [
            "While a Unique Enemy is in your Presence, Haste has 39% increased Aura Effect",
            "While a Unique Enemy is in your Presence, Gain a Frenzy Charge every 10 seconds",
        ],
    };
    const record = normalizeApiItem("poe1", "stash", raw);
    const original = structuredClone(record);
    const expected = cohorts.find(
        (cohort) =>
            cohort.query.sourcePreparation?.crafted && cohort.query.sourcePreparation.enchanted,
    )!;
    expect(classifier.classify(record)).toEqual({ matches: [expected.id], unknown: [] });
    expect(record).toEqual(original);
    for (const invalid of [
        { corrupted: true },
        { influences: { hunter: true } },
        { ilvl: 85 },
        { fractured: false },
        { synthesised: true },
    ])
        expect(
            classifier.classify(normalizeApiItem("poe1", "stash", { ...raw, ...invalid })).matches,
        ).toEqual([]);
});

it("does not price source policy cohorts without the proof model", () => {
    const unsupported = compileMarketCohorts({ ...manifest, sourcePreparationModel: undefined });
    expect(
        unsupported.classify(
            normalizeApiItem("poe1", "stash", {
                baseType: "Conquest Lamellar",
                rarity: "Rare",
                ilvl: 86,
                identified: true,
                fractured: true,
                fracturedMods: [rolledModText(catalog, template.mods[0]!, template)!],
            }),
        ).matches,
    ).toEqual([]);
});
