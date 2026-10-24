import { expect, it } from "vite-plus/test";
import {
    compileFracturedModifierTextModel,
    compileModifierIdentities,
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
    format: 2,
    modifiers: mods,
    bases: [{ baseType: "Axe", modifiers: mods.map((mod) => ({ id: mod.id, tier: 1 })) }],
});
function item(
    descriptions: string[],
    prefixes: number | undefined,
    suffixes: number | undefined,
    fractured = false,
) {
    return normalizeApiItem("poe1", "stash", {
        baseType: "Axe",
        rarity: "Rare",
        identified: true,
        explicitMods: descriptions.map((description) => ({ description, flags: { fractured } })),
        extended: { prefixes, suffixes },
    });
}

const isolatedPhysical = itemQuerySchema.parse({
    game: "poe1",
    groups: [
        {
            type: "and",
            filters: [
                { kind: "mod", ids: ["physical"], count: { min: 1 } },
                { kind: "range", field: "prefixes", value: { min: 1, max: 1 } },
                { kind: "range", field: "suffixes", value: { min: 0, max: 0 } },
            ],
        },
    ],
});

const namedModifiers: ModifierTextModel["modifiers"] = [
    { ...modifiers[3]!, name: "of the Ice" },
    { ...modifiers[3]!, id: "cold-alias", name: "of Frost" },
    {
        id: "invisible",
        name: "Anomalous",
        side: "prefix",
        groups: ["invisible"],
        crafted: false,
        text: "",
        unsupported: true,
    },
];
function namedMagic(typeLine = "Axe of the Ice") {
    return normalizeApiItem("poe1", "stash", {
        baseType: "Axe",
        name: "",
        typeLine,
        rarity: "Magic",
        identified: true,
        explicitMods: [{ description: "+47% to Cold Resistance" }],
        extended: { suffixes: 1 },
    });
}

it("intersects complete Magic names with descriptions without forcing affix counts", () => {
    const input = namedMagic();
    const source = structuredClone(input);
    const resolved = compileModifierTextModel({ ...model(namedModifiers), format: 3 })(input);
    expect(resolved.facts).toMatchObject({ prefixes: 0, suffixes: 1, modifiersComplete: false });
    expect(resolved.facts.modifiers).toMatchObject([{ id: "cold" }]);
    expect(resolved.item).toBe(input.item);
    expect(input).toEqual(source);
    for (const format of [1, 2] as const)
        expect(compileModifierTextModel({ ...model(namedModifiers), format })(input)).toEqual(
            input,
        );
});

it.each([
    { typeLine: "Axe of the Ice", counts: { prefixes: 1, suffixes: 1 } },
    { typeLine: "Axe of the Ice", counts: { prefixes: 1, suffixes: 0 } },
    { typeLine: "Anomalous Axe of the Ice", counts: { prefixes: 0, suffixes: 1 } },
])("refuses conflicting Magic name, count and description evidence: $typeLine $counts", ({
    typeLine,
    counts,
}) => {
    const input = namedMagic(typeLine);
    input.item.extended = counts;
    expect(compileModifierTextModel({ ...model(namedModifiers), format: 3 })(input)).toEqual(input);
});

it("requires every displayed affix name to be explained by a complete text solution", () => {
    const input = namedMagic("Axe of Frost");
    const mods = namedModifiers.map((mod) =>
        mod.id === "cold-alias" ? { ...mod, text: "+(20-30)% to Cold Resistance" } : mod,
    );
    expect(compileModifierTextModel({ ...model(mods), format: 3 })(input)).toEqual(input);
    const bothMissing = namedMagic();
    bothMissing.item.extended = {};
    expect(compileModifierTextModel({ ...model(namedModifiers), format: 3 })(bothMissing)).toEqual(
        bothMissing,
    );
});

it("retains invisible blank-name alternatives and unsupported matching names", () => {
    for (const name of ["", "Anomalous"]) {
        const input = namedMagic(name ? "Anomalous Axe of the Ice" : "Axe of the Ice");
        const mods = namedModifiers.map((mod) => (mod.id === "invisible" ? { ...mod, name } : mod));
        expect(compileModifierTextModel({ ...model(mods), format: 3 })(input)).toEqual(input);
    }
});

it("keeps same-name identities ambiguous and blank-name counts uncertain", () => {
    const input = namedMagic();
    const aliases = namedModifiers
        .filter((mod) => mod.side === "suffix")
        .map((mod) => ({ ...mod, name: "of the Ice" }));
    const resolved = compileModifierTextModel({ ...model(aliases), format: 3 })(input);
    expect(resolved.facts.prefixes).toBe(0);
    expect(resolved.facts.modifiers).toEqual([]);
    const blank = namedModifiers.map((mod) =>
        mod.id === "invisible" ? { ...mod, name: "", unsupported: false } : mod,
    );
    const uncertain = compileModifierTextModel({ ...model(blank), format: 3 })(input);
    expect(uncertain.facts.prefixes).toBeUndefined();
    expect(uncertain.facts.modifiers).toMatchObject([{ id: "cold" }]);
});

it.each([
    "Axe",
    "Axe of Unknown",
    "Superior Axe of the Ice",
    "Fractured Axe of the Ice",
    "Axe of the Ice (augmented)",
    " Axe of the Ice",
    "Axe  of the Ice",
    "Axe Axe of the Ice",
])("does not constrain an incomplete, decorated or ambiguous typeLine: %s", (typeLine) => {
    const input = namedMagic(typeLine);
    expect(compileModifierTextModel({ ...model(namedModifiers), format: 3 })(input)).toEqual(input);
});

it("does not apply Magic names to crafted, fractured, special or non-Magic records", () => {
    const changes = [
        { name: "Nonempty Name" },
        { name: undefined },
        { rarity: "Rare" as const },
        { fractured: true },
        { split: true },
        { synthesised: true },
        { memoryItem: true },
        { craftedMods: ["+47% to Cold Resistance"] },
        { fracturedMods: ["+47% to Cold Resistance"] },
        { explicitMods: [{ description: "+47% to Cold Resistance", flags: { crafted: true } }] },
        { explicitMods: [{ description: "+47% to Cold Resistance", flags: { fractured: true } }] },
        { explicitMods: [{ description: "+47% to Cold Resistance", flags: { unknown: true } }] },
    ];
    for (const change of changes) {
        const input = namedMagic();
        Object.assign(input.item, change);
        expect(compileModifierTextModel({ ...model(namedModifiers), format: 3 })(input)).toEqual(
            compileModifierTextModel(model(namedModifiers))(input),
        );
    }
});

it.each([
    {
        descriptions: ["110% increased Physical Damage"],
        prefixes: 1,
        suffixes: undefined,
        id: "physical",
        expected: [1, 0],
    },
    {
        descriptions: ["+47% to Cold Resistance"],
        prefixes: undefined,
        suffixes: 1,
        id: "cold",
        expected: [0, 1],
    },
])("infers only the uniquely determined missing count for $id", ({
    descriptions,
    prefixes,
    suffixes,
    id,
    expected,
}) => {
    const input = item(descriptions, prefixes, suffixes);
    const source = structuredClone(input);
    const resolved = compileModifierTextModel(model())(input);
    expect([resolved.facts.prefixes, resolved.facts.suffixes]).toEqual(expected);
    expect(resolved.facts.modifiers).toMatchObject([{ id }]);
    expect(resolved.facts.modifiersComplete).toBe(false);
    expect(resolved.item).toBe(input.item);
    expect(input).toEqual(source);
    if (id === "physical") {
        expect(matchItem(input, isolatedPhysical)).toBe("unknown");
        expect(matchItem(resolved, isolatedPhysical)).toBe("match");
    }
});

it("preserves legacy missing counts, both missing counts, and supplied counts", () => {
    const missing = item(["110% increased Physical Damage"], 1, undefined);
    expect(compileModifierTextModel({ ...model(), format: 1 })(missing)).toBe(missing);
    const absent = item(["110% increased Physical Damage"], undefined, undefined);
    expect(compileModifierTextModel(model())(absent)).toBe(absent);
    const known = item(["110% increased Physical Damage"], 1, 0);
    expect(compileModifierTextModel(model())(known)).toEqual(
        compileModifierTextModel({ ...model(), format: 1 })(known),
    );
    const contradictory = item(["110% increased Physical Damage"], 1, 1);
    expect(compileModifierTextModel(model())(contradictory)).toBe(contradictory);
});

it("retains universally proven identities without guessing an ambiguous count", () => {
    const possibleSuffix = {
        ...modifiers[2]!,
        text: "(0-10)% increased Physical Damage",
    };
    const input = item(["110% increased Physical Damage"], 1, undefined);
    const resolved = compileModifierTextModel(model([modifiers[0]!, possibleSuffix]))(input);
    expect(resolved.facts.modifiers).toMatchObject([{ id: "physical" }]);
    expect(resolved.facts.suffixes).toBeUndefined();
    expect(matchItem(resolved, isolatedPhysical)).toBe("unknown");
    expect(resolved.item.extended?.suffixes).toBeUndefined();
});

it("does not turn a unique count into a unique modifier identity", () => {
    const input = item(["110% increased Physical Damage"], 1, undefined);
    const resolved = compileModifierTextModel(
        model([modifiers[0]!, { ...modifiers[0]!, id: "indistinguishable" }]),
    )(input);
    expect(resolved.facts.suffixes).toBe(0);
    expect(resolved.facts.modifiers).toEqual([]);
    expect(matchItem(resolved, isolatedPhysical)).toBe("unknown");
});

it("shares the visit budget across counts and withholds incomplete or unsupported interpretations", () => {
    const input = item(["110% increased Physical Damage"], 1, undefined);
    expect(compileModifierTextModel(model([modifiers[0]!]), 12)(input)).toBe(input);
    expect(
        compileModifierTextModel(
            model([modifiers[0]!]),
            12,
        )(item(["110% increased Physical Damage"], 1, 0)).facts.modifiers,
    ).toMatchObject([{ id: "physical" }]);
    for (const extra of [
        { ...modifiers[2]!, text: null },
        { ...modifiers[2]!, text: "(0-10)% increased Physical Damage", unsupported: true },
    ])
        expect(compileModifierTextModel(model([modifiers[0]!, extra]))(input)).toBe(input);
    const impossible = item(["999% increased Physical Damage"], 1, undefined);
    expect(compileModifierTextModel(model())(impossible)).toBe(impossible);
});

it.each([4, 11, 12])("does not impose ordinary rarity limits on %i inferred prefixes", (count) => {
    const prefixes = Array.from({ length: count }, (_, index) => ({
        ...modifiers[0]!,
        id: `prefix-${index}`,
        groups: [`group-${index}`],
        text: `+(1-2) to stat ${String.fromCharCode(65 + index)}`,
    }));
    const input = item(
        [...prefixes.map((mod) => mod.text.replace("(1-2)", "2")), "+47% to Cold Resistance"],
        undefined,
        1,
    );
    const resolved = compileModifierTextModel(model([...prefixes, modifiers[3]!]))(input);
    if (count === 12) expect(resolved).toBe(input);
    else {
        expect(resolved.facts.prefixes).toBe(count);
        expect(resolved.facts.suffixes).toBe(1);
        expect(resolved.facts.modifiers).toHaveLength(count + 1);
    }
});

it("combines proven optional metadata with description-only affixes without replacing source tiers", () => {
    const physical = modifiers[0]!;
    const alternative = { ...physical, id: "alternative" };
    const { id, name, side, text } = physical;
    const resolveIdentity = compileModifierIdentities([
        { id, name, side, text, level: 83 },
        { id: alternative.id, name, side, text, level: 81 },
    ]);
    const input = item(["110% increased Physical Damage", "+47% to Cold Resistance"], 1, 1);
    input.item.explicitMods![0] = {
        description: "110% increased Physical Damage",
        mods: [{ name: physical.name, tier: "P2", level: 83 }],
    };
    const known = resolveIdentity(normalizeApiItem("poe1", "stash", input.item));
    expect(known.facts.modifiers).toMatchObject([{ id: "physical", tier: 2 }]);
    const resolved = compileModifierTextModel(model([...modifiers, alternative]))(known);
    expect(resolved.facts.modifiers).toHaveLength(2);
    expect(resolved.facts.modifiers).toEqual(
        expect.arrayContaining([known.facts.modifiers[0], expect.objectContaining({ id: "cold" })]),
    );
    expect(resolved.facts.modifiersComplete).toBe(false);
    expect(resolved.item).toBe(known.item);
});

it("does not infer mixed-metadata affixes from unresolved identities or contradictory counts and flags", () => {
    const physical = modifiers[0]!;
    const input = item(["110% increased Physical Damage", "+47% to Cold Resistance"], 1, 1);
    input.item.explicitMods![0] = {
        description: "110% increased Physical Damage",
        mods: [{ name: physical.name, tier: "P1", level: 83 }],
    };
    const resolve = compileModifierTextModel(model());
    const unknown = normalizeApiItem("poe1", "stash", input.item);
    expect(resolve(unknown)).toBe(unknown);
    const { id, name, side, text } = physical;
    const identify = compileModifierIdentities([{ id, name, side, text, level: 83 }]);
    for (const changed of [
        { ...input.item, extended: { prefixes: 0, suffixes: 1 } },
        {
            ...input.item,
            explicitMods: [
                { ...input.item.explicitMods![0], flags: { crafted: true } },
                input.item.explicitMods![1],
            ],
        },
    ]) {
        const known = identify(normalizeApiItem("poe1", "stash", changed));
        expect(resolve(known)).toBe(known);
    }
});

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

it("resolves influenced donor text without using influence to guess ambiguous modifier identities", () => {
    const input = item(["110% increased Physical Damage"], 1, 0);
    input.item.influences = { shaper: true };
    expect(compileModifierTextModel(model())(input).facts.modifiers).toMatchObject([
        { id: "physical" },
    ]);
    const alternate = { ...modifiers[0]!, id: "other-influence" };
    expect(
        compileModifierTextModel(model([...modifiers, alternate]))(input).facts.modifiers,
    ).toEqual([]);
});

it("uses explicit required influences while retaining missing and dual-influence ambiguity", () => {
    const shaper = { ...modifiers[0]!, requiredInfluence: "shaper" as const };
    const warlord = { ...shaper, id: "warlord", requiredInfluence: "warlord" as const };
    const resolve = compileModifierTextModel(model([shaper, warlord]));
    const input = item(["110% increased Physical Damage"], 1, 0);
    expect(resolve(input).facts.modifiers).toEqual([]);
    for (const influence of ["shaper", "warlord"] as const) {
        const record = { ...input, item: { ...input.item, influences: { [influence]: true } } };
        expect(resolve(record).facts.modifiers).toMatchObject([
            { id: influence === "shaper" ? "physical" : "warlord" },
        ]);
    }
    const ambiguous: Record<string, boolean>[] = [{}, { shaper: true, warlord: true }];
    for (const influences of ambiguous) {
        const record = { ...input, item: { ...input.item, influences } };
        expect(resolve(record).facts.modifiers).toEqual([]);
    }
    const unrestricted = { ...modifiers[0]!, id: "off-base" };
    const mixed = compileModifierTextModel(model([shaper, unrestricted]));
    expect(
        mixed({ ...input, item: { ...input.item, influences: { shaper: true } } }).facts.modifiers,
    ).toEqual([]);
});

it("requires captured native implicits before applying a base's fixed influences", () => {
    const text =
        "Has Elder, Shaper and all Conqueror Influences\nImplicit Modifiers Cannot Be Changed";
    const shaper = { ...modifiers[0]!, requiredInfluence: "shaper" as const };
    const warlord = { ...shaper, id: "warlord", requiredInfluence: "warlord" as const };
    const data = model([shaper, warlord]);
    data.bases[0]!.fixedInfluences = {
        values: ["shaper", "elder", "crusader", "redeemer", "hunter", "warlord"],
        texts: [text],
    };
    const input = item(["110% increased Physical Damage"], 1, 0);
    input.item.influences = { shaper: true };
    const resolve = compileModifierTextModel(data);
    expect(resolve(input)).toBe(input);
    input.item.implicitMods = text.split("\n").map((description) => ({ description }));
    expect(resolve(input).facts.modifiers).toEqual([]);
    const unique = compileModifierTextModel({
        ...data,
        modifiers: [warlord],
        bases: [{ ...data.bases[0]!, modifiers: [{ id: "warlord" }] }],
    });
    delete input.item.influences;
    expect(unique(input).facts.modifiers).toMatchObject([{ id: "warlord" }]);
    input.item.implicitMods[0] = {
        description: text.split("\n")[0]!,
        flags: { fractured: true },
    };
    expect(unique(input)).toBe(input);
    input.item.implicitMods[0] = { description: "Has Shaper Influence" };
    expect(unique(input)).toBe(input);
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

it.each([1, 2, 3] as const)("format %s leaves separate fractured text unresolved", (format) => {
    const input = normalizeApiItem("poe1", "stash", {
        ...item([], 0, 1).item,
        fracturedMods: ["+47% to Cold Resistance"],
    });
    expect(compileModifierTextModel({ ...model(), format })(input)).toBe(input);
});

it("format 4 resolves separate fractured text without modifying source data or ordinary flags", () => {
    const input = normalizeApiItem("poe1", "stash", {
        ...item(["110% increased Physical Damage"], 1, 1).item,
        fracturedMods: ["+47% to Cold Resistance"],
    });
    const original = structuredClone(input);
    const resolved = compileModifierTextModel({ ...model(), format: 4 })(input);
    expect(resolved.facts.modifiers).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ id: "physical", fractured: false, crafted: false }),
            expect.objectContaining({ id: "cold", fractured: true, crafted: false }),
        ]),
    );
    expect(resolved.facts.modifiers).toHaveLength(2);
    expect(resolved.item).toBe(input.item);
    expect(input).toEqual(original);
    expect(resolved.facts.modifiersComplete).toBe(false);
});

it("format 4 counts a multi-line separate fracture once and can prove one omitted count", () => {
    const input = normalizeApiItem("poe1", "stash", {
        ...item([], undefined, 1).item,
        fracturedMods: [
            "+47% to Cold Resistance",
            "40% increased Damage with Hits against Chilled Enemies",
        ],
    });
    const resolved = compileModifierTextModel({ ...model(), format: 4 })(input);
    expect(resolved.facts).toMatchObject({
        prefixes: 0,
        suffixes: 1,
        modifiers: [{ id: "temple", fractured: true, crafted: false }],
    });
    expect(input.item.extended).toEqual({ suffixes: 1 });
    expect(input.facts.prefixes).toBeUndefined();
});

it.each([
    { extended: {} },
    { extended: { prefixes: 0, suffixes: 0 } },
    { extended: { prefixes: 0, suffixes: 13 } },
    { identified: false },
    { explicitMods: ["110% increased Physical Damage"] },
    {
        explicitMods: [{ description: "+47% to Cold Resistance", flags: { fractured: true } }],
        extended: { prefixes: 0, suffixes: 2 },
    },
    { fracturedMods: ["40% increased Damage with Hits against Chilled Enemies"] },
])("format 4 preserves refusal for incomplete or mixed fracture evidence: %j", (changes) => {
    const input = normalizeApiItem("poe1", "stash", {
        ...item([], 0, 1).item,
        fracturedMods: ["+47% to Cold Resistance"],
        ...changes,
    });
    expect(compileModifierTextModel({ ...model(), format: 4 })(input)).toBe(input);
});

it("format 4 preserves ambiguity, unsupported candidates and the shared search budget", () => {
    const input = normalizeApiItem("poe1", "stash", {
        ...item([], 0, 1).item,
        fracturedMods: ["+47% to Cold Resistance"],
    });
    for (const extra of [
        { ...modifiers[3]!, id: "alternate" },
        { ...modifiers[3]!, id: "unsupported", text: null },
    ])
        expect(
            compileModifierTextModel({ ...model([...modifiers, extra]), format: 4 })(input),
        ).toBe(input);
    expect(compileModifierTextModel({ ...model(), format: 4 }, 1)(input)).toBe(input);
});

it("format 4 retains format 3 Magic-name disambiguation", () => {
    const input = normalizeApiItem("poe1", "stash", {
        ...item(["+47% to Cold Resistance"], 0, 1).item,
        rarity: "Magic",
        name: "",
        typeLine: "Axe of the Ice",
    });
    const previous = compileModifierTextModel({ ...model(namedModifiers), format: 3 })(input);
    expect(previous.facts.modifiers).toMatchObject([{ id: "cold" }]);
    expect(compileModifierTextModel({ ...model(namedModifiers), format: 4 })(input)).toEqual(
        previous,
    );
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

const physicalReductionModel: ModifierTextModel = {
    format: 5,
    unsupportedImplicitTexts: [
        "Cannot roll Modifiers of Non-Physical Damage Types\n3% additional Physical Damage Reduction",
    ],
    modifiers: [
        {
            id: "LocalBaseArmourAndEvasionRating7",
            name: "Adaptable",
            side: "prefix",
            groups: ["BaseLocalDefences"],
            crafted: false,
            text: "+(221-300) to Armour\n+(221-300) to Evasion Rating",
        },
        {
            id: "LifeRegeneration11____",
            name: "of Convalescence",
            side: "suffix",
            groups: ["LifeRegeneration"],
            crafted: false,
            text: "Regenerate (152.1-176) Life per second",
        },
        {
            id: "FireResist6",
            name: "of the Volcano",
            side: "suffix",
            groups: ["FireResistance"],
            crafted: false,
            text: "+(36-41)% to Fire Resistance",
        },
        {
            id: "FireResist8",
            name: "of Tzteosh",
            side: "suffix",
            groups: ["FireResistance"],
            crafted: false,
            text: "+(46-48)% to Fire Resistance",
        },
        {
            id: "StunRecovery5",
            name: "of Adamantite Skin",
            side: "suffix",
            groups: ["StunRecovery"],
            crafted: false,
            text: "(23-25)% increased Stun and Block Recovery",
        },
        {
            id: "AttackerTakesDamage4",
            name: "Jagged",
            side: "prefix",
            groups: ["AttackerTakesDamageNoRange"],
            crafted: false,
            text: "Reflects (25-50) Physical Damage to Melee Attackers",
        },
        {
            id: "AdditionalPhysicalDamageReduction5_",
            name: "of the Conservator",
            side: "suffix",
            groups: ["ReducedPhysicalDamageTaken"],
            crafted: false,
            text: "8% additional Physical Damage Reduction",
        },
    ],
    bases: [{ baseType: "Conquest Lamellar" }],
};
const recordedFractures = [
    {
        id: "AdditionalPhysicalDamageReduction5_",
        rows: [
            { description: "Regenerate 174.7 Life per second" },
            { description: "+48% to Fire Resistance" },
            { description: "Reflects 46 Physical Damage to Melee Attackers" },
            { description: "8% additional Physical Damage Reduction", flags: { fractured: true } },
        ],
    },
    {
        id: "LocalBaseArmourAndEvasionRating7",
        rows: [
            { description: "+41% to Fire Resistance" },
            { description: "25% increased Stun and Block Recovery" },
            { description: "8% additional Physical Damage Reduction" },
            { description: "+291 to Armour", flags: { fractured: true } },
            { description: "+292 to Evasion Rating", flags: { fractured: true } },
        ],
    },
];

it.each(
    recordedFractures,
)("resolves recorded $id despite an ordinary line shared with a fossil effect", ({ id, rows }) => {
    const input = normalizeApiItem("poe1", "stash", {
        baseType: "Conquest Lamellar",
        typeLine: "Conquest Lamellar",
        ilvl: 86,
        rarity: "Rare",
        identified: true,
        fractured: true,
        extended: { prefixes: 1, suffixes: 3 },
        explicitMods: rows,
    });
    const original = structuredClone(input);
    for (const format of [1, 2, 3, 4] as const) {
        const historical = { ...physicalReductionModel, format };
        expect(compileModifierTextModel(historical)(input)).toBe(input);
        expect(compileFracturedModifierTextModel(historical)(input)).toBe(input);
    }
    const resolved = compileModifierTextModel(physicalReductionModel)(input);
    expect(resolved.facts.modifiers).toHaveLength(4);
    expect(resolved.facts.modifiers.filter((mod) => mod.fractured)).toMatchObject([{ id }]);
    expect(
        compileFracturedModifierTextModel(physicalReductionModel)(input).facts.modifiers,
    ).toContainEqual(expect.objectContaining({ id, fractured: true }));
    expect(input).toEqual(original);
});

it.each([
    {
        rows: [
            "Cannot roll Modifiers of Non-Physical Damage Types\n8% additional Physical Damage Reduction",
        ],
    },
    {
        rows: [
            "Cannot roll Modifiers of Non-Physical Damage Types",
            "8% additional Physical Damage Reduction",
        ],
    },
    {
        rows: [
            "8% additional [Physical Damage] Reduction",
            "Cannot roll Modifiers of [damage|Non-Physical Damage] Types",
        ],
    },
])("format 5 refuses complete unsupported groups across explicit display rows: $rows", ({
    rows,
}) => {
    const effect = physicalReductionModel.unsupportedImplicitTexts![0]!;
    const data: ModifierTextModel = {
        ...physicalReductionModel,
        modifiers: [
            {
                id: "effect",
                name: "Effect",
                side: "suffix",
                groups: ["Effect"],
                crafted: false,
                text: effect.replace("3%", "8%"),
            },
        ],
    };
    const input = normalizeApiItem("poe1", "stash", {
        baseType: "Conquest Lamellar",
        rarity: "Rare",
        identified: true,
        extended: { prefixes: 0, suffixes: 1 },
        explicitMods: rows.map((description) => ({ description, flags: { fractured: true } })),
    });
    expect(
        compileModifierTextModel({ ...data, unsupportedImplicitTexts: [] })(input).facts.modifiers,
    ).toMatchObject([{ id: "effect" }]);
    expect(compileModifierTextModel(data)(input)).toBe(input);
    expect(compileFracturedModifierTextModel(data)(input)).toBe(input);
});

it("format 5 retains singleton effects and partial or malformed implicit refusals", () => {
    const data: ModifierTextModel = {
        ...model(),
        format: 5,
        unsupportedImplicitTexts: [
            "(20-50)% increased Explicit Modifier magnitudes",
            ...physicalReductionModel.unsupportedImplicitTexts!,
        ],
    };
    for (const implicitMods of [
        ["40% increased Explicit Modifier magnitudes"],
        ["40% increased Explicit Modifier magnitudes\n"],
        ["40% increased Explicit Modifier magnitudes\n{unknown}"],
        ["8% additional Physical Damage Reduction"],
        [physicalReductionModel.unsupportedImplicitTexts![0]!],
        physicalReductionModel.unsupportedImplicitTexts![0]!.split("\n"),
    ]) {
        const input = item(["+47% to Cold Resistance"], 0, 1);
        input.item.implicitMods = implicitMods;
        expect(compileModifierTextModel(data)(input)).toBe(input);
        expect(compileFracturedModifierTextModel(data)(input)).toBe(input);
    }
    const explicit = item(["40% increased Explicit Modifier magnitudes"], 0, 1, true);
    const effect: ModifierTextModel = {
        ...data,
        modifiers: [{ ...modifiers[3]!, text: data.unsupportedImplicitTexts![0]! }],
        bases: [{ baseType: "Axe" }],
    };
    expect(
        compileModifierTextModel({ ...effect, unsupportedImplicitTexts: [] })(explicit).facts
            .modifiers,
    ).toMatchObject([{ id: "cold" }]);
    expect(compileModifierTextModel(effect)(explicit)).toBe(explicit);
    expect(compileFracturedModifierTextModel(effect)(explicit)).toBe(explicit);
});

it("format 5 does not mistake repeated shared lines for a complete unsupported group", () => {
    const reduction = physicalReductionModel.modifiers.find(
        (mod) => mod.id === "AdditionalPhysicalDamageReduction5_",
    )!;
    const data: ModifierTextModel = {
        ...physicalReductionModel,
        modifiers: [{ ...reduction, text: "(8-16)% additional Physical Damage Reduction" }],
    };
    const input = normalizeApiItem("poe1", "stash", {
        baseType: "Conquest Lamellar",
        rarity: "Rare",
        identified: true,
        extended: { prefixes: 0, suffixes: 1 },
        explicitMods: [
            { description: "8% additional Physical Damage Reduction", flags: { fractured: true } },
            { description: "8% additional Physical Damage Reduction", flags: { fractured: true } },
        ],
    });
    expect(compileModifierTextModel(data)(input).facts.modifiers).toMatchObject([
        { id: reduction.id, fractured: true },
    ]);
    expect(compileFracturedModifierTextModel(data)(input).facts.modifiers).toMatchObject([
        { id: reduction.id, fractured: true },
    ]);
});

it("format 5 preserves ambiguous identities, unsupported candidates and search exhaustion", () => {
    const reduction = physicalReductionModel.modifiers.find(
        (mod) => mod.id === "AdditionalPhysicalDamageReduction5_",
    )!;
    const data: ModifierTextModel = { ...physicalReductionModel, modifiers: [reduction] };
    const input = normalizeApiItem("poe1", "stash", {
        baseType: "Conquest Lamellar",
        rarity: "Rare",
        identified: true,
        extended: { prefixes: 0, suffixes: 1 },
        explicitMods: [
            { description: "8% additional Physical Damage Reduction", flags: { fractured: true } },
        ],
    });
    for (const extra of [
        { ...reduction, id: "indistinguishable" },
        { ...reduction, id: "unsupported", unsupported: true },
        { ...reduction, id: "untranslated", text: null },
    ]) {
        const unresolved = { ...data, modifiers: [reduction, extra] };
        expect(compileModifierTextModel(unresolved)(input)).toBe(input);
        expect(compileFracturedModifierTextModel(unresolved)(input)).toBe(input);
    }
    expect(compileModifierTextModel(data, 1)(input)).toBe(input);
    expect(compileFracturedModifierTextModel(data, 1)(input)).toBe(input);
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
    const influenced = model([
        modifiers[4]!,
        { ...modifiers[4]!, id: "influenced-temple", requiredInfluence: "shaper" },
    ]);
    expect(() =>
        compileModifierTextModel({
            ...influenced,
            identityFamilies: [["temple", "influenced-temple"]],
        }),
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

it.each([
    2, 5,
] as const)("format %s adds native magnitude and catalyst effects only with the native implicit", (format) => {
    const name = "Quality (Resistance Modifiers)";
    const data = model([modifiers[3]!]);
    data.format = format;
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
