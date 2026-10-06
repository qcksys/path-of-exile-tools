import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { baseItemsSchema } from "../../../packages/poe-game-data/src/model";
import { baseDefenceEntries } from "../app/lib/crafting-defences";
import { CraftingEngine, type CraftingRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { itemProperties } from "../app/lib/crafting-properties";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
} from "../app/lib/crafting-simulation";
import { targetNeedsValues } from "../app/lib/crafting-targets";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingCombatPropertiesSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const minimum: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };

describe.each(["poe1", "poe2"] as const)("%s final item properties", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const currency = (action: string) => ({
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    });
    const create = (name: string) =>
        engine.createItem(
            Object.entries(catalog.bases).find(([, entry]) => entry.name === name)![0],
        );
    const weapon = () => {
        let item: CraftingItem = { ...create("Crude Bow"), rarity: "rare", quality: 20 };
        for (const id of [
            game === "poe1" ? "LocalAddedPhysicalDamageTwoHand1" : "LocalAddedPhysicalDamage1",
            "LocalIncreasedPhysicalDamagePercent1",
            "LocalIncreasedAttackSpeed1",
            "LocalCriticalStrikeChance1",
            game === "poe1" ? "LocalAddedFireDamageTwoHand1" : "LocalAddedFireDamage1",
        ])
            item = engine.addStartingMod(item, id, minimum);
        return item;
    };
    const armour = () => {
        const item = create(game === "poe1" ? "Plate Vest" : "Rusted Cuirass");
        return engine.addStartingMod(
            {
                ...item,
                rarity: "rare",
                quality: 20,
                baseDefences: Object.fromEntries(
                    baseDefenceEntries(catalog, item).map(({ key, range }) => [key, range.min]),
                ),
            },
            "LocalIncreasedPhysicalDamageReductionRating1",
            minimum,
        );
    };

    it("exports combat properties from every canonical base and no invented Strongbox properties", () => {
        const bases = baseItemsSchema.parse(
            JSON.parse(
                readFileSync(
                    `../../packages/poe-${game === "poe1" ? "1" : "2"}-data/data/base_items.json`,
                    "utf8",
                ),
            ),
        );
        for (const [id, base] of Object.entries(catalog.bases))
            expect(base.combat).toEqual(
                craftingCombatPropertiesSchema.parse(base.strongbox ? {} : bases[id]!.properties),
            );
    });

    it("calculates rounded physical and elemental DPS, attack speed and critical chance from real rolls", () => {
        const item = weapon();
        expect(itemProperties(engine, item)).toEqual(
            game === "poe1"
                ? {
                      attacksPerSecond: 1.47,
                      requiredLevel: 0,
                      strengthRequirement: 0,
                      dexterityRequirement: 14,
                      intelligenceRequirement: 0,
                      criticalStrikeChance: 5.5,
                      physicalDps: 30.14,
                      elementalDps: 6.62,
                      chaosDps: 0,
                      totalDps: 36.75,
                      elementalResistance: 0,
                      totalResistance: 0,
                      flatLife: 0,
                  }
                : {
                      attacksPerSecond: 1.26,
                      requiredLevel: 0,
                      strengthRequirement: 0,
                      dexterityRequirement: 0,
                      intelligenceRequirement: 0,
                      criticalStrikeChance: 6.01,
                      physicalDps: 21.42,
                      elementalDps: 2.52,
                      chaosDps: 0,
                      totalDps: 23.94,
                      elementalResistance: 0,
                      totalResistance: 0,
                      flatLife: 0,
                  },
        );
        const imported = importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!
            .item;
        expect(itemProperties(engine, imported)).toEqual(itemProperties(engine, item));
        expect(itemProperties(engine, { ...item, destroyed: true })).toEqual({});
    });

    it("applies quality to local defences and handles missing raw rolls without inventing them", () => {
        const item = armour();
        expect(itemProperties(engine, item).armour).toBe(game === "poe1" ? 30 : 73);
        const target = engine.validateTarget({ groups: [], properties: { armour: { min: 30 } } });
        expect(engine.matches(item, target)).toBe(true);
        const unknown = { ...item, baseDefences: undefined };
        if (game === "poe1") {
            expect(itemProperties(engine, unknown).armour).toBeUndefined();
            expect(() => engine.matches(unknown, target)).toThrow("starting Base Armour");
        } else expect(itemProperties(engine, unknown).armour).toBe(73);
        expect(
            engine.matches(
                create("Crude Bow"),
                engine.validateTarget({ groups: [], properties: { armour: { max: 0 } } }),
            ),
        ).toBe(true);
        expect(itemProperties(engine, { ...item, quality: 0 }).armour).toBe(
            game === "poe1" ? 25 : 61,
        );
    });

    it("enumerates both physical damage rolls for DPS thresholds", () => {
        const id =
            game === "poe1" ? "LocalAddedPhysicalDamageTwoHand1" : "LocalAddedPhysicalDamage1";
        const item = engine.addStartingMod(create("Crude Bow"), id, minimum);
        const maximum = {
            ...item,
            mods: [{ ...item.mods[0]!, values: engine.mod(id).stats.map((stat) => stat.max) }],
        };
        const target = engine.validateTarget({
            groups: [],
            properties: { physicalDps: { min: itemProperties(engine, maximum).physicalDps! } },
        });
        const possibilities = engine
            .mod(id)
            .stats.reduce((total, stat) => total * (stat.max - stat.min + 1), 1);
        expect(
            calculateExact(engine, item, currency("reroll_mod_values"), target).probability,
        ).toBeCloseTo(1 / possibilities);
    });

    it("counts hybrid percentage modifiers on every affected defence and preserves ward", () => {
        const checked: string[] = [];
        for (const id of [
            "local_armour_and_evasion_+%",
            "local_armour_and_energy_shield_+%",
            "local_evasion_and_energy_shield_+%",
            "local_ward_+%",
        ])
            for (const [baseId, base] of Object.entries(catalog.bases)) {
                const raw = { ...engine.createItem(baseId), rarity: "rare" as const };
                const candidate = engine
                    .pool(raw)
                    .find((entry) => entry.mod.stats.some((stat) => stat.id === id));
                if (!candidate) continue;
                const item = engine.addStartingMod(
                    {
                        ...raw,
                        baseDefences: Object.fromEntries(
                            baseDefenceEntries(catalog, raw).map(({ key, range }) => [
                                key,
                                range.min,
                            ]),
                        ),
                    },
                    candidate.id,
                    minimum,
                );
                const percentage = candidate.mod.stats.find((stat) => stat.id === id)!.min;
                const values = itemProperties(engine, item);
                for (const [key, range] of Object.entries(base.defences)) {
                    if (!range) continue;
                    expect(values[key as "armour" | "evasion" | "energy_shield" | "ward"]).toBe(
                        Math.round(range.min * (1 + percentage / 100)),
                    );
                }
                checked.push(id);
                break;
            }
        expect(checked).toHaveLength(game === "poe1" ? 4 : 3);
    });

    it("enumerates value-sensitive item requirements in calculations and ordered process routes", () => {
        const item = armour();
        const divine = currency("reroll_mod_values");
        const max = {
            ...item,
            mods: item.mods.map((entry) => ({
                ...entry,
                values: engine.mod(entry.id).stats.map((stat) => stat.max),
            })),
        };
        const threshold = itemProperties(engine, max).armour!;
        const target = engine.validateTarget({
            groups: [],
            properties: { armour: { min: threshold } },
        });
        expect(hasCraftingRequirements(target)).toBe(true);
        expect(targetNeedsValues(target)).toBe(true);
        const expected = 1 / (game === "poe1" ? 7 : 12);
        expect(calculateExact(engine, item, divine, target).probability).toBeCloseTo(expected);
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            method: divine,
            target: { groups: [] },
            steps: [
                {
                    id: "divine",
                    method: divine,
                    condition: { groups: [] },
                    onFailure: "failure",
                    branches: [{ id: "value", condition: target, destination: "success" }],
                },
            ],
            prices: { [divine.id]: 2 },
            seed: 42,
            iterations: 500,
            maxActions: 1,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact).toMatchObject({ probability: expected, errors: {} });
        expect(exact.meanCost).toBeCloseTo(2);
        const simulation = new CraftingSimulation(
            catalog,
            craftingProjectSchema.parse(JSON.parse(JSON.stringify(project))),
            true,
        );
        for (let trial = 0; trial < project.iterations; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().probability).toBeCloseTo(expected, 1);
        expect(simulation.result().meanCost).toBe(2);
    });

    it("validates property ranges and combines decimal bounds with nested and excluded conditions", () => {
        for (const properties of [
            { unknown: { min: 1 } },
            { physicalDps: {} },
            { physicalDps: { min: -1 } },
            { physicalDps: { min: 10, max: 9 } },
            { physicalDps: { min: Number.POSITIVE_INFINITY } },
        ])
            expect(() => engine.validateTarget({ groups: [], properties })).toThrow();
        const item = weapon();
        const total = itemProperties(engine, item).totalDps!;
        const target = engine.validateTarget({
            groups: [],
            expression: {
                operator: "and",
                operands: [
                    { groups: [], properties: { totalDps: { min: total, max: total } } },
                    {
                        groups: [],
                        expression: {
                            operator: "or",
                            negated: true,
                            operands: [
                                { groups: [], properties: { totalDps: { min: total + 0.01 } } },
                            ],
                        },
                    },
                ],
            },
        });
        expect(engine.matches(item, target)).toBe(true);
        expect(targetNeedsValues(target)).toBe(true);
        expect(
            engine.matches(
                item,
                engine.validateTarget({
                    groups: [],
                    properties: { totalDps: { max: total - 0.01 } },
                }),
            ),
        ).toBe(false);
    });

    it("uses local shield block modifiers without applying armour quality to block", () => {
        const [id, base] = Object.entries(catalog.bases).find(
            ([, entry]) => (entry.combat.block ?? 0) > 0 && entry.item_class === "Shield",
        )!;
        const empty = { ...engine.createItem(id), rarity: "rare" as const };
        const candidate = engine
            .pool(empty)
            .find((entry) =>
                entry.mod.stats.some((stat) =>
                    ["local_additional_block_chance_%", "local_block_chance_+%"].includes(stat.id),
                ),
            )!;
        const item = engine.addStartingMod({ ...empty, quality: 20 }, candidate.id, minimum);
        const flat =
            candidate.mod.stats.find((stat) => stat.id === "local_additional_block_chance_%")
                ?.min ?? 0;
        const increased =
            candidate.mod.stats.find((stat) => stat.id === "local_block_chance_+%")?.min ?? 0;
        expect(itemProperties(engine, item).blockChance).toBe(
            Math.floor((base.combat.block! + flat) * (1 + increased / 100)),
        );
        expect(itemProperties(engine, item).blockChance).toBe(
            itemProperties(engine, { ...item, quality: 0 }).blockChance,
        );
    });

    if (game === "poe1")
        it("replaces the normal quality bonus with the extracted Harvest enchantment", () => {
            const body = engine.apply(
                armour(),
                { kind: "harvest", id: "LifeBodyEnchant" },
                minimum,
            ).item;
            expect(itemProperties(engine, body).armour).toBe(25);
            const speed = engine.apply(
                weapon(),
                { kind: "harvest", id: "WeaponAttackSpeedEnchant" },
                minimum,
            ).item;
            expect(itemProperties(engine, speed)).toMatchObject({
                attacksPerSecond: 1.5,
                physicalDps: 25.5,
                elementalDps: 6.75,
                totalDps: 32.25,
            });
            const critical = engine.apply(
                speed,
                { kind: "harvest", id: "WeaponCriticalEnchant" },
                minimum,
            ).item;
            expect(itemProperties(engine, critical).criticalStrikeChance).toBe(5.75);
            expect(itemProperties(engine, critical).attacksPerSecond).toBe(1.47);
            const elemental = engine.apply(
                critical,
                { kind: "harvest", id: "WeaponElementalEnchant" },
                minimum,
            ).item;
            expect(itemProperties(engine, elemental)).toMatchObject({
                physicalDps: 24.99,
                elementalDps: 7.35,
                totalDps: 32.34,
            });
        });

    if (game === "poe2")
        it("counts socketed Rune bonuses and Sanctification's scaled modifier values", () => {
            const item = engine.apply(
                { ...weapon(), sockets: 2 },
                { kind: "augment", id: "Metadata/Items/SoulCores/RuneEnhancePerfect" },
                minimum,
            ).item;
            expect(itemProperties(engine, item)).toMatchObject({
                physicalDps: 23.94,
                elementalDps: 2.52,
                totalDps: 26.46,
            });
            const sanctified = engine.apply(
                item,
                {
                    ...currency("reroll_mod_values"),
                    omens: ["Metadata/Items/Currency/OmenOnDivineSanctify"],
                },
                minimum,
            ).item;
            expect(sanctified.sanctified).toBe(true);
            expect(itemProperties(engine, sanctified).physicalDps).toBeLessThan(
                itemProperties(engine, item).physicalDps!,
            );
            expect(itemProperties(engine, sanctified).criticalStrikeChance).toBeLessThan(
                itemProperties(engine, item).criticalStrikeChance!,
            );
            expect(sanctified.augments).toEqual(item.augments);
        });
});
