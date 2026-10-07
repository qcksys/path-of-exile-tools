import { readFileSync } from "node:fs";
import { normalizeApiItem } from "@poe-tools/item-query";
import { expect, it } from "vite-plus/test";
import { compileMarketCohorts, marketCohortManifestSchema } from "../src/index.ts";

const manifest = marketCohortManifestSchema.parse(
    JSON.parse(readFileSync(new URL("../data/cohorts-poe1.json", import.meta.url), "utf8")),
);
const classifier = compileMarketCohorts(manifest);
const source = { baseType: "Exquisite Blade", frameType: 2, identified: true, ilvl: 86 };
const physical = {
    description: "179% increased Physical Damage",
    flags: { fractured: true },
    mods: [{ name: "Merciless", tier: "P1", level: 83 }],
};
function names(item: unknown, purpose?: string) {
    const result = classifier.classify(normalizeApiItem("poe1", "stash", item));
    return result.matches
        .map((id) => classifier.definition(id)!)
        .filter((cohort) => !purpose || cohort.purpose === purpose)
        .map((cohort) => cohort.name);
}

it("prices a T1 fracture on the exact base and level band without calling every fractured item T1", () => {
    expect(names({ ...source, explicitMods: [physical] })).toEqual([
        "Exquisite Blade, T1 Merciless, fractured, ilvl 86–100",
    ]);
    expect(names({ ...source, ilvl: 84, explicitMods: [physical] })).toEqual([
        "Exquisite Blade, T1 Merciless, fractured, ilvl 84–85",
    ]);
    expect(
        names({
            ...source,
            explicitMods: [
                {
                    description: "169% increased Physical Damage",
                    flags: { fractured: true },
                    mods: [{ name: "Tyrannical", tier: "P2", level: 73 }],
                },
            ],
        }),
    ).toEqual(["Exquisite Blade, T2 Tyrannical, fractured, ilvl 86–100"]);
    expect(names({ ...source, explicitMods: [{ ...physical, flags: {} }] }, "fracture")).toEqual(
        [],
    );
    expect(
        names(
            {
                ...source,
                explicitMods: [{ ...physical, description: "169% increased Physical Damage" }],
            },
            "fracture",
        ),
    ).toEqual([]);
    expect(names({ ...source, corrupted: true, explicitMods: [physical] })).toEqual([]);
    const unresolved = classifier.classify(
        normalizeApiItem("poe1", "stash", { ...source, fracturedMods: [physical.description] }),
    );
    expect(unresolved.matches).toEqual([]);
    expect(unresolved.unknown.length).toBeGreaterThan(0);
});

it("separates isolated Temple suffixes from two-suffix donors and retains broad overlapping groups", () => {
    const mods = [
        "+47% to Cold Resistance",
        "40% increased Damage with Hits against Chilled Enemies",
    ].map((description) => ({
        description,
        mods: [{ name: "of Puhuarte", tier: "S0", level: 1 }],
    }));
    const item = { ...source, baseType: "Slink Gloves", explicitMods: mods };
    const label =
        "Slink Gloves, of Puhuarte: +(46-48)% to Cold Resistance; (30-50)% increased Damage with Hits against Chilled Enemies";
    expect(names(item, "isolated-modifier")).toEqual([
        `${label}, 1 suffix`,
        `${label}, 1 suffix, display-equivalent family`,
    ]);
    expect(names(item, "transfer-donor")).toEqual([
        `${label}, any affix count`,
        `${label}, any affix count, display-equivalent family`,
    ]);
    const second = {
        description: "Unknown suffix",
        mods: [{ name: "unknown", tier: "S1", level: 1 }],
    };
    expect(names({ ...item, explicitMods: [...mods, second] }, "isolated-modifier")).toEqual([]);
    expect(
        names(
            { ...item, explicitMods: [...mods, second], extended: { suffixes: 2 } },
            "isolated-modifier",
        ),
    ).toEqual([`${label}, 2 suffixes`, `${label}, 2 suffixes, display-equivalent family`]);
    expect(names({ ...item, explicitMods: [mods[0]] }, "transfer-donor")).toEqual([]);
});

it("tracks the Grasping Mail crit modifier on both its source and a transfer base", () => {
    for (const baseType of ["Grasping Mail", "Necrotic Armour"]) {
        const item = {
            ...source,
            baseType,
            explicitMods: [
                {
                    description:
                        "Critical Strike Chance is increased by Overcapped Lightning Resistance",
                    mods: [{ name: "of Esh", tier: "S0", level: 1 }],
                },
            ],
        };
        const label = `${baseType}, of Esh: Critical Strike Chance is increased by Overcapped Lightning Resistance`;
        expect(names(item, "transfer-donor")).toEqual([`${label}, any affix count`]);
        expect(names(item, "isolated-modifier")).toEqual([`${label}, 1 suffix`]);
    }
});
