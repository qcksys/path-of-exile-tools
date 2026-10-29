import { describe, expect, it } from "vite-plus/test";
import type { Item } from "../../../packages/poe-api-client/src/types";
import {
    extractModSignature,
    signatureValue,
} from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/index";
import { UNIQUE_MOD_SPLITS } from "../../../packages/poe-stash-ingest/src/shared/mod-extractors/unique-mod-splits";

function unique(name: string, explicitMods: Item["explicitMods"], overrides: Partial<Item> = {}) {
    return {
        id: "item",
        verified: true,
        w: 2,
        h: 2,
        icon: "https://example.invalid/item.png",
        name,
        typeLine: "Base",
        baseType: "Base",
        identified: true,
        frameType: 3,
        explicitMods,
        ...overrides,
    } satisfies Item;
}

// Mod lines from poe.ninja's listing of each variant, with ranges rolled.
const VARIANTS: [name: string, variant: string, mods: string[]][] = [
    ...(
        [
            ["ES", ["+75 to maximum Energy Shield", "285% increased Energy Shield"]],
            ["Armour", ["400% increased Armour", "+95 to maximum Life"]],
            ["Evasion", ["400% increased Evasion Rating", "+95 to maximum Life"]],
            [
                "Armour/ES",
                ["210% increased Armour and Energy Shield", "+75 to maximum Energy Shield"],
            ],
            ["Armour/ES/Life", ["210% increased Armour and Energy Shield", "+95 to maximum Life"]],
            [
                "Evasion/ES",
                ["210% increased Evasion and Energy Shield", "+75 to maximum Energy Shield"],
            ],
            [
                "Evasion/ES/Life",
                ["210% increased Evasion and Energy Shield", "+95 to maximum Life"],
            ],
            ["Armour/Evasion", ["210% increased Armour and Evasion", "+95 to maximum Life"]],
            ["Armour/Evasion/ES", ["300% increased Armour, Evasion and Energy Shield"]],
        ] as const
    ).map(
        ([variant, mods]) =>
            [
                "Atziri's Splendour",
                variant,
                [...mods, "+22% to all Elemental Resistances", "Gain 100 Life per Enemy Killed"],
            ] as [string, string, string[]],
    ),
    ...["Bubonic Trail", "Lightpoacher", "Shroud of the Lightless", "Tombfist"].flatMap(
        (name) =>
            [
                [name, "1 Jewel", ["Has 1 Abyssal Socket"]],
                [name, "2 Jewels", ["Has 2 Abyssal Sockets"]],
            ] as [string, string, string[]][],
    ),
    ...["Physical", "Lightning", "Cold", "Fire"].map(
        (element) =>
            [
                "Doryani's Invitation",
                element,
                [`30% increased ${element} Damage`, `0.6% of ${element} Damage Leeched as Life`],
            ] as [string, string, string[]],
    ),
    ...[
        ["Despair", "Chaos"],
        ["Frostbite", "Cold"],
        ["Vulnerability", "Physical"],
        ["Flammability", "Fire"],
        ["Conductivity", "Lightning"],
    ].map(
        ([curse, variant]) =>
            [
                "Impresence",
                variant,
                [
                    "+60 to maximum Life",
                    "Enfeeble has no Reservation if Cast as an Aura",
                    `${curse} has no Reservation if Cast as an Aura`,
                ],
            ] as [string, string, string[]],
    ),
    ...[2, 3, 4, 5].map(
        (flasks) =>
            [
                "Mageblood",
                `${flasks} Flasks`,
                [
                    "Magic Utility Flasks cannot be Used",
                    `Leftmost ${flasks} Magic Utility Flasks constantly apply their Flask Effects to you`,
                ],
            ] as [string, string, string[]],
    ),
    ...["Endurance", "Frenzy", "Power"].map(
        (charge) =>
            [
                "Ralakesh's Impatience",
                charge,
                [
                    "20% increased Movement Speed",
                    `Count as having maximum number of ${charge} Charges`,
                ],
            ] as [string, string, string[]],
    ),
    ...["Determination", "Purity of Lightning"].map(
        (aura) =>
            [
                "Sublime Vision",
                aura,
                [
                    "Auras from your Skills have 30% increased Effect on you",
                    "+1 to Maximum Endurance Charges while affected by Determination",
                    `Aura Skills other than ${aura} are Disabled`,
                ],
            ] as [string, string, string[]],
    ),
    ...[
        ["Mana", "+5 to maximum Mana"],
        ["Energy Shield", "3% increased Energy Shield"],
        ["Chaos Resistance", "+4% to Chaos Resistance"],
        ["Fire Damage", "6% increased Fire Damage"],
        ["All Attributes", "+2 to all Attributes"],
        ["Global Critical Strike Chance", "5% increased Global Critical Strike Chance"],
        ["Evasion Rating", "7% increased Evasion Rating"],
    ].map(
        ([variant, stat]) =>
            ["The Light of Meaning", variant, [`Passive Skills in Radius also grant ${stat}`]] as [
                string,
                string,
                string[],
            ],
    ),
    ...["Small", "Very Large", "Massive"].map(
        (size) =>
            [
                "Thread of Hope",
                `${size} Ring`,
                [
                    `Only affects Passives in ${size} Ring`,
                    "Passive Skills in Radius can be Allocated without being connected to your tree",
                    "-15% to all Elemental Resistances",
                ],
            ] as [string, string, string[]],
    ),
    ...["Relics", "Tainted Currency", "Experience"].map(
        (reward) =>
            [
                "The First Crest",
                reward,
                [
                    `Aureus Coins are converted to ${reward} upon defeating the Herald of the Scourge`,
                    "This item is destroyed when applied to a Sanctum",
                ],
            ] as [string, string, string[]],
    ),
    ...["Fire", "Cold", "Lightning"].map(
        (element) =>
            [
                "Volkuur's Guidance",
                element,
                [`Your ${element} Damage can Poison`, "50% less Poison Duration"],
            ] as [string, string, string[]],
    ),
    ...[3, 5, 7].map(
        (passives) =>
            [
                "Voices",
                `${passives} passives`,
                [
                    "Adds 3 Jewel Socket Passive Skills",
                    `Adds ${passives} Small Passive Skills which grant nothing`,
                ],
            ] as [string, string, string[]],
    ),
    ...[
        [
            "Bleeding",
            "Projectiles from Attacks inflict Bleeding on Hit while you have a Bestial Minion",
        ],
        ["Poison", "Projectiles from Attacks Poison on Hit while you have a Bestial Minion"],
        ["Maim", "Projectiles from Attacks Maim on Hit while you have a Bestial Minion"],
    ].map(
        ([variant, mod]) =>
            ["Yriel's Fostering", variant, ["+350 to Accuracy Rating", mod]] as [
                string,
                string,
                string[],
            ],
    ),
];

describe("uniques split by mods", () => {
    it("has a variant fixture for every listed unique", () => {
        expect(new Set(VARIANTS.map(([name]) => name))).toEqual(
            new Set(Object.keys(UNIQUE_MOD_SPLITS)),
        );
    });

    it.each(VARIANTS)("splits %s into %s", (name, variant, mods) => {
        const signature = extractModSignature(unique(name, mods));
        expect(signature).toEqual({ kind: "unique-mod-split", variant });
        expect(signatureValue(signature)).toBe(variant);
    });

    it("reads structured mod lines", () => {
        expect(
            extractModSignature(
                unique("Ralakesh's Impatience", [
                    { description: "Count as having maximum number of Power Charges" },
                ]),
            ),
        ).toEqual({ kind: "unique-mod-split", variant: "Power" });
    });

    it("ignores unidentified copies, non-uniques and copies without the splitting mod", () => {
        const mods = [
            "Leftmost 4 Magic Utility Flasks constantly apply their Flask Effects to you",
        ];
        expect(extractModSignature(unique("Mageblood", mods, { identified: false }))).toBeNull();
        expect(extractModSignature(unique("Mageblood", mods, { frameType: 2 }))).toBeNull();
        expect(extractModSignature(unique("Mageblood", ["+50 to Dexterity"]))).toBeNull();
        expect(extractModSignature(unique("toString", mods))).toBeNull();
    });
});

describe("Foulborn copies of split uniques", () => {
    const flasks = (count: number) =>
        `Rightmost ${count} Magic Utility Flasks constantly apply their Flask Effects to you`;
    const masked = "Rightmost # Magic Utility Flasks constantly apply their Flask Effects to you";

    it.each([2, 3, 4, 5])("keeps Foulborn Mageblood with %i flasks apart", (count) => {
        const signature = extractModSignature(
            unique("Foulborn Mageblood", ["Magic Utility Flasks cannot be Used"], {
                mutated: true,
                mutatedMods: [flasks(count)],
            }),
        );
        expect(signature).toEqual({
            kind: "foulborn",
            mods: [masked],
            variant: `${count} Flasks`,
        });
        expect(signatureValue(signature)).toBe(`${masked} (${count} Flasks)`);
    });

    it("reads mutated mods flagged among the explicit mods", () => {
        const signature = extractModSignature(
            unique("Foulborn Mageblood", [{ description: flasks(3), flags: { mutated: true } }], {
                mutated: true,
            }),
        );
        expect(signature).toMatchObject({ kind: "foulborn", variant: "3 Flasks" });
    });

    it("leaves other Foulborn signatures unchanged", () => {
        const signature = extractModSignature(
            unique("Foulborn Goldrim", ["+30 to Evasion Rating"], {
                mutated: true,
                mutatedMods: ["+17% to Chaos Resistance"],
            }),
        );
        expect(signature).toEqual({ kind: "foulborn", mods: ["+#% to Chaos Resistance"] });
        expect(signatureValue(signature)).toBe("+#% to Chaos Resistance");
    });
});
