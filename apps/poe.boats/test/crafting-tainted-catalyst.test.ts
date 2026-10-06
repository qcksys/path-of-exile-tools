import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableCatalysts, taintedCatalystOutcomes } from "../app/lib/crafting-quality";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { rolledModText } from "../app/lib/crafting-text";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const method = currency("add_random_jewellery_quality");
const recipe = catalog.crafting.taintedCatalysts[0]!;
const normal = engine.createItem("Metadata/Items/Rings/Ring1", 86);
const corrupted = { ...normal, corrupted: true };
const fertile = catalog.crafting.catalysts.find((entry) => entry.tags.includes("resource"))!;

describe("Tainted Catalyst", () => {
    it("uses all extracted compatible quality types and includes both quality endpoints", () => {
        expect(engine.currencySupported("add_random_jewellery_quality")).toBe(true);
        expect(recipe.itemClasses).toEqual(["Amulet", "Belt", "Ring"]);
        const outcomes = taintedCatalystOutcomes(catalog, corrupted, recipe.id);
        expect(outcomes).toHaveLength(240);
        expect(new Set(outcomes.map((entry) => entry.value.id)).size).toBe(12);
        for (const catalyst of availableCatalysts(catalog, corrupted)) {
            expect(outcomes.filter((entry) => entry.value.id === catalyst.id)).toEqual(
                Array.from({ length: 20 }, (_, index) => ({
                    value: { id: catalyst.id, quality: index + 1 },
                    weight: 1,
                })),
            );
        }
        const changed = structuredClone(catalog);
        changed.crafting.taintedCatalysts[0]!.maximumQuality = 5;
        changed.crafting.catalysts = [fertile];
        expect(taintedCatalystOutcomes(changed, corrupted, recipe.id)).toHaveLength(5);
        const narrower = new CraftingEngine(changed);
        const target = narrower.validateTarget({ groups: [], catalyst: { min: 5, max: 5 } });
        expect(calculateExact(narrower, corrupted, method, target).probability).toBeCloseTo(
            1 / 5,
            12,
        );
    });

    it.each([
        "normal",
        "magic",
        "rare",
    ] as const)("replaces quality on %s corrupted jewellery and preserves affixes and flags", (rarity) => {
        for (const itemClass of recipe.itemClasses) {
            const id = Object.entries(catalog.bases).find(
                ([, base]) => base.item_class === itemClass && !base.corrupted,
            )![0];
            let item = { ...engine.createItem(id), rarity };
            if (rarity !== "normal")
                item = engine.addStartingMod(item, "IncreasedLife1", seededRandom(1));
            item = {
                ...item,
                corrupted: true,
                memoryStrands: 32,
                catalyst: { id: fertile.id, quality: 20 },
            };
            if (item.mods.length) item.mods[0]!.fractured = true;
            const original = structuredClone(item);
            const random = seededRandom(1);
            const pick = vi
                .spyOn(random, "pick")
                .mockImplementation(
                    (choices) =>
                        choices.find(
                            (entry) =>
                                typeof entry.value === "object" &&
                                entry.value !== null &&
                                "id" in entry.value &&
                                entry.value.id === fertile.id &&
                                "quality" in entry.value &&
                                entry.value.quality === 1,
                        )!.value,
                );
            const result = engine.apply(item, method, random);
            expect(result.item.catalyst).toEqual({ id: fertile.id, quality: 1 });
            expect(result.item).toEqual({ ...original, catalyst: { id: fertile.id, quality: 1 } });
            expect(result.cost).toEqual([{ id: recipe.id, name: "Tainted Catalyst", amount: 1 }]);
            expect(item).toEqual(original);
            expect(pick).toHaveBeenCalledTimes(1);
        }
    });

    it("enumerates typed and untyped quality conditions and scaled stat requirements exactly", () => {
        for (const [condition, probability] of [
            [{ min: 20, max: 20 }, 1 / 20],
            [{ id: fertile.id, min: 20, max: 20 }, 1 / 240],
            [{ min: 0, max: 0 }, 0],
            [{ min: 18, max: 20 }, 3 / 20],
        ] as const)
            expect(
                calculateExact(
                    engine,
                    corrupted,
                    method,
                    engine.validateTarget({ groups: [], catalyst: condition }),
                ).probability,
            ).toBeCloseTo(probability, 12);
        const item = engine.addStartingMod(normal, "IncreasedLife1", seededRandom(1));
        item.mods[0]!.values = [15];
        item.corrupted = true;
        const target = engine.validateTarget({
            groups: [],
            stats: [{ id: "base_maximum_life", scope: "explicit", min: 18 }],
        });
        expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(1 / 120, 12);
        const random = seededRandom(1);
        vi.spyOn(random, "pick").mockImplementation(
            (choices) =>
                choices.find(
                    (entry) =>
                        typeof entry.value === "object" &&
                        entry.value !== null &&
                        "id" in entry.value &&
                        entry.value.id === fertile.id &&
                        "quality" in entry.value &&
                        entry.value.quality === 20,
                )!.value,
        );
        const result = engine.apply(item, method, random).item;
        expect(rolledModText(catalog, result.mods[0]!, result)).toBe("+18 to maximum Life");
        expect(result.mods).toEqual(item.mods);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
        ).toEqual(result);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result)))).toEqual(result);
    });

    it("rejects unavailable games, classes and states before randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            normal,
            { ...corrupted, mirrored: true },
            { ...engine.createItem(baseId), corrupted: true },
        ])
            expect(() => engine.apply(item, method, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
        expect(() => engine.apply(corrupted, { kind: "currency", id: fertile.id }, random)).toThrow(
            "uncorrupted",
        );
        expect(taintedCatalystOutcomes(catalog, corrupted, "missing")).toEqual([]);
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(poe2.catalog.crafting.taintedCatalysts).toEqual([]);
        expect(poe2.currencySupported("add_random_jewellery_quality")).toBe(false);
        expect(taintedCatalystOutcomes(poe2.catalog, corrupted, recipe.id)).toEqual([]);
    });

    it("charges one catalyst per attempt in exact and repeated sampled processes", () => {
        const target = engine.validateTarget({ groups: [], catalyst: { min: 18, max: 20 } });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: corrupted,
            method,
            target,
            steps: [
                {
                    id: "tainted",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "tainted",
                },
            ],
            useProcess: true,
            prices: { [recipe.id]: 3 },
            seed: 42,
            iterations: 2000,
            maxActions: 1,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(0.15, 12);
        expect(exact.meanCost).toBeCloseTo(3, 12);
        const simulation = new CraftingSimulation(catalog, { ...project, maxActions: 3 });
        for (let trial = 0; trial < 2000; trial++) simulation.runTrial();
        const result = simulation.result();
        const expected = 1 - 0.85 ** 3;
        expect(result.interval[0]).toBeLessThan(expected);
        expect(result.interval[1]).toBeGreaterThan(expected);
        const expectedActions = 1 + 0.85 + 0.85 ** 2;
        const variance = 0.15 + 4 * 0.85 * 0.15 + 9 * 0.85 ** 2 - expectedActions ** 2;
        expect(Math.abs(result.meanCost! - 3 * expectedActions)).toBeLessThan(
            4 * 3 * Math.sqrt(variance / project.iterations),
        );
        expect(result.errors).toEqual({});
        expect(result.spending[recipe.id]).toBe(result.totalActions);
        expect(project.item.catalyst).toBeUndefined();
    });
});
