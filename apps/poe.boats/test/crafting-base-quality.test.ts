import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableBaseQuality } from "../app/lib/crafting-quality";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

describe.each(["poe1", "poe2"] as const)("%s base quality currency", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = (itemClass: string) =>
        Object.entries(catalog.bases).find(
            ([, entry]) => entry.item_class === itemClass && !entry.corrupted,
        )![0];
    const item = engine.createItem(base("Body Armour"));
    const scrap = catalog.crafting.baseQuality.find(
        (entry) => !entry.corrupted && entry.itemClasses.includes("Body Armour"),
    )!;
    const method = { kind: "currency" as const, id: scrap.id };
    const target = (min: number, max = 30) =>
        engine.validateTarget({ groups: [], quality: { min, max } });

    it("applies every ordinary quality currency to all available extracted classes and charges one use", () => {
        const recipes = catalog.crafting.baseQuality.filter((entry) => !entry.corrupted);
        expect(recipes).toHaveLength(game === "poe1" ? 3 : 4);
        let checked = 0;
        for (const recipe of recipes) {
            for (const itemClass of recipe.itemClasses) {
                const candidate = Object.entries(catalog.bases).find(
                    ([, entry]) => entry.item_class === itemClass && !entry.corrupted,
                );
                if (!candidate) continue;
                const input = { ...engine.createItem(candidate[0]), level: 1 };
                const result = engine.apply(
                    input,
                    { kind: "currency", id: recipe.id },
                    seededRandom(42),
                );
                expect(result.item).toEqual({ ...input, quality: recipe.maximumQuality });
                expect(result.cost).toEqual([
                    { id: recipe.id, name: engine.costName(recipe.id), amount: 1 },
                ]);
                expect(input.quality).toBe(0);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(20);
    });

    it("uses the item-level model for every rarity and preserves over-cap quality on other crafts", () => {
        for (const rarity of ["normal", "magic", "rare"] as const)
            for (const [level, expected] of [
                [1, 20],
                [13, 19],
                [30, 11],
                [50, 5],
                [70, 3],
                [84, 2],
            ])
                expect(
                    engine.apply({ ...item, level: level!, rarity }, method, seededRandom(42)).item
                        .quality,
                ).toBe(expected);
        const full = { ...item, quality: 19 };
        expect(calculateExact(engine, full, method, target(20, 20)).probability).toBe(1);
        const transmute = catalog.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_magic",
        )!;
        const high = engine.apply(
            { ...item, quality: 30 },
            { kind: "currency", id: transmute.id },
            seededRandom(42),
        );
        expect(high.item.quality).toBe(30);
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        for (const quality of [20, 30])
            expect(() => engine.apply({ ...item, quality }, method, random)).toThrow(
                "maximum quality",
            );
        expect(pick).not.toHaveBeenCalled();
    });

    it("rejects wrong classes, mirroring and corruption before randomness", () => {
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        for (const invalid of [
            engine.createItem(base("Ring")),
            engine.createItem(base("Wand")),
            { ...item, corrupted: true },
            { ...item, mirrored: true },
        ])
            expect(() => engine.apply(invalid, method, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
        const wand = engine.createItem(base("Wand"));
        const wandMethods = availableBaseQuality(catalog, wand).filter((entry) => !entry.corrupted);
        expect(wandMethods).toHaveLength(1);
        expect(
            catalog.crafting.currencies.find((entry) => entry.id === wandMethods[0]!.id)?.action,
        ).toBe(game === "poe1" ? "add_weapon_quality" : "add_magic_item_quality");
        const weapon = catalog.crafting.currencies.find(
            (entry) => entry.action === "add_weapon_quality",
        )!;
        if (game === "poe2")
            expect(() => engine.apply(wand, { kind: "currency", id: weapon.id }, random)).toThrow(
                "item base",
            );
    });

    it("enumerates quality-only targets and repeat-until-quality process costs", () => {
        const start = { ...item, level: 86, quality: 18 };
        const condition = target(20, 20);
        expect(calculateExact(engine, start, method, condition).probability).toBe(
            game === "poe1" ? 0 : 0.2,
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item: start,
            method,
            target: condition,
            steps: [
                { id: "quality", method, condition, onSuccess: "success", onFailure: "quality" },
            ],
            useProcess: true,
            prices: { [method.id]: 3 },
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
        expect(result.spending[method.id]).toBe(result.totalActions);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("preserves modifiers, fractures, strands and item-text round trips", () => {
        const mod = engine
            .pool({ ...item, rarity: "rare" })
            .find((entry) => entry.mod.stats.length)!;
        const input = engine.addStartingMod(item, mod.id, seededRandom(42));
        input.mods[0]!.fractured = true;
        if (game === "poe1") input.memoryStrands = 82;
        const result = engine.apply(input, method, seededRandom(42)).item;
        expect(result).toEqual({ ...input, quality: result.quality });
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
        ).toEqual(result);
        for (const quality of [
            { min: -1, max: 20 },
            { min: 1.5, max: 20 },
            { min: 20, max: 19 },
            { min: 0, max: game === "poe1" ? 41 : 201 },
        ])
            expect(() => engine.validateTarget({ groups: [], quality })).toThrow();
        expect(engine.matches(result, target(result.quality))).toBe(true);
        expect(engine.matches(result, target(result.quality + 1))).toBe(false);
    });

    if (game === "poe1")
        it("rerolls tainted quality including zero without altering affixes or corruption", () => {
            for (const recipe of catalog.crafting.baseQuality.filter((entry) => entry.corrupted)) {
                const input = {
                    ...engine.createItem(base(recipe.itemClasses[0]!)),
                    corrupted: true,
                    quality: 30,
                };
                const tainted = { kind: "currency" as const, id: recipe.id };
                expect(
                    calculateExact(engine, input, tainted, target(20, 20)).probability,
                ).toBeCloseTo(1 / 21);
                expect(
                    calculateExact(engine, input, tainted, target(0, 0)).probability,
                ).toBeCloseTo(1 / 21);
                const random = seededRandom(42);
                const pick = vi
                    .spyOn(random, "pick")
                    .mockImplementation((choices) => choices[0]!.value);
                expect(engine.apply(input, tainted, random)).toEqual({
                    item: { ...input, quality: 0 },
                    cost: [{ id: recipe.id, name: engine.costName(recipe.id), amount: 1 }],
                });
                pick.mockClear();
                expect(() => engine.apply({ ...input, corrupted: false }, tainted, random)).toThrow(
                    "corrupted",
                );
                expect(() => engine.apply({ ...input, mirrored: true }, tainted, random)).toThrow(
                    "unmirrored",
                );
                expect(pick).not.toHaveBeenCalled();
            }
        });
    else
        it("keeps legacy tainted currency unavailable in PoE 2", () => {
            for (const recipe of catalog.crafting.baseQuality.filter((entry) => entry.corrupted))
                expect(() =>
                    engine.apply(
                        { ...item, corrupted: true },
                        { kind: "currency", id: recipe.id },
                        seededRandom(42),
                    ),
                ).toThrow("not supported");
        });
});
