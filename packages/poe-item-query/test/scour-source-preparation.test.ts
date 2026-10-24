import { expect, it } from "vite-plus/test";
import {
    compileSourcePreparation,
    type ItemRecord,
    itemQuerySchema,
    matchItem,
    normalizeApiItem,
    type ScourSourcePreparation,
    type SourcePreparationModel,
    sourcePreparationProfileSchema,
} from "../src/index.ts";

const profile: ScourSourcePreparation = { kind: "scour-v1", crafted: false, enchanted: false };
const model: SourcePreparationModel = {
    format: 1,
    bases: [
        {
            id: "heat",
            baseType: "Heat-attuned Tower Shield",
            itemClass: "Shield",
            scourImplicits: {
                ids: ["ChanceToInflictScorchOnEnemyOnBlockImplicitE1"],
                texts: [["Scorch Enemies when you Block their Damage"]],
            },
        },
        {
            id: "pinnacle",
            baseType: "Pinnacle Tower Shield",
            itemClass: "Shield",
            scourImplicits: {
                ids: ["IncreasedLifeImplicitShield2"],
                texts: Array.from({ length: 11 }, (_, i) => [`+${20 + i} to maximum Life`]),
            },
        },
        {
            id: "titanium",
            baseType: "Titanium Spirit Shield",
            itemClass: "Shield",
            scourImplicits: { ids: [], texts: [[]] },
        },
        {
            id: "hubris",
            baseType: "Hubris Circlet",
            itemClass: "Helmet",
            scourImplicits: { ids: [], texts: [[]] },
        },
        {
            id: "Metadata/Items/Armours/Boots/BootsAtlas1",
            baseType: "Two-Toned Boots",
            itemClass: "Boots",
            scourImplicits: {
                ids: ["ColdAndLightningResistImplicitBoots1"],
                texts: Array.from({ length: 5 }, (_, i) => [
                    `+${8 + i}% to Cold and Lightning Resistances`,
                ]),
            },
        },
        {
            id: "Metadata/Items/Armours/BodyArmours/BodyDex16",
            baseType: "Zodiac Leather",
            itemClass: "Body Armour",
            scourImplicits: { ids: [], texts: [[]] },
        },
    ],
};
const textModel = { format: 4 as const, modifiers: [], bases: [] };
const classify = compileSourcePreparation(textModel, model);
function source(base = model.bases[0]!, rarity: "Magic" | "Rare" = "Magic") {
    return normalizeApiItem("poe1", "stash", {
        baseType: base.baseType,
        identified: true,
        ilvl: 86,
        rarity,
        influences: base.itemClass === "Shield" ? { shaper: true } : {},
        implicitMods: base.scourImplicits!.texts.at(-1),
        explicitMods: ["An unresolved disposable affix"],
        properties: [{ name: "Quality", values: [["+20%", 1]], displayMode: 0 }],
        sockets: [
            { group: 0, attr: "S" },
            { group: 0, attr: "D" },
        ],
    });
}

it("preserves Scouring inputs only when model 3 proves no Intangibility", () => {
    const current = compileSourcePreparation(textModel, { ...model, format: 3 });
    const property = {
        name: "[Intangibility|Intangibility]",
        type: 110,
        displayMode: 0,
        values: [["84%", 0]],
    };
    for (const base of model.bases) {
        const input = source(base);
        input.facts.baseId = base.id;
        input.item.properties = [property];
        for (const format of [1, 2] as const)
            expect(
                compileSourcePreparation(textModel, { ...model, format })(input, profile).status,
            ).toBe("match");
        const before = structuredClone(input);
        expect(current(input, profile)).toEqual({ status: "no-match" });
        expect(input).toEqual(before);
        input.item.properties = [{ ...property, values: [["0%", 0]] }];
        expect(current(input, profile).status).toBe("match");
        input.item.intangibility = 84;
        expect(current(input, profile)).toEqual({ status: "unknown" });
        delete input.item.intangibility;
        input.item.properties = [property, property];
        expect(current(input, profile)).toEqual({ status: "unknown" });
    }
});

it("serializes strict source variants without changing retained fractured profiles", () => {
    const fracture = {
        kind: "fractured-fossil-v1",
        fractureId: "target",
        crafted: true,
        enchanted: true,
    };
    for (const value of [profile, fracture]) {
        expect(sourcePreparationProfileSchema.parse(value)).toEqual(value);
        expect(
            itemQuerySchema.parse({ game: "poe1", sourcePreparation: value }).sourcePreparation,
        ).toEqual(value);
    }
    for (const value of [
        { ...profile, fractureId: "target" },
        { ...profile, crafted: "false" },
        { ...profile, kind: "unknown" },
    ])
        expect(sourcePreparationProfileSchema.safeParse(value).success).toBe(false);
    const oldModel = {
        ...model,
        bases: model.bases.map(({ scourImplicits: _native, ...base }) => base),
    };
    expect(compileSourcePreparation(textModel, oldModel)(source(), profile)).toEqual({
        status: "unknown",
    });
});

it("projects supported native bases in all cleanup partitions without resolving disposable identities", () => {
    for (const base of model.bases)
        for (const rarity of ["Magic", "Rare"] as const)
            for (const crafted of [false, true])
                for (const enchanted of [false, true]) {
                    const input = source(base, rarity);
                    if (crafted) input.item.craftedMods = ["Prefixes Cannot Be Changed"];
                    if (enchanted)
                        input.item.enchantMods = [
                            "Quality does not increase Defences",
                            "Grants +1% to Lightning Resistance per 2% Quality",
                        ];
                    const before = structuredClone(input);
                    const selected = { ...profile, crafted, enchanted };
                    const result = classify(input, selected);
                    expect(result.status).toBe("match");
                    if (result.status !== "match") throw new Error("Expected projected source.");
                    expect(result.record.item).toMatchObject({
                        rarity: "Normal",
                        frameType: 0,
                        ilvl: 86,
                        explicitMods: [],
                        craftedMods: [],
                        enchantMods: [],
                        fractured: false,
                    });
                    expect(result.record.item.implicitMods).toEqual(input.item.implicitMods);
                    expect(result.record.item.influences).toEqual(input.item.influences);
                    expect(result.record.item.sockets).toEqual(input.item.sockets);
                    expect(result.record.item.properties).toEqual(input.item.properties);
                    expect(result.record.facts).toMatchObject({
                        baseId: base.id,
                        itemClass: base.itemClass,
                        prefixes: 0,
                        suffixes: 0,
                        modifiersComplete: true,
                        statsComplete: false,
                    });
                    expect(result.record.facts.modifiers).toEqual(
                        base.scourImplicits!.ids.map((id) => ({
                            id,
                            side: "implicit",
                            fractured: false,
                            crafted: false,
                        })),
                    );
                    expect(input).toEqual(before);
                    expect(classify(input, { ...selected, crafted: !crafted })).toEqual({
                        status: "no-match",
                    });
                    expect(classify(input, { ...selected, enchanted: !enchanted })).toEqual({
                        status: "no-match",
                    });
                    const query = itemQuerySchema.parse({
                        game: "poe1",
                        sourcePreparation: selected,
                        groups: [
                            { type: "and", filters: [{ kind: "rarity", values: ["Normal"] }] },
                        ],
                    });
                    expect(matchItem(result.record, query)).toBe("unknown");
                    const { sourcePreparation: _source, ...plain } = query;
                    expect(matchItem(result.record, plain)).toBe("match");
                }
});

it("accepts every pinned native roll and exact whitespace/link normalization only", () => {
    const base = model.bases[1]!;
    for (const texts of base.scourImplicits!.texts) {
        const input = source(base);
        input.item.implicitMods = texts;
        expect(classify(input, profile).status).toBe("match");
    }
    const input = source();
    input.item.implicitMods = ["  Scorch   Enemies when you [Block] their Damage  "];
    expect(classify(input, profile).status).toBe("match");
    for (const texts of [
        [],
        ["Unknown implicit"],
        ["Scorch Enemies when you Block their Damage", "+1 to maximum Life"],
        [
            "Scorch Enemies when you Block their Damage",
            "Scorch Enemies when you Block their Damage",
        ],
    ]) {
        input.item.implicitMods = texts;
        expect(classify(input, profile)).toEqual({ status: "unknown" });
    }
    input.item.implicitMods = ["+31 to maximum Life"];
    input.item.baseType = base.baseType;
    expect(classify(input, profile)).toEqual({ status: "unknown" });
    for (const noImplicit of model.bases.filter((base) => !base.scourImplicits!.ids.length)) {
        const empty = source(noImplicit);
        delete empty.item.implicitMods;
        expect(classify(empty, profile).status).toBe("match");
        empty.item.implicitMods = ["An extra persistent implicit"];
        expect(classify(empty, profile)).toEqual({ status: "unknown" });
    }
});

it("requires exact Two-Toned native identity and preserves every legal roll", () => {
    const boots = model.bases[4]!;
    const resolve = compileSourcePreparation(textModel, {
        ...model,
        bases: [
            ...model.bases,
            ...[2, 3].map((variant) => ({
                id: `Metadata/Items/Armours/Boots/BootsAtlas${variant}`,
                baseType: "Two-Toned Boots",
                itemClass: "Boots" as const,
            })),
        ],
    });
    for (const texts of boots.scourImplicits!.texts) {
        const input = source(boots);
        input.facts.baseId = boots.id;
        input.facts.baseTypeAmbiguous = true;
        input.item.implicitMods = texts;
        const original = structuredClone(input);
        const result = resolve(input, profile);
        expect(result.status).toBe("match");
        if (result.status !== "match") throw new Error("Expected exact native boot source.");
        expect(result.record.item.implicitMods).toEqual(texts);
        expect(result.record.facts.baseId).toBe(boots.id);
        expect(input).toEqual(original);
    }
    for (const texts of [
        [],
        ["+7% to Cold and Lightning Resistances"],
        ["+13% to Cold and Lightning Resistances"],
        ["+10% to Fire and Cold Resistances"],
        ["+10% to Fire and Lightning Resistances"],
        ["+10% to Cold and Lightning Resistances", "An extra implicit"],
        ["+10% to Cold and Lightning Resistances", "+10% to Cold and Lightning Resistances"],
    ]) {
        const input = source(boots);
        input.facts.baseId = boots.id;
        input.item.implicitMods = texts;
        expect(resolve(input, profile)).toEqual({ status: "unknown" });
    }
    const ambiguous = source(boots);
    expect(resolve(ambiguous, profile)).toEqual({ status: "unknown" });
    for (const variant of [2, 3]) {
        const input = source(boots);
        input.facts.baseId = `Metadata/Items/Armours/Boots/BootsAtlas${variant}`;
        expect(resolve(input, profile)).toEqual({ status: "unknown" });
    }
    const conflicting = source(boots);
    conflicting.facts.baseId = boots.id;
    conflicting.facts.modifiers = [{ id: "FireAndColdResistImplicitBoots1_", side: "implicit" }];
    expect(resolve(conflicting, profile)).toEqual({ status: "unknown" });
});

it("keeps prior native-proof models and unsupported persistent state conservative for new bases", () => {
    const prior = compileSourcePreparation(textModel, {
        ...model,
        bases: model.bases.map((base, index) => {
            if (index < 4) return base;
            const { scourImplicits: _native, ...withoutProof } = base;
            return withoutProof;
        }),
    });
    for (const base of model.bases.slice(4)) {
        expect(prior(source(base), profile)).toEqual({ status: "unknown" });
        for (const field of [
            "searing",
            "tangled",
            "fractured",
            "synthesised",
            "corrupted",
            "memoryItem",
        ]) {
            const input = source(base);
            input.item[field] = true;
            expect(classify(input, profile)).toEqual({ status: "no-match" });
        }
        const input = source(base);
        input.item.unknownPersistentFlag = true;
        expect(classify(input, profile)).toEqual({ status: "unknown" });
    }
});

it("refuses fractures in every supported representation and contradictory persistent identities", () => {
    const fractures: Array<(input: ItemRecord) => void> = [
        (input) => {
            input.item.fractured = true;
        },
        (input) => {
            input.item.fracturedMods = ["Protected affix"];
        },
        (input) => {
            input.item.explicitMods = [
                { description: "Protected affix", flags: { fractured: true } },
            ];
        },
        (input) => {
            input.facts.modifiers = [{ id: "protected", side: "prefix", fractured: true }];
        },
    ];
    for (const mutate of fractures) {
        const input = source();
        mutate(input);
        expect(classify(input, profile).status).toBe("no-match");
    }
    const input = source();
    input.item.fractured = false;
    input.item.fracturedMods = ["Contradictory fracture"];
    expect(classify(input, profile)).toEqual({ status: "unknown" });
    for (const modifiers of [
        [{ id: "other", side: "implicit" as const }],
        [
            {
                possibleIds: ["other", model.bases[0]!.scourImplicits!.ids[0]!],
                side: "implicit" as const,
            },
        ],
        [{ id: model.bases[0]!.scourImplicits!.ids[0]!, side: "implicit" as const, crafted: true }],
        Array.from({ length: 2 }, () => ({
            id: model.bases[0]!.scourImplicits!.ids[0]!,
            side: "implicit" as const,
        })),
    ]) {
        const conflict = source();
        conflict.facts.modifiers = modifiers;
        expect(classify(conflict, profile)).toEqual({ status: "unknown" });
    }
});

it("requires marked crafted protections to be removed and rejects conflicting representations", () => {
    for (const description of [
        "Prefixes Cannot Be Changed",
        "Suffixes Cannot Be Changed",
        "Cannot roll Attack Modifiers",
        "Cannot roll Caster Modifiers",
        "Can have up to 3 Crafted Modifiers",
    ]) {
        const input = source();
        input.item.explicitMods = [description];
        expect(classify(input, profile)).toEqual({ status: "unknown" });
        input.item.explicitMods = [{ description, flags: { crafted: true } }];
        expect(classify(input, { ...profile, crafted: true }).status).toBe("match");
        input.item.craftedMods = [description];
        expect(classify(input, { ...profile, crafted: true })).toEqual({ status: "unknown" });
    }
    const input = source();
    input.facts.modifiers = [{ id: "a-craft", side: "prefix", crafted: true }];
    expect(classify(input, profile)).toEqual({ status: "unknown" });
});

it("retains uncertainty for missing evidence and unsupported flags on every line array", () => {
    for (const field of [
        "explicitMods",
        "implicitMods",
        "craftedMods",
        "fracturedMods",
        "enchantMods",
    ]) {
        const input = source();
        input.item[field] = [{ description: "Unrevealed", flags: { desecrated: true } }];
        expect(
            classify(input, {
                ...profile,
                crafted: field === "craftedMods",
                enchanted: field === "enchantMods",
            }),
        ).toEqual({ status: "unknown" });
    }
    for (const mutate of [
        (input: ItemRecord) => {
            delete input.item.identified;
        },
        (input: ItemRecord) => {
            input.item.unknownPersistentFlag = true;
        },
        (input: ItemRecord) => {
            input.item.memoryStrands = 2;
        },
        (input: ItemRecord) => {
            input.item.intangibility = 10;
        },
        (input: ItemRecord) => {
            input.item.scourgeMods = ["Persistent"];
        },
        (input: ItemRecord) => {
            input.item.crucibleMods = ["Persistent"];
        },
        (input: ItemRecord) => {
            input.item.runeMods = ["Persistent"];
        },
        (input: ItemRecord) => {
            input.item.influences = { unknown: true };
        },
        (input: ItemRecord) => {
            input.item.extended = { prefixes: 2 };
            input.facts.prefixes = 1;
        },
        (input: ItemRecord) => {
            input.item.extended = { prefixes: 2 };
            input.facts.prefixes = 2;
        },
        (input: ItemRecord) => {
            input.item.frameType = 2;
        },
        (input: ItemRecord) => {
            input.facts.itemClass = "One Hand Sword";
        },
        (input: ItemRecord) => {
            input.facts.baseTypeAmbiguous = true;
        },
    ]) {
        const input = source();
        mutate(input);
        expect(classify(input, profile)).toEqual({ status: "unknown" });
    }
});

it("does not extend the retained fractured-fossil policy to Shields", () => {
    const input = source();
    input.item.rarity = "Rare";
    input.item.fractured = true;
    input.item.influences = {};
    input.item.explicitMods = [{ description: "Fractured", flags: { fractured: true } }];
    expect(
        classify(input, {
            kind: "fractured-fossil-v1",
            fractureId: "target",
            crafted: false,
            enchanted: false,
        }),
    ).toEqual({ status: "no-match" });
});

it("returns definite ineligibility without spurious unknown observations", () => {
    for (const field of [
        "corrupted",
        "duplicated",
        "synthesised",
        "sanctified",
        "mutated",
        "memoryItem",
        "allflameCrafted",
        "searing",
        "tangled",
    ]) {
        const input = source();
        input.item[field] = true;
        expect(classify(input, profile)).toEqual({ status: "no-match" });
    }
    for (const mutate of [
        (input: ItemRecord) => {
            input.game = "poe2";
        },
        (input: ItemRecord) => {
            input.item.rarity = "Normal";
        },
        (input: ItemRecord) => {
            input.item.rarity = "Unique";
        },
        (input: ItemRecord) => {
            input.item.identified = false;
        },
        (input: ItemRecord) => {
            input.facts.baseId = "other";
        },
    ]) {
        const input = source();
        mutate(input);
        expect(classify(input, profile)).toEqual({ status: "no-match" });
    }
});
