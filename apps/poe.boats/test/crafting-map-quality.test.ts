import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableMapQuality, mapQualityRecipe } from "../app/lib/crafting-quality";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const blank = engine.createItem("Metadata/Items/Maps/MapAtlasBeach", 86);
const quantity = mapQualityRecipe(catalog, blank)!;
const rarity = catalog.crafting.mapQuality.find(
    (entry) => entry.description === "Quality (Rarity)",
)!;
const method = { kind: "currency" as const, id: rarity.id };

describe("map quality chisels", () => {
    it("applies all extracted types with rarity increments, level independence and one-currency costs", () => {
        expect(availableMapQuality(catalog, blank)).toHaveLength(6);
        for (const recipe of catalog.crafting.mapQuality)
            for (const [itemRarity, increment] of [
                ["normal", 5],
                ["magic", 2],
                ["rare", 1],
            ] as const)
                for (const level of [1, 86]) {
                    const input = { ...blank, level, rarity: itemRarity };
                    const result = engine.apply(
                        input,
                        { kind: "currency", id: recipe.id },
                        seededRandom(42),
                    );
                    expect(result.item.quality).toBe(increment);
                    expect(mapQualityRecipe(catalog, result.item)?.id).toBe(recipe.id);
                    expect(result.cost).toEqual([
                        { id: recipe.id, name: engine.costName(recipe.id), amount: 1 },
                    ]);
                    expect(input.quality).toBe(0);
                }
        const changed = structuredClone(catalog);
        changed.crafting.mapQuality.find((entry) => entry.id === rarity.id)!.maximumQuality = 23;
        expect(
            new CraftingEngine(changed).apply(
                { ...blank, mapQuality: rarity.id, quality: 21 },
                method,
                seededRandom(42),
            ).item.quality,
        ).toBe(23);
    });

    it("caps increments, replaces types in both directions and retains excess quality on other crafts", () => {
        const full = { ...blank, quality: 30 };
        const replaced = engine.apply(full, method, seededRandom(42)).item;
        expect(replaced.quality).toBe(5);
        expect(replaced.mapQuality).toBe(rarity.id);
        expect(
            engine.apply({ ...replaced, quality: 19 }, method, seededRandom(42)).item.quality,
        ).toBe(20);
        const restored = engine.apply(
            replaced,
            { kind: "currency", id: quantity.id },
            seededRandom(42),
        ).item;
        expect(restored.quality).toBe(5);
        expect(restored.mapQuality).toBeUndefined();
        const high = { ...replaced, quality: 30 };
        const rolled = engine.apply(high, currency("transmute_to_rare"), seededRandom(42)).item;
        expect(rolled.quality).toBe(30);
        expect(rolled.mapQuality).toBe(rarity.id);
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        for (const quality of [20, 30])
            expect(() => engine.apply({ ...replaced, quality }, method, random)).toThrow(
                "maximum quality",
            );
        expect(pick).not.toHaveBeenCalled();
    });

    it("preserves fractured affixes, memory influence and map tier without modifying source items", () => {
        let input = engine.addStartingMod(
            { ...blank, rarity: "rare" },
            engine.pool({ ...blank, rarity: "rare" })[0]!.id,
            seededRandom(4),
        );
        input = { ...input, memoryMap: { intentions: 2 } };
        input.mods[0]!.fractured = true;
        const snapshot = structuredClone(input);
        const result = engine.apply(input, method, seededRandom(42)).item;
        expect(result).toEqual({ ...snapshot, mapQuality: rarity.id, quality: 1 });
        expect(input).toEqual(snapshot);
        const text = exportCraftingItemText(engine, result);
        expect(text).toContain("Quality (Rarity): +1%");
        expect(importCraftingItemText(engine, text)[0]!.item).toEqual(result);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result)))).toEqual(result);
    });

    it("matches typed and generic quality conditions and adds extracted stats only to the all scope", () => {
        for (const recipe of catalog.crafting.mapQuality) {
            const item = engine.apply(
                blank,
                { kind: "currency", id: recipe.id },
                seededRandom(1),
            ).item;
            for (const stat of recipe.stats) {
                expect(engine.statTotals(item).get(stat)).toBe(5);
                expect(engine.statTotals(item, "explicit").get(stat)).toBeUndefined();
                expect(engine.statTotals(item, "implicit").get(stat)).toBeUndefined();
                expect(
                    engine.matches(
                        item,
                        engine.validateTarget({ groups: [], stats: [{ id: stat, min: 5 }] }),
                    ),
                ).toBe(true);
            }
            const target = engine.validateTarget({
                groups: [],
                quality: { min: 5, max: 5, mapType: recipe.id },
            });
            expect(
                calculateExact(engine, blank, { kind: "currency", id: recipe.id }, target)
                    .probability,
            ).toBe(1);
            expect(engine.matches({ ...item, mapQuality: undefined }, target)).toBe(
                recipe.id === quantity.id,
            );
        }
        const target = engine.validateTarget({
            groups: [],
            quality: { min: 0, max: 30, mapType: quantity.id },
        });
        expect(engine.matches(blank, target)).toBe(true);
        expect(engine.matches(engine.createItem(baseId), target)).toBe(false);
        expect(
            calculateExact(
                engine,
                blank,
                method,
                engine.validateTarget({ groups: [], quality: { min: 5, max: 5 } }),
            ).probability,
        ).toBe(1);
    });

    it("calculates and simulates repeated chisels with actual costs and retained process state", () => {
        const condition = engine.validateTarget({
            groups: [],
            quality: { min: 20, max: 20, mapType: rarity.id },
        });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: { ...blank, quality: 20 },
            method,
            target: condition,
            steps: [{ id: "chisel", method, condition, onSuccess: "success", onFailure: "chisel" }],
            useProcess: true,
            prices: { [rarity.id]: 3 },
            seed: 42,
            iterations: 50,
            maxActions: 4,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(1);
        expect(exact.meanCost).toBe(12);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 50; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 50,
            meanCost: 12,
            totalActions: 200,
            errors: {},
            spending: { [rarity.id]: 200 },
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("rejects invalid bases, unavailable types, corruption and mirroring before randomness, including PoE 2", () => {
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            engine.createItem(baseId),
            { ...blank, corrupted: true },
            { ...blank, mirrored: true },
        ])
            expect(() => engine.apply(item, method, random)).toThrow();
        expect(() => engine.validateItem({ ...blank, mapQuality: "unknown" })).toThrow(
            "map quality",
        );
        expect(() =>
            engine.validateItem({ ...engine.createItem(baseId), mapQuality: rarity.id }),
        ).toThrow("map quality");
        expect(() =>
            engine.validateTarget({ groups: [], quality: { min: 0, max: 20, mapType: "unknown" } }),
        ).toThrow("map quality");
        const two = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        const waystone = two.createItem(two.catalog.crafting.waystones[0]!.id);
        expect(two.currencySupported("add_map_alt_quality")).toBe(false);
        expect(availableMapQuality(two.catalog, waystone)).toEqual([]);
        expect(() => two.validateItem({ ...waystone, mapQuality: rarity.id })).toThrow(
            "map quality",
        );
        expect(() =>
            two.validateTarget({ groups: [], quality: { min: 0, max: 20, mapType: rarity.id } }),
        ).toThrow("map quality");
        expect(pick).not.toHaveBeenCalled();
    });

    it("round trips every type through game quality headings and rejects conflicting headers", () => {
        for (const recipe of catalog.crafting.mapQuality) {
            const item = engine.apply(
                blank,
                { kind: "currency", id: recipe.id },
                seededRandom(42),
            ).item;
            const text = exportCraftingItemText(engine, item);
            expect(importCraftingItemText(engine, text)[0]!.item).toEqual(item);
            const gameText = exportCraftingItemText(engine, blank).replace(
                "Quality: 0",
                `${recipe.description}: +5% (augmented)`,
            );
            expect(importCraftingItemText(engine, gameText)[0]!.item).toEqual(item);
            expect(() => importCraftingItemText(engine, `${gameText}\nQuality: 3`)).toThrow(
                "Map quality",
            );
        }
    });
});
