import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, type CraftingRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { itemProperties } from "../app/lib/crafting-properties";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { targetNeedsValues } from "../app/lib/crafting-targets";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const first: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };
const baseId = "Metadata/Items/Weapons/TwoHandWeapons/Crossbows/FourCrossbow1";
const reloadMod = "AbyssModCrossbowKurgalSuffixReloadSpeed";
const base = () => engine.createItem(baseId);
const reload = () => engine.addStartingMod(base(), reloadMod, first, "revealed");
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const divine = currency("reroll_mod_values");

describe("PoE 2 crossbow reload properties", () => {
    it("uses each exported crossbow's milliseconds and omits non-reloading weapons", () => {
        const crossbows = Object.entries(catalog.bases).filter(
            ([, entry]) => entry.item_class === "Crossbow",
        );
        expect(crossbows.length).toBeGreaterThan(20);
        for (const [id, entry] of crossbows) {
            expect(itemProperties(engine, engine.createItem(id)).reloadTime).toBe(
                entry.combat.reload_time ? entry.combat.reload_time / 1000 : undefined,
            );
        }
        expect(itemProperties(engine, base()).reloadTime).toBe(0.8);
        const bow = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Crude Bow",
        )![0];
        expect(itemProperties(engine, engine.createItem(bow)).reloadTime).toBeUndefined();
        const target = engine.validateTarget({
            groups: [],
            properties: { reloadTime: { min: 0.01 } },
        });
        expect(engine.matches(engine.createItem(bow), target)).toBe(false);
    });

    it("adds local attack and reload speed while leaving ordinary quality out of the rate", () => {
        const attack = engine.addStartingMod(base(), "LocalIncreasedAttackSpeed1", first);
        const both = engine.addStartingMod(reload(), "LocalIncreasedAttackSpeed1", first);
        expect(itemProperties(engine, attack)).toMatchObject({
            reloadTime: 0.76,
            attacksPerSecond: 1.68,
        });
        expect(itemProperties(engine, reload())).toMatchObject({
            reloadTime: 0.68,
            attacksPerSecond: 1.6,
        });
        expect(itemProperties(engine, both)).toMatchObject({
            reloadTime: 0.66,
            attacksPerSecond: 1.68,
        });
        expect(itemProperties(engine, { ...both, quality: 20 }).reloadTime).toBe(0.66);
    });

    it("uses Sanctification's scaled speed values and preserves the property in text and JSON", () => {
        const item = engine.apply(
            reload(),
            { ...divine, omens: ["Metadata/Items/Currency/OmenOnDivineSanctify"] },
            first,
        ).item;
        expect(item.sanctified).toBe(true);
        expect(itemProperties(engine, item).reloadTime).toBe(0.71);
        const imported = importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!
            .item;
        expect(itemProperties(engine, imported).reloadTime).toBe(0.71);
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        expect(itemProperties(engine, { ...item, destroyed: true })).toEqual({});
    });

    it("enumerates rounded reload thresholds and their complements over real Divine rolls", () => {
        const target = engine.validateTarget({
            groups: [],
            properties: { reloadTime: { max: 0.64 } },
        });
        expect(targetNeedsValues(target)).toBe(true);
        expect(calculateExact(engine, reload(), divine, target).probability).toBeCloseTo(1 / 9, 12);
        const complement = engine.validateTarget({
            groups: [],
            expression: { operator: "or", negated: true, operands: [target] },
        });
        expect(calculateExact(engine, reload(), divine, complement).probability).toBeCloseTo(
            8 / 9,
            12,
        );
        const frozen = engine.addStartingMod(base(), "LocalIncreasedAttackSpeed1", first);
        frozen.mods[0]!.fractured = true;
        expect(
            calculateExact(
                engine,
                frozen,
                divine,
                engine.validateTarget({ groups: [], properties: { reloadTime: { max: 0.75 } } }),
            ).probability,
        ).toBe(0);
        for (const range of [{ min: -1 }, { min: 0.8, max: 0.7 }, { max: Infinity }])
            expect(() =>
                engine.validateTarget({ groups: [], properties: { reloadTime: range } }),
            ).toThrow();
    });

    it("calculates retry costs and matches seeded process simulation", () => {
        const target = engine.validateTarget({
            groups: [],
            properties: { reloadTime: { max: 0.64 } },
        });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: reload(),
            method: divine,
            target,
            steps: [
                {
                    id: "divine",
                    method: divine,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "divine",
                },
            ],
            prices: { [divine.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(17 / 81, 12);
        expect(exact.meanCost).toBeCloseTo(17 / 3, 12);
        const simulation = new CraftingSimulation(
            catalog,
            craftingProjectSchema.parse(JSON.parse(JSON.stringify(project))),
            true,
        );
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(exact.probability, 1);
        expect(simulation.result().meanCost).toBeCloseTo(exact.meanCost!, 1);
        expect(simulation.result().errors).toEqual({});
    });

    it("recomputes reload conditions when Annulment removes either speed modifier", () => {
        const item = engine.addStartingMod(reload(), "LocalIncreasedAttackSpeed1", first);
        const target = engine.validateTarget({
            groups: [],
            properties: { reloadTime: { max: 0.7 } },
        });
        expect(
            calculateExact(engine, item, currency("remove_random_mod"), target).probability,
        ).toBe(0.5);
        const after = engine.apply(item, currency("remove_random_mod"), first).item;
        expect(itemProperties(engine, after).reloadTime).toBe(0.76);
    });
});
