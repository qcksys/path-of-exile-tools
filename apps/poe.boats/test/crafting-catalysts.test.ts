import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { catalystLimit } from "../app/lib/crafting-quality";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { rolledModText } from "../app/lib/crafting-text";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

describe.each(["poe1", "poe2"] as const)("%s catalyst application", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const catalyst = catalog.crafting.catalysts.find((entry) =>
        entry.tags.includes(game === "poe1" ? "resource" : "life"),
    )!;
    const base = Object.entries(catalog.bases).find(
        ([, entry]) => entry.item_class === "Ring" && !entry.corrupted,
    )![0];
    const normal = engine.createItem(base);
    const method = { kind: "currency" as const, id: catalyst.id };
    const target = (min: number, max = 200, id: string | undefined = catalyst.id) =>
        engine.validateTarget({ groups: [], catalyst: { id, min, max } });

    it("applies every extracted catalyst only to its eligible classes and charges one use", () => {
        expect(catalog.crafting.catalysts).toHaveLength(game === "poe1" ? 12 : 26);
        for (const entry of catalog.crafting.catalysts) {
            for (const itemClass of entry.itemClasses) {
                const id = Object.entries(catalog.bases).find(
                    ([, base]) => base.item_class === itemClass && !base.corrupted,
                )![0];
                const input = { ...engine.createItem(id), level: 1 };
                const result = engine.apply(
                    input,
                    { kind: "currency", id: entry.id },
                    seededRandom(1),
                );
                expect(result.item.catalyst).toEqual({
                    id: entry.id,
                    quality: entry.maximumQuality,
                });
                expect(result.cost).toEqual([
                    { id: entry.id, name: engine.costName(entry.id), amount: 1 },
                ]);
                expect(result.item.rarity).toBe(input.rarity);
                expect(result.item.implicits).toEqual(input.implicits);
                expect(input.catalyst).toBeUndefined();
            }
        }
    });

    it("uses item-level increments independently of rarity and clamps the last use", () => {
        for (const rarity of ["normal", "magic", "rare"] as const) {
            for (const [level, amount] of [
                [1, 20],
                [12, 20],
                [13, 19],
                [20, 15],
                [30, 11],
                [50, 5],
                [70, 3],
                [84, 2],
            ]) {
                const item = { ...normal, level: level!, rarity };
                expect(engine.apply(item, method, seededRandom(1)).item.catalyst?.quality).toBe(
                    amount,
                );
            }
        }
        const partial = { ...normal, catalyst: { id: catalyst.id, quality: 19 } };
        expect(calculateExact(engine, partial, method, target(20, 20)).probability).toBe(1);
        const full = engine.apply(partial, method, seededRandom(1)).item;
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(full, method, random)).toThrow("maximum quality");
        expect(pick).not.toHaveBeenCalled();
    });

    it("replaces other quality types and preserves raw modifier values, fractures and item text", () => {
        let item = engine.addStartingMod(normal, "IncreasedLife1", seededRandom(1));
        item = { ...item, level: 5 };
        item.mods[0]!.fractured = true;
        item.mods[0]!.values = [15];
        const applied = engine.apply(item, method, seededRandom(1)).item;
        expect(applied.mods).toEqual(item.mods);
        expect(rolledModText(catalog, applied.mods[0]!, applied)).toBe("+18 to maximum Life");
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, applied))[0]!.item,
        ).toEqual(applied);
        const other = catalog.crafting.catalysts.find(
            (entry) => entry.id !== catalyst.id && entry.itemClasses.includes("Ring"),
        )!;
        const changed = engine.apply(
            { ...applied, level: 84 },
            { kind: "currency", id: other.id },
            seededRandom(1),
        ).item;
        expect(changed.catalyst).toEqual({ id: other.id, quality: 2 });
        expect(changed.mods).toEqual(applied.mods);
        expect(engine.matches(changed, target(0))).toBe(false);
        expect(
            engine.matches(
                changed,
                engine.validateTarget({ groups: [], catalyst: { min: 2, max: 2 } }),
            ),
        ).toBe(true);
    });

    it("validates catalyst targets and rejects ineligible currency use before randomness", () => {
        expect(
            engine.matches(
                normal,
                engine.validateTarget({ groups: [], catalyst: { min: 0, max: 0 } }),
            ),
        ).toBe(true);
        expect(engine.matches(normal, target(0))).toBe(false);
        for (const condition of [
            { min: 2, max: 1 },
            { min: -1, max: 20 },
            { min: 1.5, max: 20 },
            { min: 0, max: 201 },
            { id: "missing", min: 0, max: 20 },
        ])
            expect(() => engine.validateTarget({ groups: [], catalyst: condition })).toThrow();
        const armour = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Body Armour" && !base.corrupted,
        )![0];
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            engine.createItem(armour),
            { ...normal, corrupted: true },
            { ...normal, mirrored: true },
        ])
            expect(() => engine.apply(item, method, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
    });

    it("enumerates high-level quality branches and repeated process costs", () => {
        const item = { ...normal, level: 86, catalyst: { id: catalyst.id, quality: 18 } };
        const condition = target(20, 20);
        expect(calculateExact(engine, item, method, condition).probability).toBe(
            game === "poe1" ? 0 : 0.2,
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            method,
            target: condition,
            steps: [
                { id: "quality", method, condition, onSuccess: "success", onFailure: "quality" },
            ],
            useProcess: true,
            prices: { [catalyst.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(1);
        expect(exact.meanCost).toBeCloseTo(game === "poe1" ? 6 : 5.4);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.successes).toBe(1000);
        expect(result.meanCost).toBeCloseTo(exact.meanCost!, 1);
        expect(result.spending[catalyst.id]).toBe(result.totalActions);
        expect(result.samples.every((sample) => sample.item.catalyst?.quality === 20)).toBe(true);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("calculates numeric stat targets after quality scaling without rerolling the modifier", () => {
        const item = engine.addStartingMod(normal, "IncreasedLife1", seededRandom(1));
        item.mods[0]!.values = [15];
        item.catalyst = { id: catalyst.id, quality: 5 };
        const target = engine.validateTarget({
            groups: [],
            stats: [{ id: "base_maximum_life", scope: "explicit", min: 16 }],
        });
        expect(calculateExact(engine, item, method, target).probability).toBe(
            game === "poe1" ? 0 : 0.2,
        );
        expect(item.mods[0]!.values).toEqual([15]);
    });

    if (game === "poe2")
        it("honours Breach maximum-quality modifiers and retained quality when switching types", () => {
            let item: CraftingItem = {
                ...engine.createItem("Metadata/Items/Rings/FourRingBreach2"),
                rarity: "rare",
            };
            item = engine.addStartingMod(item, "EssenceBreach", seededRandom(1), "essence");
            expect(catalystLimit(catalog, item)).toBe(65);
            item.catalyst = { id: catalyst.id, quality: 64 };
            const changed = engine.apply(item, method, seededRandom(1)).item;
            expect(changed.catalyst?.quality).toBe(65);
            const retained = engine.validateItem({ ...changed, mods: [] });
            expect(catalystLimit(catalog, retained)).toBe(45);
            expect(() => engine.apply(retained, method, seededRandom(1))).toThrow(
                "maximum quality",
            );
            const other = catalog.crafting.catalysts.find(
                (entry) => entry.id !== catalyst.id && entry.itemClasses.includes("Ring"),
            )!;
            expect(
                engine.apply(
                    { ...retained, level: 84 },
                    { kind: "currency", id: other.id },
                    seededRandom(1),
                ).item.catalyst,
            ).toEqual({ id: other.id, quality: 2 });
        });
});
