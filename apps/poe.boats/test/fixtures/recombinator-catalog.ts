import type { CatalogMod, RecombinatorCatalog } from "~/schemas/recombinator-catalog";

export const lifeMod: CatalogMod = {
    id: "Life1",
    name: "Healthy",
    text: "+(10-19) to maximum Life",
    side: "prefixes",
    level: 1,
    maxLevel: 100,
    groups: ["Life"],
    addsTags: [],
    spawn: [
        ["weapon", 0],
        ["default", 1000],
    ],
    generation: [],
};
export const lifeTier2: CatalogMod = {
    ...lifeMod,
    id: "Life2",
    name: "Fecund",
    text: "+(90-99) to maximum Life",
    level: 80,
};
export const armourMod: CatalogMod = {
    ...lifeMod,
    id: "Armour1",
    name: "Plated",
    text: "+(40-50) to Armour",
    groups: ["Armour"],
    spawn: [
        ["body_armour", 1000],
        ["default", 0],
    ],
};
export const fireMod: CatalogMod = {
    ...lifeMod,
    id: "Fire1",
    name: "of the Flame",
    text: "+(10-19)% to Fire Resistance",
    side: "suffixes",
    groups: ["FireResistance"],
};
export const catalogFixture: RecombinatorCatalog = {
    format: 1,
    game: "poe1",
    patch: "fixture",
    source: {
        manifestSha256: "a".repeat(64),
        basesSha256: "b".repeat(64),
        modsSha256: "c".repeat(64),
    },
    bases: [
        {
            id: "Metadata/Items/BodyInt17",
            name: "Vaal Regalia",
            itemClass: "Body Armour",
            tags: ["int_armour", "body_armour", "armour", "default"],
        },
        {
            id: "Metadata/Items/Sword1",
            name: "Iron Sword",
            itemClass: "One Hand Sword",
            tags: ["sword", "one_hand_weapon", "weapon", "default"],
        },
    ],
    mods: [lifeMod, lifeTier2, armourMod, fireMod],
};
