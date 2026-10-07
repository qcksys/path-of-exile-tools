import { expect, it } from "vite-plus/test";
import {
    compileModifierIdentities,
    type ModifierIdentity,
    normalizeApiItem,
} from "../src/index.ts";

const physical: ModifierIdentity = {
    id: "LocalIncreasedPhysicalDamagePercent8",
    name: "Merciless",
    side: "prefix",
    level: 83,
    text: "(170-179)% increased Physical Damage",
};
const cold: ModifierIdentity = {
    id: "ColdResistEnhancedModAilments__",
    name: "of Puhuarte",
    side: "suffix",
    level: 1,
    text: "+(46-48)% to Cold Resistance\n(30-50)% increased Damage with Hits against Chilled Enemies",
};
function source(descriptions: string[], definition = physical, extra = {}) {
    return normalizeApiItem("poe1", "stash", {
        baseType: "Solar Maul",
        identified: true,
        explicitMods: descriptions.map((description) => ({
            description,
            flags: { fractured: true },
            mods: [
                {
                    name: definition.name,
                    tier: definition.side === "prefix" ? "P1" : "S0",
                    level: definition.level,
                },
            ],
        })),
        ...extra,
    });
}

it("resolves the verified trade shape without equating same-name global and local modifiers", () => {
    const resolve = compileModifierIdentities([
        physical,
        {
            ...physical,
            id: "global",
            level: 81,
            text: "(29-33)% increased Global Physical Damage",
        },
    ]);
    const record = source(["179% increased Physical Damage"]);
    expect(resolve(record).facts.modifiers[0]).toMatchObject({
        id: physical.id,
        fractured: true,
        tier: 1,
    });
    expect(resolve(record).item).toBe(record.item);
    expect(record.facts.modifiers[0]!.id).toBeUndefined();
    expect(
        resolve(source(["180% increased Physical Damage"])).facts.modifiers[0]!.id,
    ).toBeUndefined();
});

it("requires every line of a compound Temple modifier and disambiguates its variants", () => {
    const resolve = compileModifierIdentities([
        cold,
        {
            ...cold,
            id: "fire",
            text: "+(46-48)% to Fire Resistance\n0.4% of Fire Damage Leeched as Life",
        },
    ]);
    const complete = source(
        ["+47% to Cold Resistance", "40% increased Damage with Hits against Chilled Enemies"],
        cold,
    );
    expect(resolve(complete).facts.modifiers).toHaveLength(1);
    expect(resolve(complete).facts.modifiers[0]).toMatchObject({ id: cold.id, tier: 0 });
    expect(
        resolve(source(["+47% to Cold Resistance"], cold)).facts.modifiers[0]!.id,
    ).toBeUndefined();
});

it("retains ambiguity, missing metadata and combined stat rows instead of guessing", () => {
    for (const other of [
        { ...physical, id: "same-text" },
        { ...physical, id: "no-text", text: null },
    ]) {
        expect(
            compileModifierIdentities([physical, other])(source(["179% increased Physical Damage"]))
                .facts.modifiers[0]!.id,
        ).toBeUndefined();
    }
    const resolve = compileModifierIdentities([physical]);
    for (const extra of [
        { identified: false },
        { explicitMods: ["179% increased Physical Damage"] },
        {
            explicitMods: [
                {
                    description: "179% increased Physical Damage",
                    mods: [{ name: "Merciless", tier: "P1" }],
                },
            ],
        },
        {
            explicitMods: [
                {
                    description: "179% increased Physical Damage",
                    mods: [
                        { name: "Merciless", tier: "P1", level: 83 },
                        { name: "hybrid", tier: "P1", level: 83 },
                    ],
                },
            ],
        },
    ]) {
        expect(
            resolve(source([], physical, extra)).facts.modifiers.every(
                (mod) => mod.id === undefined,
            ),
        ).toBe(true);
    }
});

it("matches literal punctuation and negative decimal ranges without broad regular expressions", () => {
    const definition = { ...physical, text: "(-2.5--1.5)% increased Damage (Local)" };
    const resolve = compileModifierIdentities([definition]);
    expect(resolve(source(["-2% increased Damage (Local)"])).facts.modifiers[0]!.id).toBe(
        physical.id,
    );
    expect(
        resolve(source(["-3% increased Damage (Local)"])).facts.modifiers[0]!.id,
    ).toBeUndefined();
    expect(resolve(source(["-2% increased Damage Local"])).facts.modifiers[0]!.id).toBeUndefined();
});
