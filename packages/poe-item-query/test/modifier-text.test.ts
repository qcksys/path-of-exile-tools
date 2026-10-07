import { expect, it } from "vite-plus/test";
import {
    compileModifierTextModel,
    itemQuerySchema,
    itemQuerySelectionSchema,
    type ModifierTextModel,
    matchItem,
    normalizeApiItem,
    queryFromItem,
} from "../src/index.ts";

const modifiers: ModifierTextModel["modifiers"] = [
    {
        id: "physical",
        name: "Physical",
        side: "prefix",
        groups: ["physical"],
        crafted: false,
        text: "(100-120)% increased Physical Damage",
    },
    {
        id: "hybrid",
        name: "Hybrid",
        side: "prefix",
        groups: ["hybrid"],
        crafted: false,
        text: "(30-40)% increased Physical Damage\n+(100-120) to Accuracy Rating",
    },
    {
        id: "accuracy",
        name: "Accuracy",
        side: "suffix",
        groups: ["accuracy"],
        crafted: false,
        text: "+(100-120) to Accuracy Rating",
    },
    {
        id: "cold",
        name: "Cold",
        side: "suffix",
        groups: ["cold"],
        crafted: false,
        text: "+(46-48)% to Cold Resistance",
    },
    {
        id: "temple",
        name: "Temple",
        side: "suffix",
        groups: ["cold"],
        crafted: false,
        text: "+(46-48)% to Cold Resistance\n(30-50)% increased Damage with Hits against Chilled Enemies",
    },
];
const model = (mods = modifiers): ModifierTextModel => ({
    format: 1,
    modifiers: mods,
    bases: [{ baseType: "Axe", modifiers: mods.map((mod) => ({ id: mod.id, tier: 1 })) }],
});
function item(descriptions: string[], prefixes: number, suffixes: number, fractured = false) {
    return normalizeApiItem("poe1", "stash", {
        baseType: "Axe",
        rarity: "Rare",
        identified: true,
        explicitMods: descriptions.map((description) => ({ description, flags: { fractured } })),
        extended: { prefixes, suffixes },
    });
}

it("recovers a compound modifier from combined displayed stats and source affix counts", () => {
    const input = item(
        ["140% increased Physical Damage", "+110 to Accuracy Rating", "+47% to Cold Resistance"],
        2,
        1,
    );
    const result = compileModifierTextModel(model())(input);
    expect(result.facts.modifiers.map((mod) => mod.id).sort()).toEqual([
        "cold",
        "hybrid",
        "physical",
    ]);
    expect(result.item).toBe(input.item);
    expect(input.facts.modifiers).toEqual([]);
});

it("does not confuse separate physical damage and accuracy with the hybrid affix", () => {
    const result = compileModifierTextModel(model())(
        item(["110% increased Physical Damage", "+110 to Accuracy Rating"], 1, 1),
    );
    expect(result.facts.modifiers.map((mod) => mod.id).sort()).toEqual(["accuracy", "physical"]);
});

it("retains only identities shared by every complete interpretation", () => {
    const alternate = { ...modifiers[0]!, id: "alternate" };
    const result = compileModifierTextModel(model([...modifiers, alternate]))(
        item(["110% increased Physical Damage", "+47% to Cold Resistance"], 1, 1),
    );
    expect(result.facts.modifiers.map((mod) => mod.id)).toEqual(["cold"]);
    expect(result.facts.modifiersComplete).toBe(false);
});

it("keeps fracture flags separate and requires all lines of a Temple modifier", () => {
    const resolve = compileModifierTextModel(model());
    expect(resolve(item(["+47% to Cold Resistance"], 0, 1, true)).facts.modifiers).toMatchObject([
        { id: "cold", fractured: true, crafted: false },
    ]);
    expect(
        resolve(
            item(
                [
                    "+47% to Cold Resistance",
                    "40% increased Damage with Hits against Chilled Enemies",
                ],
                0,
                1,
            ),
        ).facts.modifiers,
    ).toMatchObject([{ id: "temple" }]);
    const input = item(
        ["+47% to Cold Resistance", "40% increased Damage with Hits against Chilled Enemies"],
        0,
        1,
    );
    input.item.explicitMods = [
        { description: "+47% to Cold Resistance", flags: { fractured: true } },
        { description: "40% increased Damage with Hits against Chilled Enemies" },
    ];
    expect(resolve(input)).toBe(input);
});

it("does not combine mutually exclusive affixes or count rows as affixes", () => {
    const input = item(["220% increased Physical Damage"], 2, 0);
    expect(
        compileModifierTextModel(model([...modifiers, { ...modifiers[0]!, id: "lower" }]))(input),
    ).toBe(input);
    const missing = item(["110% increased Physical Damage"], 1, 0);
    delete missing.item.extended;
    expect(compileModifierTextModel(model())(missing)).toBe(missing);
});

it("returns unknown for incomplete searches, translations or unsupported magnitude rules", () => {
    const input = item(["110% increased Physical Damage", "+47% to Cold Resistance"], 1, 1);
    expect(compileModifierTextModel(model(), 1)(input)).toBe(input);
    expect(
        compileModifierTextModel(
            model([...modifiers, { ...modifiers[0]!, id: "missing", text: null }]),
        )(input),
    ).toBe(input);
    expect(
        compileModifierTextModel(
            model(modifiers.map((mod) => ({ ...mod, unsupported: mod.id === "physical" }))),
        )(input),
    ).toBe(input);
    const unsupported = model();
    unsupported.bases[0]!.unsupported = true;
    expect(compileModifierTextModel(unsupported)(input)).toBe(input);
});

it("matches literal punctuation, decimal ranges and game-text links", () => {
    const definition = {
        ...modifiers[0]!,
        text: "Regenerate (1.5-2.1) [Life|Life] per second (Local)",
    };
    const resolve = compileModifierTextModel(model([definition]));
    expect(
        resolve(item(["Regenerate 1.7 Life per second (Local)"], 1, 0)).facts.modifiers,
    ).toMatchObject([{ id: "physical" }]);
    expect(resolve(item(["Regenerate 1.7 Life per second Local"], 1, 0)).facts.modifiers).toEqual(
        [],
    );
});

it("separates crafted and natural modifiers with identical displayed values", () => {
    const crafted = { ...modifiers[3]!, id: "crafted", crafted: true };
    const input = item(["+47% to Cold Resistance"], 0, 1);
    input.item.explicitMods = [
        { description: "+47% to Cold Resistance", flags: { crafted: true } },
    ];
    expect(
        compileModifierTextModel(model([...modifiers, crafted]))(input).facts.modifiers,
    ).toMatchObject([{ id: "crafted", crafted: true, fractured: false }]);
});

it("accepts reversed and externally signed ranges without losing the sign", () => {
    const definition = { ...modifiers[0]!, text: "-(8-4) to Total Mana Cost of Skills" };
    const resolve = compileModifierTextModel(model([definition]));
    expect(resolve(item(["-6 to Total Mana Cost of Skills"], 1, 0)).facts.modifiers).toMatchObject([
        { id: "physical" },
    ]);
    expect(resolve(item(["+6 to Total Mana Cost of Skills"], 1, 0)).facts.modifiers).toEqual([]);
});

it("rejects modifiers whose displayed magnitudes have unsupported item effects", () => {
    const input = item(["+47% to Cold Resistance"], 0, 1);
    const definition = {
        ...model(),
        unsupportedImplicitTexts: ["(20-50)% increased Explicit Modifier magnitudes"],
    };
    input.item.implicitMods = ["40% increased Explicit Modifier magnitudes"];
    expect(compileModifierTextModel(definition)(input)).toBe(input);
    delete input.item.implicitMods;
    input.item.enchantMods = ["Resistance Modifiers have 8% increased Effect"];
    expect(compileModifierTextModel(definition)(input)).toBe(input);
});

it("represents an indistinguishable affix as one bounded identity choice, without claiming either ID", () => {
    const data = model([...modifiers, { ...modifiers[4]!, id: "legacy-temple" }]);
    data.identityFamilies = [["temple", "legacy-temple"]];
    const resolved = compileModifierTextModel(data)(
        item(
            ["+47% to Cold Resistance", "40% increased Damage with Hits against Chilled Enemies"],
            0,
            1,
        ),
    );
    expect(resolved.facts.modifiers).toHaveLength(1);
    expect(resolved.facts.modifiers[0]).toMatchObject({
        possibleIds: ["legacy-temple", "temple"],
        side: "suffix",
        fractured: false,
        crafted: false,
    });
    expect(resolved.facts.modifiers[0]?.id).toBeUndefined();
    const query = (ids: string[], min = 1) =>
        itemQuerySchema.parse({
            game: "poe1",
            groups: [{ type: "and", filters: [{ kind: "mod", ids, count: { min } }] }],
        });
    expect(matchItem(resolved, query(["temple"]))).toBe("unknown");
    expect(matchItem(resolved, query(["temple", "legacy-temple"]))).toBe("match");
    expect(matchItem(resolved, query(["temple", "legacy-temple"], 2))).toBe("unknown");
    const exported = queryFromItem(
        resolved,
        itemQuerySelectionSchema.parse({ minimumLevel: false }),
    );
    expect(exported.query.groups.flatMap((group) => group.filters)).toContainEqual(
        expect.objectContaining({ kind: "mod", ids: ["legacy-temple", "temple"] }),
    );
    expect(
        exported.warnings.some((warning) => warning.includes("multiple possible identities")),
    ).toBe(true);
});

it("rejects identity families with conflicting affix properties or repeated membership", () => {
    expect(() =>
        compileModifierTextModel({ ...model(), identityFamilies: [["cold", "temple"]] }),
    ).toThrow("identical displayed affixes");
    const data = model([...modifiers, { ...modifiers[4]!, id: "legacy-temple" }]);
    expect(() =>
        compileModifierTextModel({
            ...data,
            identityFamilies: [
                ["temple", "legacy-temple"],
                ["temple", "legacy-temple"],
            ],
        }),
    ).toThrow("overlapping");
});

it("accepts absent jewellery quality but withholds scaled and malformed property contexts", () => {
    const data = model();
    data.bases[0]!.catalystProperties = ["Quality (Resistance Modifiers)"];
    const resolve = compileModifierTextModel(data);
    const input = item(["+47% to Cold Resistance"], 0, 1, true);
    expect(resolve(input).facts.modifiers).toMatchObject([{ id: "cold" }]);
    for (const properties of [
        [{ name: "Quality (Resistance Modifiers)", values: [["+20%", 1]], type: 6 }],
        [{ name: "Unrecognized quality", values: [["+10%", 1]] }],
        [{ name: "Future label", values: [["+10%", 1]], type: 6 }],
        [{ values: [["+10%", 1]] }],
        {},
    ]) {
        const scaled = { ...input, item: { ...input.item, properties } };
        expect(resolve(scaled)).toBe(scaled);
    }
});

it("uses catalyst-specific ranges without mistaking a lower raw tier for an unscaled top tier", () => {
    const name = "Quality (Resistance Modifiers)";
    const data = model([
        modifiers[3]!,
        { ...modifiers[3]!, id: "cold-low", text: "+(36-40)% to Cold Resistance" },
    ]);
    data.bases[0]!.catalystProperties = [name];
    data.bases[0]!.modifiers![1]!.tier = 2;
    data.catalysts = [{ name, maximum: 20 }];
    data.translations = {
        statDescriptions: [
            {
                ids: ["cold"],
                rules: [{ conditions: ["#"], text: "+{0}% to Cold Resistance", handlers: [] }],
            },
        ],
        statLookups: {},
    };
    for (const [index, mod] of data.modifiers.entries()) {
        mod.catalysts = [name];
        mod.scaling = {
            descriptions: [0],
            stats: [{ id: "cold", min: index ? 36 : 46, max: index ? 40 : 48, scalable: true }],
        };
    }
    const resolve = compileModifierTextModel(data);
    const input = item(["+47% to Cold Resistance"], 0, 1, true);
    input.item.properties = [{ name, type: 6, values: [["+20%", 1]] }];
    expect(resolve(input).facts.modifiers).toMatchObject([
        { id: "cold-low", tier: 2, fractured: true },
    ]);
    const top = {
        ...input,
        item: {
            ...input.item,
            explicitMods: [{ description: "+57% to Cold Resistance", flags: { fractured: true } }],
        },
    };
    expect(resolve(top).facts.modifiers).toMatchObject([{ id: "cold", tier: 1 }]);
    const invalid = {
        ...input,
        item: { ...input.item, properties: [{ name, type: 6, values: [["+21%", 1]] }] },
    };
    expect(resolve(invalid)).toBe(invalid);
});

it("adds native magnitude and catalyst effects only when the source confirms the native implicit", () => {
    const name = "Quality (Resistance Modifiers)";
    const data = model([modifiers[3]!]);
    const implicit = "100% increased Explicit Modifier magnitudes";
    data.unsupportedImplicitTexts = ["(10-100)% increased Explicit Modifier magnitudes"];
    data.bases[0]!.magnitude = { prefix: 100, suffix: 100, texts: [implicit] };
    data.bases[0]!.catalystProperties = [name];
    data.catalysts = [{ name, maximum: 20 }];
    data.translations = {
        statDescriptions: [
            {
                ids: ["cold"],
                rules: [{ conditions: ["#"], text: "+{0}% to Cold Resistance", handlers: [] }],
            },
        ],
        statLookups: {},
    };
    data.modifiers[0]!.catalysts = [name];
    data.modifiers[0]!.scaling = {
        descriptions: [0],
        stats: [{ id: "cold", min: 46, max: 48, scalable: true }],
    };
    const resolve = compileModifierTextModel(data);
    const input = item(["+103% to Cold Resistance"], 0, 1, true);
    input.item.properties = [{ name, type: 6, values: [["+20%", 1]] }];
    expect(resolve(input)).toBe(input);
    input.item.implicitMods = [{ description: implicit }];
    expect(resolve(input).facts.modifiers).toMatchObject([{ id: "cold", tier: 1 }]);
    input.item.implicitMods = [{ description: "50% increased Explicit Modifier magnitudes" }];
    expect(resolve(input)).toBe(input);
});
