import { expect, it } from "vite-plus/test";
import {
    compileModifierTextModel,
    compileSourcePreparation as compileResult,
    type FracturedFossilSourcePreparation,
    fracturedFossilSourcePreparationSchema,
    type ItemRecord,
    itemQuerySchema,
    type ModifierTextModel,
    matchItem,
    normalizeApiItem,
    type SourcePreparationModel,
    sourcePreparationModelSchema,
} from "../src/index.ts";

const target = "critical-fracture";
const text = "Critical Strike Chance is increased by Overcapped Lightning Resistance";
const profile: FracturedFossilSourcePreparation = {
    kind: "fractured-fossil-v1",
    fractureId: target,
    crafted: false,
    enchanted: false,
};
const model: ModifierTextModel = {
    format: 4,
    modifiers: [
        { id: target, name: "of Esh", side: "suffix", groups: ["critical"], crafted: false, text },
    ],
    bases: [{ baseType: "Conquest Lamellar" }],
    unsupportedImplicitTexts: ["(5-15)% increased Explicit Modifier magnitudes"],
};
const sourceModel: SourcePreparationModel = {
    format: 1,
    bases: [{ id: "conquest", baseType: "Conquest Lamellar", itemClass: "Body Armour" }],
};
function compileSourcePreparation(...args: Parameters<typeof compileResult>) {
    const classify = compileResult(...args);
    return (...input: Parameters<typeof classify>) => {
        const result = classify(...input);
        return result.status === "match" ? result.record : null;
    };
}
function source() {
    return normalizeApiItem("poe1", "stash", {
        baseType: "Conquest Lamellar",
        ilvl: 86,
        rarity: "Rare",
        identified: true,
        fractured: true,
        extended: { prefixes: 3, suffixes: 3 },
        explicitMods: [
            { description: "Unknown removable prefix" },
            { description: "Another removable suffix" },
            { description: text, flags: { fractured: true } },
        ],
    });
}
const project = compileSourcePreparation(model, sourceModel);
const query = itemQuerySchema.parse({
    game: "poe1",
    sourcePreparation: profile,
    groups: [
        {
            type: "and",
            filters: [
                { kind: "base", field: "baseId", values: ["conquest"] },
                { kind: "rarity", values: ["Rare"] },
                {
                    kind: "mod",
                    ids: [target],
                    side: "suffix",
                    fractured: true,
                    count: { min: 1, max: 1 },
                },
                { kind: "range", field: "prefixes", value: { min: 0, max: 0 } },
                { kind: "range", field: "suffixes", value: { min: 1, max: 1 } },
            ],
        },
    ],
});

it("projects the sole protected fracture without resolving disposable extras or changing ordinary facts", () => {
    const input = source();
    const before = structuredClone(input);
    const ordinary = compileModifierTextModel(model)(input);
    const projected = project(input, profile)!;
    expect(projected).not.toBeNull();
    expect(projected.facts).toMatchObject({
        baseId: "conquest",
        prefixes: 0,
        suffixes: 1,
        modifiersComplete: false,
    });
    expect(projected.facts.modifiers).toEqual([
        {
            id: target,
            name: "of Esh",
            side: "suffix",
            tier: undefined,
            fractured: true,
            crafted: false,
        },
    ]);
    expect(matchItem(input, query)).toBe("unknown");
    expect(matchItem(projected, query)).toBe("unknown");
    const { sourcePreparation: _preparation, ...ordinaryQuery } = query;
    expect(matchItem(projected, ordinaryQuery)).toBe("match");
    expect(ordinary).toBe(input);
    expect(input).toEqual(before);
});

it("separates all four actual crafted and enchantment presence classes", () => {
    for (const crafted of [false, true])
        for (const enchanted of [false, true]) {
            const input = source();
            if (crafted)
                input.item.explicitMods!.push({
                    description: "Prefixes Cannot Be Changed",
                    flags: { crafted: true },
                });
            if (enchanted)
                input.item.enchantMods = [
                    "Quality does not increase Defences",
                    "Grants +1% to Lightning Resistance per 2% Quality",
                ];
            input.item.searing = true;
            input.item.tangled = true;
            input.item.implicitMods = [{ description: "An old replaceable Eldritch implicit" }];
            expect(project(input, { ...profile, crafted, enchanted })?.item).toMatchObject({
                craftedMods: [],
                enchantMods: [],
                implicitMods: [],
            });
            expect(project(input, { ...profile, crafted: !crafted, enchanted })).toBeNull();
            expect(project(input, { ...profile, crafted, enchanted: !enchanted })).toBeNull();
        }
});

it("accepts the separate fracture/crafted representation without double-counting mixed representations", () => {
    const input = source();
    input.item.explicitMods = ["Opaque disposable affix"];
    input.item.fracturedMods = [text];
    input.item.craftedMods = ["Suffixes Cannot Be Changed"];
    expect(project(input, { ...profile, crafted: true })).not.toBeNull();
    input.item.explicitMods.push({ description: text, flags: { fractured: true } });
    expect(project(input, { ...profile, crafted: true })).toBeNull();
});

it("refuses multiple, ambiguous, unrenderable and contradictory fractures", () => {
    const second = {
        id: "life",
        name: "Healthy",
        side: "prefix" as const,
        groups: ["life"],
        crafted: false,
        text: "+(10-20) to maximum Life",
    };
    const withSecond = compileSourcePreparation(
        { ...model, modifiers: [...model.modifiers, second] },
        sourceModel,
    );
    const input = source();
    input.item.explicitMods!.push({
        description: "+15 to maximum Life",
        flags: { fractured: true },
    });
    expect(withSecond(input, profile)).toBeNull();
    for (const extra of [
        { ...model.modifiers[0]!, id: "alias" },
        { ...second, text: null },
        { ...second, text: "", unsupported: true },
    ])
        expect(
            compileSourcePreparation(
                { ...model, modifiers: [...model.modifiers, extra] },
                sourceModel,
            )(source(), profile),
        ).toBeNull();
    const inconsistent = source();
    inconsistent.facts.modifiers = [{ id: "other", side: "prefix", fractured: true }];
    expect(project(inconsistent, profile)).toBeNull();
    inconsistent.facts.modifiers = [];
    inconsistent.item.extended = { prefixes: 2, suffixes: 3 };
    expect(project(inconsistent, profile)).toBeNull();
});

it("keeps numeric and multiline fracture ambiguity instead of counting display lines as mods", () => {
    const mods: ModifierTextModel["modifiers"] = [
        {
            id: "hybrid",
            name: "Hybrid",
            side: "prefix",
            groups: ["hybrid"],
            crafted: false,
            text: "+(10-20) to maximum Life\n+(10-20) to maximum Mana",
        },
        {
            id: "life",
            name: "Life",
            side: "prefix",
            groups: ["life"],
            crafted: false,
            text: "+(10-20) to maximum Life",
        },
        {
            id: "mana",
            name: "Mana",
            side: "suffix",
            groups: ["mana"],
            crafted: false,
            text: "+(10-20) to maximum Mana",
        },
    ];
    const input = source();
    input.item.explicitMods = [
        { description: "+15 to maximum Life", flags: { fractured: true } },
        { description: "+15 to maximum Mana", flags: { fractured: true } },
    ];
    const one = compileSourcePreparation({ ...model, modifiers: [mods[0]!] }, sourceModel);
    expect(one(input, { ...profile, fractureId: "hybrid" })?.facts.modifiers[0]?.id).toBe("hybrid");
    const ambiguous = compileSourcePreparation({ ...model, modifiers: mods }, sourceModel);
    expect(ambiguous(input, { ...profile, fractureId: "hybrid" })).toBeNull();
});

it("excludes only the three temporary Energy Blade placeholders from catalogue-proven armour", () => {
    const placeholders = [
        "StormBladeExplicitLocalIncreasedCriticalStrikeChance",
        "StormBladeExplicitShockChance",
        "StormBladeExplicitAttackLightningConvertToChaos",
    ].map((id) => ({
        id,
        name: id,
        side: "prefix" as const,
        groups: [id],
        crafted: false,
        text: "",
        unsupported: true,
    }));
    const input = source();
    const expanded = { ...model, modifiers: [...model.modifiers, ...placeholders] };
    expect(compileSourcePreparation(expanded, sourceModel)(input, profile)).not.toBeNull();
    expect(compileModifierTextModel(expanded)(input)).toBe(input);
    const other = { ...placeholders[0]!, id: "unrelated-invisible" };
    expect(
        compileSourcePreparation(
            { ...expanded, modifiers: [...expanded.modifiers, other] },
            sourceModel,
        )(input, profile),
    ).toBeNull();
    expect(compileSourcePreparation(expanded, { format: 1, bases: [] })(input, profile)).toBeNull();
});

it("refuses magnitude-changing enchants, hidden flags, protected fractures and unmarked metamods", () => {
    const mutations: Array<(input: ItemRecord) => void> = [
        (input) => {
            input.item.enchantMods = ["10% increased Explicit Modifier magnitudes"];
        },
        (input) => {
            input.item.explicitMods!.push({ description: "Hidden", flags: { unknown: true } });
        },
        (input) => {
            input.item.explicitMods!.push({ description: "Veiled Prefix" });
        },
        (input) => {
            input.item.explicitMods = [
                { description: text, flags: { fractured: true, crafted: true } },
            ];
        },
        (input) => {
            input.item.explicitMods!.push({ description: "Prefixes Cannot Be Changed" });
        },
        (input) => {
            input.item.fracturedMods = ["Unrevealed"];
            input.item.explicitMods = [];
        },
        (input) => {
            input.item.craftedMods = ["Unrevealed"];
        },
    ];
    for (const mutate of mutations) {
        const input = source();
        mutate(input);
        expect(
            project(input, {
                ...profile,
                enchanted: Boolean(input.item.enchantMods),
                crafted: Boolean(input.item.craftedMods),
            }),
        ).toBeNull();
    }
});

it("refuses unusable or uncertain source flags and non-eligible canonical bases", () => {
    for (const field of [
        "corrupted",
        "duplicated",
        "synthesised",
        "sanctified",
        "mutated",
        "memoryItem",
        "unknownPersistentFlag",
    ]) {
        const input = source();
        input.item[field] = true;
        expect(project(input, profile)).toBeNull();
    }
    for (const field of ["scourgeMods", "crucibleMods", "veiledMods", "runeMods", "mutatedMods"]) {
        const input = source();
        input.item[field] = ["Unknown"];
        expect(project(input, profile)).toBeNull();
    }
    for (const mutate of [
        (input: ItemRecord) => {
            input.item.identified = false;
        },
        (input: ItemRecord) => {
            input.item.fractured = false;
        },
        (input: ItemRecord) => {
            input.item.rarity = "Magic";
        },
        (input: ItemRecord) => {
            input.game = "poe2";
        },
        (input: ItemRecord) => {
            input.item.influences = { shaper: true };
        },
        (input: ItemRecord) => {
            input.facts.baseId = "other";
        },
        (input: ItemRecord) => {
            input.facts.memoryStrands = 1;
        },
    ]) {
        const input = source();
        mutate(input);
        expect(project(input, profile)).toBeNull();
    }
    const ambiguous = {
        ...sourceModel,
        bases: [...sourceModel.bases, { ...sourceModel.bases[0]!, id: "other" }],
    };
    expect(compileSourcePreparation(model, ambiguous)(source(), profile)).toBeNull();
});

it("uses strict serializable policy fields and fails closed when the solver exhausts its budget", () => {
    expect(fracturedFossilSourcePreparationSchema.parse(profile)).toEqual(profile);
    expect(
        fracturedFossilSourcePreparationSchema.safeParse({ ...profile, crafted: "yes" }).success,
    ).toBe(false);
    expect(
        fracturedFossilSourcePreparationSchema.safeParse({ ...profile, arbitrary: true }).success,
    ).toBe(false);
    expect(compileSourcePreparation(model, sourceModel, 1)(source(), profile)).toBeNull();
});

it("accepts preparation model formats 1 and 2 without changing the source projection", () => {
    const legacy = compileResult(model, sourceModel);
    const current = compileResult(model, { ...sourceModel, format: 2 });
    const input = source();
    expect(current(input, profile)).toEqual(legacy(input, profile));
    input.item.explicitMods = [];
    expect(current(input, profile)).toEqual({ status: "unknown" });
    expect(current(input, profile)).toEqual(legacy(input, profile));
    expect(sourcePreparationModelSchema.safeParse({ ...sourceModel, format: 6 }).success).toBe(
        false,
    );
});

it("preserves fractured source results when model 5 adds influence-ready eligibility", () => {
    const previous = compileResult(model, { ...sourceModel, format: 4 });
    const current = compileResult(model, { ...sourceModel, format: 5 });
    for (const change of [{}, { corrupted: true }, { intangibility: 84 }, { explicitMods: [] }]) {
        const input = source();
        Object.assign(input.item, change);
        expect(current(input, profile)).toEqual(previous(input, profile));
    }
    expect(current(source(), profile).status).toBe("match");
});

it("excludes positive Intangibility properties only in preparation model 3", () => {
    const property = {
        name: "[Intangibility|Intangibility]",
        values: [["84%", 0]],
        displayMode: 0,
        type: 110,
    };
    const input = source();
    input.item.properties = [property];
    const before = structuredClone(input);
    for (const format of [1, 2] as const)
        expect(compileResult(model, { ...sourceModel, format })(input, profile).status).toBe(
            "match",
        );
    const current = compileResult(model, { ...sourceModel, format: 3 });
    for (const name of ["Intangibility", "[Intangibility]", property.name]) {
        input.item.properties = [{ ...property, name }];
        expect(current(input, profile)).toEqual({ status: "no-match" });
    }
    input.item.properties = [property];
    input.item.intangibility = 84;
    expect(current(input, profile)).toEqual({ status: "no-match" });
    delete input.item.properties;
    expect(current(input, profile)).toEqual({ status: "no-match" });
    delete input.item.intangibility;
    input.item.properties = [property];
    expect(input).toEqual(before);
});

it("preserves absent and proven zero Intangibility for fractured preparation", () => {
    const current = compileResult(model, { ...sourceModel, format: 3 });
    const input = source();
    expect(current(input, profile).status).toBe("match");
    input.item.properties = [{ name: "Quality", values: [["+20%", 1]], type: 6 }];
    expect(current(input, profile).status).toBe("match");
    input.item.properties.push({ name: "Intangibility", values: [["0%", 0]] });
    expect(current(input, profile).status).toBe("match");
    input.item.intangibility = 0;
    expect(current(input, profile).status).toBe("match");
    delete input.item.properties;
    expect(current(input, profile).status).toBe("match");
});

it("keeps malformed, duplicate and contradictory Intangibility proof unknown", () => {
    const current = compileResult(model, { ...sourceModel, format: 3 });
    const zero = { name: "Intangibility", type: 110, values: [["0%", 0]] };
    for (const properties of [
        null,
        [null],
        [[]],
        [{ ...zero, name: "Armour" }],
        [{ type: 110, values: [["0%", 0]] }],
        [{ ...zero, type: 6 }],
        [{ name: "Intangibility", type: 110 }],
        [{ ...zero, values: [] }],
        [
            {
                ...zero,
                values: [
                    ["0%", 0],
                    ["1%", 0],
                ],
            },
        ],
        [{ ...zero, values: [[0, 0]] }],
        ...["-1%", "101%", "0.5%", "unknown"].map((value) => [{ ...zero, values: [[value, 0]] }]),
        [zero, zero],
        [zero, { ...zero, values: [["84%", 0]] }],
    ]) {
        const input = source();
        input.item.properties = properties;
        expect(current(input, profile)).toEqual({ status: "unknown" });
    }
    for (const [top, value] of [
        [0, "84%"],
        [84, "0%"],
        ["0", "0%"],
    ] as const) {
        const input = source();
        input.item.intangibility = top;
        input.item.properties = [{ ...zero, values: [[value, 0]] }];
        expect(current(input, profile)).toEqual({ status: "unknown" });
    }
});

it("reports definite partition and eligibility mismatches without creating unknown observations", () => {
    const classify = compileResult(model, sourceModel);
    const input = source();
    expect(classify(input, profile).status).toBe("match");
    expect(classify(input, { ...profile, crafted: true })).toEqual({ status: "no-match" });
    expect(classify(input, { ...profile, enchanted: true })).toEqual({ status: "no-match" });
    expect(classify(input, { ...profile, fractureId: "other" })).toEqual({ status: "no-match" });
    for (const rarity of ["Normal", "Magic", "Unique"] as const) {
        expect(classify({ ...input, item: { ...input.item, rarity } }, profile)).toEqual({
            status: "no-match",
        });
    }
    expect(classify({ ...input, item: { ...input.item, fractured: false } }, profile)).toEqual({
        status: "no-match",
    });
    expect(classify({ ...input, item: { ...input.item, corrupted: true } }, profile)).toEqual({
        status: "no-match",
    });
    expect(classify({ ...input, item: { ...input.item, baseType: "Other" } }, profile)).toEqual({
        status: "no-match",
    });
    expect(classify({ ...input, game: "poe2" }, profile)).toEqual({ status: "no-match" });
});

it("retains uncertainty for absent evidence, contradictory counts and hidden persistent state", () => {
    const classify = compileResult(model, sourceModel);
    for (const mutate of [
        (input: ItemRecord) => {
            delete input.item.identified;
        },
        (input: ItemRecord) => {
            input.item.explicitMods = [];
        },
        (input: ItemRecord) => {
            input.item.unknownFlag = true;
        },
        (input: ItemRecord) => {
            input.item.intangibility = 10;
        },
        (input: ItemRecord) => {
            input.item.suffixes = 0;
            input.item.extended = { suffixes: 0 };
            input.facts.suffixes = 0;
        },
    ]) {
        const input = source();
        mutate(input);
        expect(classify(input, profile)).toEqual({ status: "unknown" });
    }
    expect(compileResult(model, sourceModel, 1)(source(), profile)).toEqual({ status: "unknown" });
});
