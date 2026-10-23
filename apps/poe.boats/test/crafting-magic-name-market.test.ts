import { compileModifierTextModel, normalizeApiItem } from "@poe-tools/item-query";
import { expect, it } from "vite-plus/test";
import { marketModifierTextModel } from "../scripts/market-modifier-text";
import { engine } from "./crafting-fixtures";

const samples = [
    {
        baseType: "Heat-attuned Tower Shield",
        typeLine: "Heat-attuned Tower Shield of the Leviathan",
        descriptions: ["+38 to Strength"],
        implicit: ["Scorch Enemies when you Block their Damage"],
        extended: { suffixes: 1 },
        counts: [0, 1],
        ids: ["Strength7"],
    },
    {
        baseType: "Heat-attuned Tower Shield",
        typeLine: "Heat-attuned Tower Shield of Obstruction",
        descriptions: ["You take 52% reduced Extra Damage from Critical Strikes"],
        implicit: ["Scorch Enemies when you Block their Damage"],
        extended: { suffixes: 1 },
        counts: [0, 1],
        ids: ["ReducedExtraDamageFromCrits4__"],
    },
    {
        baseType: "Pinnacle Tower Shield",
        typeLine: "Pinnacle Tower Shield of Shaping",
        descriptions: ["Socketed Gems have 30% increased Reservation Efficiency"],
        implicit: ["+29 to maximum Life"],
        extended: { suffixes: 1 },
        counts: [0, 1],
        ids: ["DisplaySocketedGemsGetReducedReservationUber2"],
    },
    {
        baseType: "Titanium Spirit Shield",
        typeLine: "Thunderhand's Titanium Spirit Shield of Unmaking",
        descriptions: [
            "103% increased Spell Critical Strike Chance",
            "+1 to Level of all Lightning Spell Skill Gems",
        ],
        implicit: [],
        extended: { prefixes: 1, suffixes: 1 },
        counts: [1, 1],
        ids: ["SpellCriticalStrikeChance6_", "GlobalLightningSpellGemsLevel1"],
    },
    {
        baseType: "Titanium Spirit Shield",
        typeLine: "Unyielding Titanium Spirit Shield",
        descriptions: ["78% increased Chance to Block"],
        implicit: [],
        extended: { prefixes: 1 },
        counts: [1, 0],
        ids: ["LocalIncreasedBlockPercentage7"],
    },
    {
        baseType: "Titanium Spirit Shield",
        typeLine: "Priest's Titanium Spirit Shield of Shaping",
        descriptions: [
            "+19 to maximum Energy Shield",
            "+22 to maximum Mana",
            "Recover 5% of Life when you Block",
        ],
        implicit: [],
        extended: { prefixes: 1, suffixes: 1 },
        counts: [1, 1],
        ids: ["LocalBaseEnergyShieldAndMana3", "RecoverLifePercentOnBlockUber1_"],
    },
];
const model = marketModifierTextModel(engine, new Set(samples.map((sample) => sample.baseType)));
const resolve = compileModifierTextModel(model);
const legacy = compileModifierTextModel({ ...model, format: 2 });

it.each(
    samples,
)("resolves captured Magic name and description evidence for $typeLine", (sample) => {
    const record = normalizeApiItem("poe1", "stash", {
        name: "",
        typeLine: sample.typeLine,
        baseType: sample.baseType,
        ilvl: 86,
        rarity: "Magic",
        identified: true,
        influences: { shaper: true },
        explicitMods: sample.descriptions.map((description) => ({ description })),
        implicitMods: sample.implicit.map((description) => ({ description })),
        extended: sample.extended,
    });
    const resolved = resolve(record);
    expect(model.format).toBe(3);
    expect([resolved.facts.prefixes, resolved.facts.suffixes]).toEqual(sample.counts);
    expect(resolved.facts.modifiers.map((mod) => mod.id).sort()).toEqual([...sample.ids].sort());
    expect(resolved.item).toBe(record.item);
    expect(resolved.facts.modifiersComplete).toBe(false);
    const previous = legacy(record);
    if (sample.typeLine.startsWith("Unyielding") || sample.typeLine.startsWith("Priest's")) {
        expect([previous.facts.prefixes, previous.facts.suffixes]).toEqual(sample.counts);
        expect(previous.facts.modifiers).toHaveLength(sample.ids.length);
        expect(previous.facts.modifiers).toEqual(expect.arrayContaining(resolved.facts.modifiers));
    } else expect(previous.facts).not.toEqual(resolved.facts);
});

it("retains unsupported invisible and blank-name definitions instead of excluding their origins", () => {
    for (const id of [
        "StormBladeExplicitLocalIncreasedCriticalStrikeChance",
        "StormBladeExplicitShockChance",
        "StormBladeExplicitAttackLightningConvertToChaos",
    ])
        expect(model.modifiers.find((mod) => mod.id === id)).toMatchObject({
            text: "",
            unsupported: true,
        });
    expect(model.modifiers.filter((mod) => mod.name === "").length).toBeGreaterThan(0);
});
