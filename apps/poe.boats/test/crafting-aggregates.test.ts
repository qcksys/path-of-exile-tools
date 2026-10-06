import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
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
    craftingProjectSchema,
} from "../app/schemas/crafting";

const minimum: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };

describe.each(["poe1", "poe2"] as const)("%s aggregate item properties", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const create = (name: string) =>
        engine.createItem(Object.entries(catalog.bases).find(([, base]) => base.name === name)![0]);
    const divine = {
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === "reroll_mod_values")!.id,
    };

    it("counts every extracted single, dual and all-resistance binding with the correct multiplicity", () => {
        const bindings: [string, number, number][] = [
            ["base_cold_damage_resistance_%", 1, 1],
            ["base_fire_damage_resistance_%", 1, 1],
            ["base_lightning_damage_resistance_%", 1, 1],
            ["base_chaos_damage_resistance_%", 0, 1],
            ["fire_and_lightning_damage_resistance_%", 2, 2],
            ["fire_and_cold_damage_resistance_%", 2, 2],
            ["cold_and_lightning_damage_resistance_%", 2, 2],
            ["cold_and_chaos_damage_resistance_%", 1, 2],
            ["fire_and_chaos_damage_resistance_%", 1, 2],
            ["lightning_and_chaos_damage_resistance_%", 1, 2],
            ["base_resist_all_elements_%", 3, 3],
            ...(game === "poe1" ? ([["resist_all_%", 3, 4]] as [string, number, number][]) : []),
        ];
        for (const [stat, elemental, total] of bindings) {
            const [id, mod] = Object.entries(catalog.mods).find(
                ([, mod]) => mod.stats.length === 1 && mod.stats[0]!.id === stat,
            )!;
            const item = { ...create("Crude Bow"), mods: [engine.rollMod(id, minimum)] };
            expect(itemProperties(engine, item), stat).toMatchObject({
                elementalResistance: mod.stats[0]!.min * elemental,
                totalResistance: mod.stats[0]!.min * total,
                flatLife: 0,
            });
        }
        if (game === "poe2")
            expect(
                Object.values(catalog.mods).some((mod) =>
                    mod.stats.some((stat) => stat.id === "resist_all_%"),
                ),
            ).toBe(false);
    });

    it("sums implicit and explicit rolls, while blank items expose zero-valued requirements", () => {
        const blank = create("Crude Bow");
        expect(itemProperties(engine, blank)).toMatchObject({
            elementalResistance: 0,
            totalResistance: 0,
            flatLife: 0,
        });
        let item: CraftingItem = { ...create("Ruby Ring"), rarity: "rare" };
        const implicit = item.implicits.reduce((sum, mod) => sum + mod.values[0]!, 0);
        for (const id of ["ColdResist1", "AllResistances1", "ChaosResist1", "IncreasedLife1"])
            item = engine.addStartingMod(item, id, minimum);
        const elemental = implicit + 6 + 9;
        const total = elemental + engine.mod("ChaosResist1").stats[0]!.min;
        expect(itemProperties(engine, item)).toEqual({
            requiredLevel: game === "poe1" ? 16 : 12,
            elementalResistance: elemental,
            totalResistance: total,
            flatLife: 10,
        });
        const target = engine.validateTarget({
            groups: [],
            properties: {
                elementalResistance: { min: elemental, max: elemental },
                totalResistance: { min: total, max: total },
                flatLife: { min: 10, max: 10 },
            },
        });
        expect(engine.matches(item, target)).toBe(true);
        expect(engine.matches(blank, target)).toBe(false);
        expect(
            itemProperties(
                engine,
                importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!.item,
            ),
        ).toEqual(itemProperties(engine, item));
    });

    it("counts direct life after catalyst scaling without turning strength, maximum resistances or conditions into flat totals", () => {
        let item = engine.addStartingMod(create("Ruby Ring"), "IncreasedLife1", minimum);
        const catalyst = catalog.crafting.catalysts.find((entry) =>
            entry.tags.includes(game === "poe1" ? "resource" : "life"),
        )!;
        item = engine.validateItem({ ...item, catalyst: { id: catalyst.id, quality: 20 } });
        expect(itemProperties(engine, item).flatLife).toBe(12);
        const ignored = [
            "additional_strength",
            "base_maximum_fire_damage_resistance_%",
            "fire_resistance_%_while_on_low_life",
        ];
        let checked = 0;
        for (const stat of ignored) {
            const candidate = Object.entries(catalog.mods).find(
                ([, mod]) => mod.stats.length === 1 && mod.stats[0]!.id === stat,
            );
            if (!candidate) continue;
            checked++;
            const input = { ...create("Crude Bow"), mods: [engine.rollMod(candidate[0], minimum)] };
            expect(itemProperties(engine, input)).toMatchObject({
                elementalResistance: 0,
                totalResistance: 0,
                flatLife: 0,
            });
        }
        expect(checked).toBeGreaterThanOrEqual(2);
    });

    it("validates signed aggregate bounds while keeping defences and DPS nonnegative", () => {
        const target = engine.validateTarget({
            groups: [],
            properties: {
                elementalResistance: { min: -20, max: 0 },
                totalResistance: { min: -20 },
                flatLife: { max: 0 },
            },
        });
        expect(engine.matches(create("Crude Bow"), target)).toBe(true);
        for (const properties of [
            { elementalResistance: {} },
            { totalResistance: { min: 0, max: -1 } },
            { flatLife: { max: Number.NEGATIVE_INFINITY } },
            { armour: { min: -1 } },
            { physicalDps: { max: -1 } },
        ])
            expect(() => engine.validateTarget({ groups: [], properties })).toThrow();
        if (game === "poe1") {
            const input = {
                ...create("Crude Bow"),
                mods: [engine.rollMod("DelveHelmetEnemyColdResistanceAura1", minimum)],
            };
            expect(itemProperties(engine, input)).toMatchObject({
                elementalResistance: -9,
                totalResistance: -9,
            });
            expect(engine.matches(input, target)).toBe(true);
        }
    });

    it("enumerates the combined roll distribution in nested ordered routes and seeded simulations", () => {
        let item: CraftingItem = { ...create("Ruby Ring"), rarity: "rare" };
        for (const id of ["ColdResist1", "AllResistances1"])
            item = engine.addStartingMod(item, id, minimum);
        const highest = {
            ...item,
            mods: item.mods.map((mod) => ({
                ...mod,
                values: engine.mod(mod.id).stats.map((stat) => stat.max),
            })),
        };
        const threshold = itemProperties(engine, highest).elementalResistance! - 1;
        const target = engine.validateTarget({
            groups: [],
            expression: {
                operator: "and",
                operands: [
                    { groups: [], properties: { elementalResistance: { min: threshold } } },
                    {
                        groups: [],
                        expression: {
                            operator: "or",
                            negated: true,
                            operands: [{ groups: [], properties: { totalResistance: { max: 0 } } }],
                        },
                    },
                ],
            },
        });
        expect(hasCraftingRequirements(target)).toBe(true);
        expect(targetNeedsValues(target)).toBe(true);
        const expected = 2 / (3 * (game === "poe1" ? 6 : 5));
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
                    id: "roll",
                    method: divine,
                    condition: { groups: [] },
                    onFailure: "failure",
                    branches: [{ id: "resistance", condition: target, destination: "success" }],
                },
            ],
            prices: { [divine.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const restored = craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)));
        const exact = calculateProcessExact(engine, restored);
        expect(exact.probability).toBeCloseTo(expected);
        expect(exact.meanCost).toBeCloseTo(2);
        const simulation = new CraftingSimulation(catalog, restored, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().probability).toBeCloseTo(expected, 1);
        expect(simulation.result().meanCost).toBe(2);
    });

    if (game === "poe1") {
        it.each([
            "LifeBodyEnchant",
            "FireResistBodyEnchant",
            "ColdResistBodyEnchant",
            "LightningResistBodyEnchant",
        ])("adds %s quality bonuses once, with whole-point thresholds and text round trips", (id) => {
            let start: CraftingItem = { ...create("Plate Vest"), rarity: "rare" };
            for (const mod of ["IncreasedLife1", "FireResist1", "ChaosResist1"])
                start = engine.addStartingMod(start, mod, minimum);
            const baseline = itemProperties(engine, start);
            for (const [quality, bonus] of [
                [0, 0],
                [1, 0],
                [2, 1],
                [19, 9],
                [20, 10],
                [29, 14],
                [30, 15],
            ]) {
                const input = engine.validateItem({ ...start, quality });
                const result = engine.apply(input, { kind: "harvest", id }, minimum);
                const life = id === "LifeBodyEnchant";
                const expected = {
                    flatLife: baseline.flatLife! + (life ? bonus! : 0),
                    elementalResistance: baseline.elementalResistance! + (life ? 0 : bonus!),
                    totalResistance: baseline.totalResistance! + (life ? 0 : bonus!),
                };
                expect(itemProperties(engine, result.item)).toMatchObject(expected);
                expect(engine.statTotals(result.item)).toEqual(engine.statTotals(input));
                const property = life ? "flatLife" : "totalResistance";
                expect(
                    engine.matches(
                        result.item,
                        engine.validateTarget({
                            groups: [],
                            properties: {
                                [property]: { min: expected[property], max: expected[property] },
                            },
                        }),
                    ),
                ).toBe(true);
                const imported = importCraftingItemText(
                    engine,
                    exportCraftingItemText(engine, result.item),
                )[0]!.item;
                expect(itemProperties(engine, imported)).toMatchObject(expected);
                const replaced = engine.apply(
                    result.item,
                    { kind: "harvest", id: "ManaBodyEnchant" },
                    minimum,
                ).item;
                expect(itemProperties(engine, replaced)).toEqual(baseline);
                expect(input.enchantments).toBeUndefined();
            }
        });

        it("rechecks quality-derived life after each currency use in exact and sampled processes", () => {
            const start = engine.addStartingMod(
                { ...create("Plate Vest"), quality: 18 },
                "IncreasedLife1",
                minimum,
            );
            const item = engine.apply(
                start,
                { kind: "harvest", id: "LifeBodyEnchant" },
                minimum,
            ).item;
            const method = {
                kind: "currency" as const,
                id: catalog.crafting.baseQuality.find(
                    (entry) => !entry.corrupted && entry.itemClasses.includes("Body Armour"),
                )!.id,
            };
            const target = engine.validateTarget({
                groups: [],
                properties: { flatLife: { min: 20 } },
            });
            expect(itemProperties(engine, item).flatLife).toBe(19);
            expect(calculateExact(engine, item, method, target).probability).toBe(0);
            expect(
                calculateExact(engine, { ...item, quality: 19 }, method, target).probability,
            ).toBe(1);
            const project = craftingProjectSchema.parse({
                format: 1,
                game,
                patch: catalog.patch,
                item,
                method,
                target,
                steps: [
                    {
                        id: "quality",
                        method,
                        condition: target,
                        onSuccess: "success",
                        onFailure: "quality",
                    },
                ],
                prices: { [method.id]: 3 },
                seed: 42,
                iterations: 100,
                maxActions: 2,
            });
            const restored = craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)));
            expect(calculateProcessExact(engine, restored)).toMatchObject({
                probability: 1,
                meanCost: 6,
            });
            const simulation = new CraftingSimulation(catalog, restored, true);
            for (let index = 0; index < project.iterations; index++) simulation.runTrial();
            expect(simulation.result()).toMatchObject({ probability: 1, meanCost: 6, errors: {} });
        });

        it("keeps quality life fixed while Divine rolls direct life", () => {
            const start = engine.addStartingMod(
                { ...create("Plate Vest"), quality: 20 },
                "IncreasedLife1",
                minimum,
            );
            const item = engine.apply(
                start,
                { kind: "harvest", id: "LifeBodyEnchant" },
                minimum,
            ).item;
            const life = engine.mod("IncreasedLife1").stats[0]!;
            const target = engine.validateTarget({
                groups: [],
                properties: { flatLife: { min: life.max + 10 } },
            });
            expect(calculateExact(engine, item, divine, target).probability).toBeCloseTo(
                1 / (life.max - life.min + 1),
            );
            expect(item.enchantments).toEqual(
                engine.apply(item, divine, minimum).item.enchantments,
            );
        });

        it("applies implicit modifier magnitude and resistance catalysts before summing", () => {
            const item = engine.addStartingMod(
                { ...create("Simplex Amulet"), rarity: "rare" },
                "AllResistances1",
                minimum,
            );
            const catalyst = catalog.crafting.catalysts.find((entry) =>
                entry.tags.includes("resistance"),
            )!;
            item.mods[0]!.values = [5];
            const scaled = engine.validateItem({
                ...item,
                catalyst: { id: catalyst.id, quality: 20 },
            });
            expect(itemProperties(engine, item)).toMatchObject({
                elementalResistance: 30,
                totalResistance: 30,
            });
            expect(itemProperties(engine, scaled)).toMatchObject({
                elementalResistance: 33,
                totalResistance: 33,
            });
        });
    }

    if (game === "poe2")
        it("sums socketed resistance bonuses independently of Sanctification's modifier scaling", () => {
            let item = engine.addStartingMod(
                { ...create("Rusted Cuirass"), rarity: "rare", sockets: 2 },
                "ColdResist1",
                minimum,
            );
            item = engine.addStartingMod(item, "IncreasedLife1", minimum);
            item = engine.apply(
                item,
                { kind: "augment", id: "Metadata/Items/SoulCores/RuneFire" },
                minimum,
            ).item;
            const fire = engine.statTotals(item).get("base_fire_damage_resistance_%")!;
            expect(fire).toBeGreaterThan(0);
            expect(itemProperties(engine, item)).toMatchObject({
                elementalResistance: fire + 6,
                totalResistance: fire + 6,
                flatLife: 10,
            });
            const scaled = engine.apply(
                item,
                { ...divine, omens: ["Metadata/Items/Currency/OmenOnDivineSanctify"] },
                minimum,
            ).item;
            expect(itemProperties(engine, scaled)).toMatchObject({
                elementalResistance: fire + 5,
                totalResistance: fire + 5,
                flatLife: 8,
            });
            expect(scaled.augments).toEqual(item.augments);
        });
});
