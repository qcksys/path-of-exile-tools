import { expect, it } from "vite-plus/test";
import {
    compileSourcePreparation,
    type ModifierTextModel,
    normalizeApiItem,
    type SourcePreparationModel,
} from "../src/index.ts";

const target = "BreachBodyCriticalChanceIncreasedByUncappedLightningResistance1";
const text = "Critical Strike Chance is increased by Overcapped Lightning Resistance";
const enchant = "8% increased Explicit Defence Modifier magnitudes";
const modifierModel: ModifierTextModel = {
    format: 5,
    modifiers: [
        {
            id: target,
            name: "of Esh",
            side: "suffix",
            groups: ["CriticalChanceIncreasedByUncappedLightningResistance"],
            crafted: false,
            text,
        },
    ],
    bases: [{ baseType: "Conquest Lamellar" }],
    unsupportedImplicitTexts: [enchant],
};
const sourceModel: SourcePreparationModel = {
    format: 4,
    bases: [{ id: "conquest", baseType: "Conquest Lamellar", itemClass: "Body Armour" }],
};
const profile = {
    kind: "fractured-fossil-v1" as const,
    fractureId: target,
    crafted: false,
    enchanted: true,
};

function source() {
    return normalizeApiItem("poe1", "stash", {
        baseType: "Conquest Lamellar",
        ilvl: 86,
        rarity: "Rare",
        identified: true,
        fractured: true,
        explicitMods: [{ description: text, flags: { fractured: true } }],
        enchantMods: [enchant],
    });
}

it("identifies the invariant Breach fracture despite a removable defence magnitude enchant", () => {
    const project = compileSourcePreparation(modifierModel, sourceModel);
    const input = source();
    const withoutEnchant = structuredClone(input);
    withoutEnchant.item.enchantMods = [];
    expect(project(withoutEnchant, { ...profile, enchanted: false }).status).toBe("match");
    const before = structuredClone(input);
    const result = project(input, profile);
    expect(result.status).toBe("match");
    if (result.status !== "match") throw new Error("Expected projected source");
    expect(result.record.facts.modifiers).toEqual([
        expect.objectContaining({ id: target, fractured: true, side: "suffix" }),
    ]);
    expect(result.record.item.enchantMods).toEqual([]);
    expect(input).toEqual(before);
    for (const format of [1, 2, 3] as const) {
        expect(
            compileSourcePreparation(modifierModel, { ...sourceModel, format })(input, profile),
        ).toEqual({ status: "unknown" });
    }
});

it("keeps competing literal identities and hidden modifier candidates ambiguous", () => {
    for (const other of [
        { ...modifierModel.modifiers[0]!, id: "alias" },
        {
            ...modifierModel.modifiers[0]!,
            id: "hidden",
            groups: ["hidden"],
            text: "",
            unsupported: true,
        },
    ]) {
        const model = { ...modifierModel, modifiers: [...modifierModel.modifiers, other] };
        expect(compileSourcePreparation(model, sourceModel)(source(), profile)).toEqual({
            status: "unknown",
        });
    }
});

it("does not bypass numeric, multiline or explicitly scalable protected identities", () => {
    for (const definition of [
        { ...modifierModel.modifiers[0]!, text: "+15 to maximum Life" },
        { ...modifierModel.modifiers[0]!, text: `${text}\nAnother protected effect` },
        {
            ...modifierModel.modifiers[0]!,
            text,
            scaling: {
                stats: [{ id: "effect", min: 1, max: 1, scalable: true }],
                descriptions: [],
            },
        },
    ]) {
        const input = source();
        input.item.explicitMods = [{ description: definition.text, flags: { fractured: true } }];
        const model = { ...modifierModel, modifiers: [definition] };
        expect(compileSourcePreparation(model, sourceModel)(input, profile)).toEqual({
            status: "unknown",
        });
    }
});

it("does not infer the target from different or multiple protected fragments", () => {
    const project = compileSourcePreparation(modifierModel, sourceModel);
    expect(project(source(), { ...profile, fractureId: "other" }).status).not.toBe("match");
    for (const extra of [text, "+182 to maximum Life", "+17% chance to Suppress Spell Damage"]) {
        const input = source();
        input.item.explicitMods!.push({ description: extra, flags: { fractured: true } });
        expect(project(input, profile)).toEqual({ status: "unknown" });
    }
    for (const wrong of ["+182 to maximum Life", "+17% chance to Suppress Spell Damage"]) {
        const input = source();
        input.item.explicitMods = [{ description: wrong, flags: { fractured: true } }];
        expect(project(input, profile)).toEqual({ status: "unknown" });
    }
});

it("preserves general, unknown and compound magnitude enchant guards", () => {
    for (const other of [
        "10% increased Explicit Modifier magnitudes",
        "8% increased Explicit Resistance Modifier magnitudes",
        "8% increased Unknown Modifier magnitudes",
        `${enchant}\n50% reduced Explicit Resistance Modifier magnitudes`,
    ]) {
        const input = source();
        input.item.enchantMods = [other];
        const model = { ...modifierModel, unsupportedImplicitTexts: [enchant, other] };
        expect(compileSourcePreparation(model, sourceModel)(input, profile)).toEqual({
            status: "unknown",
        });
    }
    expect(
        compileSourcePreparation(
            {
                ...modifierModel,
                unsupportedImplicitTexts: [
                    "(5-15)% increased Explicit Defence Modifier magnitudes",
                ],
            },
            sourceModel,
        )(source(), profile),
    ).toEqual({ status: "unknown" });
});

it("retains implicit magnitude and unsupported flag guards", () => {
    const project = compileSourcePreparation(modifierModel, sourceModel);
    for (const mutate of [
        (input: ReturnType<typeof source>) => {
            input.item.implicitMods = [{ description: enchant }];
        },
        (input: ReturnType<typeof source>) => {
            input.item.explicitMods = [
                { description: text, flags: { fractured: true, mutated: true } },
            ];
        },
        (input: ReturnType<typeof source>) => {
            input.item.unknownPersistentFlag = true;
        },
        (input: ReturnType<typeof source>) => {
            input.item.properties = [{ name: "Intangibility", type: 110, values: [["84%", 0]] }];
        },
    ]) {
        const input = source();
        mutate(input);
        expect(project(input, profile).status).not.toBe("match");
    }
    expect(compileSourcePreparation(modifierModel, sourceModel, 1)(source(), profile)).toEqual({
        status: "unknown",
    });
});
