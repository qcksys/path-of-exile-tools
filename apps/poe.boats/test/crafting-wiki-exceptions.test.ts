/** biome-ignore-all lint/style/useNamingConvention: Ring recipes retain canonical Breachlord names. */
import { describe, expect, it, vi } from "vite-plus/test";
import { availableEnchantments } from "../app/lib/crafting-enchantments";
import { seededRandom } from "../app/lib/crafting-engine";
import {
    breachlords,
    graspingMailBase,
    graspingModifiers,
    graspingPool,
    isBreachModifier,
} from "../app/lib/crafting-grasping";
import { heistEnchantments } from "../app/lib/crafting-heist";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import { CraftingSimulation, calculateExact } from "../app/lib/crafting-simulation";
import { socketLimit } from "../app/lib/crafting-sockets";
import { modifierEffect, scaledModValues } from "../app/lib/crafting-text";
import { type CraftingItem, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const rolled = (id: string) => ({
    id,
    values: engine.mod(id).stats.map((stat) => stat.min),
    crafted: false,
    fractured: false,
});
const enchanted = (id: string, base = baseId) =>
    engine.validateItem({ ...engine.createItem(base), enchantments: [rolled(id)] });
const mail = () => engine.createItem(graspingMailBase);

describe("wiki-sourced Grasping Mail recipe", () => {
    it("resolves all 25 current modifiers from the build and normalizes by ring composition", () => {
        const legacy = graspingPool(catalog, mail(), "legacy");
        expect(legacy).toHaveLength(25);
        expect(legacy.map((entry) => entry.id)).not.toContain(
            "BreachBodyArcticArmourReservationCost1",
        );
        for (const [lord, id, weight] of graspingModifiers) {
            expect(legacy.find((entry) => entry.id === id)).toMatchObject({
                lord,
                weight,
                mod: engine.mod(id),
            });
            expect(engine.mod(id).required_level).toBe(1);
        }
        const pool = graspingPool(catalog, mail(), {
            Xoph: 30,
            Tul: 15,
            Esh: 15,
            "Uul-Netol": 0,
            Chayula: 0,
        });
        expect(pool.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(60);
        expect(
            pool
                .filter((entry) => entry.lord === "Xoph")
                .reduce((sum, entry) => sum + entry.weight, 0),
        ).toBeCloseTo(30);
        expect(pool.find((entry) => entry.id === graspingModifiers[0][1])!.weight).toBeCloseTo(
            (30 * 250) / 2250,
        );
    });

    it.each(breachlords)("honors 60 %s rings and retains legal affix groups and counts", (lord) => {
        const rings = { Xoph: 0, Tul: 0, Esh: 0, "Uul-Netol": 0, Chayula: 0, [lord]: 60 };
        for (let seed = 0; seed < 30; seed++) {
            const item = engine.apply(
                mail(),
                { kind: "generate", id: "rare", breachRings: rings },
                seededRandom(seed),
            ).item;
            const specials = item.mods.filter((mod) => isBreachModifier(catalog, item, mod.id));
            expect(specials.length).toBeGreaterThanOrEqual(1);
            expect(specials.length).toBeLessThanOrEqual(3);
            expect(
                specials.every((mod) =>
                    graspingModifiers.some(([owner, id]) => owner === lord && id === mod.id),
                ),
            ).toBe(true);
            expect(item.mods.length).toBeGreaterThanOrEqual(4);
            expect(item.mods.length).toBeLessThanOrEqual(6);
            expect(engine.validateItem(item)).toEqual(item);
        }
    });

    it("uses the disclosed approximate count distribution and validates rings before randomness", () => {
        const random = seededRandom(7);
        const pick = vi.spyOn(random, "pick");
        engine.apply(mail(), { kind: "generate", id: "rare" }, random);
        expect(pick).toHaveBeenCalledWith([
            { value: 1, weight: 50 },
            { value: 2, weight: 33 },
            { value: 3, weight: 17 },
        ]);
        pick.mockClear();
        expect(() =>
            engine.apply(
                mail(),
                {
                    kind: "generate",
                    id: "rare",
                    breachRings: { Xoph: 59, Tul: 0, Esh: 0, "Uul-Netol": 0, Chayula: 0 },
                },
                random,
            ),
        ).toThrow("60");
        expect(() =>
            engine.apply(
                engine.createItem(baseId),
                { kind: "generate", id: "rare", breachRings: "legacy" },
                random,
            ),
        ).toThrow("Grasping Mail");
        expect(pick).not.toHaveBeenCalled();
    });

    it("preserves Breach modifiers for divine and transfer but does not reroll them with chaos", () => {
        const item = engine.apply(mail(), { kind: "generate", id: "rare" }, seededRandom(8)).item;
        const before = structuredClone(item);
        expect(
            engine
                .apply(item, currency("reroll_mod_values"), seededRandom(1))
                .item.mods.map((mod) => mod.id),
        ).toEqual(item.mods.map((mod) => mod.id));
        expect(
            engine
                .apply(item, currency("reroll"), seededRandom(1))
                .item.mods.some((mod) => isBreachModifier(catalog, item, mod.id)),
        ).toBe(false);
        expect(item).toEqual(before);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, item)).map(
                (entry) => entry.item,
            ),
        ).toContainEqual(item);
        const specials = item.mods.filter((mod) => isBreachModifier(catalog, item, mod.id));
        const outcomes = recombinationOutcomes(
            engine,
            { ...item, mods: specials.slice(0, 1) },
            engine.createItem(baseId, 50),
        );
        expect(
            outcomes.some(
                ({ value }) =>
                    value.baseId === baseId &&
                    value.mods.some((mod) => isBreachModifier(catalog, value, mod.id)),
            ),
        ).toBe(true);
        expect(
            outcomes.every(
                ({ value }) =>
                    value.mods.filter((mod) => isBreachModifier(catalog, value, mod.id)).length <=
                    1,
            ),
        ).toBe(true);
    });

    it("saves recipe composition and charges each generated item in worker-compatible simulation", () => {
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: mail(),
            method: { kind: "generate", id: "rare", breachRings: "legacy" },
            steps: [],
            target: { groups: [], rarity: "rare" },
            prices: { "generated:rare": 60 },
            baseCost: 0,
            iterations: 10,
            maxActions: 1,
            seed: 3,
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
        const sim = new CraftingSimulation(catalog, project);
        for (let n = 0; n < 10; n++) sim.runTrial();
        expect(sim.result()).toMatchObject({
            successes: 10,
            totalActions: 10,
            meanCost: 60,
            errors: {},
        });
    });
});

describe("manual Heist enchantments with unknown random odds", () => {
    it("exports the current wiki pools without synthesizing random weights", () => {
        const pool = heistEnchantments(catalog);
        expect(pool.filter((entry) => entry.recipe === "Tempering Orb")).toHaveLength(136);
        expect(pool.filter((entry) => entry.recipe === "Tailoring Orb")).toHaveLength(54);
        for (const entry of pool) {
            expect(engine.mod(entry.mod).spawn_weights).toEqual([]);
            expect(entry.mod).not.toMatch(/WhiteSocket|Only(?:Red|Green|Blue)Sockets/);
            expect(availableEnchantments(catalog)).toContainEqual(entry);
        }
    });

    it("applies magnitude bonuses and penalties only to matching explicit tags", () => {
        const item = enchanted("ArmourEnchantmentHeistLifeEffect1");
        item.rarity = "rare";
        const life = engine
            .pool(item)
            .find(
                ({ mod }) =>
                    mod.implicit_tags.includes("life") &&
                    mod.stats.some((stat) => stat.id === "base_maximum_life"),
            )!;
        item.mods = [rolled(life.id)];
        expect(modifierEffect(catalog, item, life.id)).toBe(8);
        expect(scaledModValues(catalog, item.mods[0]!, item)).toEqual(
            item.mods[0]!.values.map((value) => Math.floor(value * 1.08)),
        );
        const penalty = enchanted("ArmourEnchantmentHeistAttributeEffectLifeEffectPenalty1_");
        expect(modifierEffect(catalog, penalty, life.id)).toBe(-50);
    });

    it("adds crafted capacity, reduces socket capacity and enforces linked sockets after later crafts", () => {
        const extra = enchanted("ArmourEnchantmentHeistAdditionalCraftingModifier1");
        expect(engine.craftedLimit(extra)).toBe(2);
        const sockets = enchanted("ArmourEnchantmentHeistLifeEffectSocketPenalty1");
        expect(socketLimit(catalog, sockets)).toBe(3);
        expect(socketLimit(catalog, sockets, 1)).toBe(
            socketLimit(catalog, engine.createItem(baseId), 1),
        );
        expect(() => engine.validateItem({ ...sockets, sockets: 6 })).toThrow("Socket count");
        let linked: CraftingItem = engine.validateItem({
            ...enchanted("ArmourEnchantmentHeistSocketsAreLinked1"),
            sockets: 6,
        });
        expect(linked.socketLinks).toEqual([true, true, true, true, true]);
        const recipe = catalog.crafting.bench.find(
            (entry) => entry.socketCount === 3 && entry.itemClasses.includes("Body Armour"),
        )!;
        linked = engine.apply(linked, { kind: "bench", id: recipe.id }, seededRandom(1)).item;
        expect(linked.socketLinks).toEqual([true, true]);
    });

    it("round-trips manual enchantments and calculates subsequent crafts without enchantment roll costs", () => {
        const item = engine.apply(
            enchanted("ArmourEnchantmentHeistLifeEffect1"),
            currency("transmute_to_magic"),
            seededRandom(1),
        ).item;
        const text = exportCraftingItemText(engine, item);
        expect(importCraftingItemText(engine, text).map((entry) => entry.item)).toContainEqual(
            item,
        );
        const target = engine.validateTarget({
            groups: [],
            enchantments: [item.enchantments![0]!.id],
        });
        expect(
            calculateExact(engine, item, currency("remove_random_mod"), target).probability,
        ).toBe(1);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency("remove_random_mod"),
            steps: [],
            prices: {},
            seed: 1,
            target,
            iterations: 2,
            maxActions: 1,
        });
        const sim = new CraftingSimulation(catalog, project);
        sim.runTrial();
        expect(sim.result()).toMatchObject({ successes: 1, errors: {} });
        expect(Object.keys(sim.result().spending)).not.toContain("Tempering Orb");
    });

    it("rejects weapon enchantments on armour, invalid values and unavailable level requirements", () => {
        expect(() => enchanted("WeaponEnchantmentHeistPhysicalEffect1")).toThrow("not available");
        expect(() =>
            engine.validateItem({
                ...engine.createItem(baseId, 1),
                enchantments: [rolled("ArmourEnchantmentHeistAdditionalCraftingModifier1")],
            }),
        ).toThrow("not available");
        expect(() =>
            engine.validateItem({
                ...enchanted("ArmourEnchantmentHeistLifeEffect1"),
                enchantments: [{ ...rolled("ArmourEnchantmentHeistLifeEffect1"), values: [99] }],
            }),
        ).toThrow();
    });
});
