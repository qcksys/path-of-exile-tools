import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const recipes = catalog.crafting.beasts.filter((entry) => entry.augmentation);
const influenced = recipes.filter(
    (entry) => entry.augmentation && "influence" in entry.augmentation,
);
const mapMethod = { kind: "beast" as const, id: "EinharMasterCraft49" };
const mapBase = "Metadata/Items/Maps/MapAtlasBeach";
const rare = (base = baseId, level = 86): CraftingItem => ({
    ...engine.createItem(base, level),
    rarity: "rare",
});

describe("PoE 1 beast augmentation", () => {
    it("uses the normalized build operation independently of recipe identity", () => {
        expect(recipes).toHaveLength(7);
        for (const recipe of recipes) {
            expect(engine.beastOperation(recipe.id)).toBe("augment");
            expect(engine.beastRequiresLevel(recipe.id)).toBe(false);
            expect(engine.validateMethod({ kind: "beast", id: recipe.id })).toEqual({
                kind: "beast",
                id: recipe.id,
            });
        }
        const changed = structuredClone(catalog);
        const recipe = changed.crafting.beasts.find((entry) => entry.id === mapMethod.id)!;
        recipe.id = "UpdatedRecipeId";
        expect(new CraftingEngine(changed).beastOperation(recipe.id)).toBe("augment");
        recipe.gameMode = 2;
        expect(new CraftingEngine(changed).beastOperation(recipe.id)).toBeUndefined();
        changed.game = "poe2";
        expect(new CraftingEngine(changed).beastOperation("EinharMasterCraft42")).toBeUndefined();
    });

    it.each(influenced)("adds an ordinary or influenced modifier using $description", (recipe) => {
        const rule = recipe.augmentation!;
        if (!("influence" in rule)) throw new Error("Expected influence recipe");
        const item = { ...rare(), influences: [rule.influence], memoryStrands: 82 };
        const method = { kind: "beast" as const, id: recipe.id };
        const pool = engine.pool(item);
        for (const influenceMod of [false, true]) {
            const selected = pool.find((entry) =>
                influenceMod
                    ? catalog.crafting.modRules[entry.id]?.influence === rule.influence
                    : catalog.crafting.modRules[entry.id]?.influence == null,
            )!;
            expect(selected).toBeDefined();
            const random = seededRandom(42);
            const pick = vi.spyOn(random, "pick").mockImplementationOnce((choices) => {
                expect(choices).toEqual(
                    pool.map((entry) => ({ value: entry.id, weight: entry.weight })),
                );
                return choices.find((entry) => entry.value === selected.id)!.value;
            });
            const before = structuredClone(item);
            const result = engine.apply(item, method, random);
            expect(pick).toHaveBeenCalledTimes(1);
            expect(item).toEqual(before);
            expect(result.item).toEqual({
                ...item,
                mods: [expect.objectContaining({ id: selected.id, crafted: false })],
            });
            expect(result.item.mods[0]!.origin).toBeUndefined();
            expect(result.cost).toEqual([
                {
                    id: recipe.id,
                    name: `Beastcraft · ${recipe.category}: ${recipe.description}`,
                    amount: 1,
                },
            ]);
            expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(
                result.item,
            );
        }
    });

    it("uses item level, including low-level items, without a beast-level override", () => {
        const method = { kind: "beast" as const, id: "EinharMasterCraft42", level: 100 };
        const item = { ...rare(baseId, 5), influences: [0] };
        for (let seed = 0; seed < 20; seed++) {
            const result = engine.apply(item, method, seededRandom(seed)).item;
            expect(engine.mod(result.mods[0]!.id).required_level).toBeLessThanOrEqual(5);
            expect(result.level).toBe(5);
        }
    });

    it("accepts either influence on a dual-influence item and all innate Astrolabe influences", () => {
        const dual = { ...rare(), influences: [0, 1] };
        for (const id of ["EinharMasterCraft42", "EinharMasterCraft43"])
            expect(
                engine.apply(dual, { kind: "beast", id }, seededRandom(42)).item.mods,
            ).toHaveLength(1);
        const base = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Astrolabe Amulet",
        )![0];
        const innate = rare(base);
        expect(innate.influences).toEqual([]);
        for (const recipe of influenced) {
            expect(engine.beastAugmentationEligible(innate, recipe.id)).toBe(true);
            expect(
                engine.apply(innate, { kind: "beast", id: recipe.id }, seededRandom(42)).item.mods,
            ).toHaveLength(1);
        }
    });

    it("preserves existing modifiers and respects blocked types and occupied sides", () => {
        const bow = Object.entries(catalog.bases).find(
            ([, entry]) => entry.item_class === "Bow",
        )![0];
        let item = { ...rare(bow), influences: [0] };
        const block = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_roll_attack_affixes"),
        )!;
        item = engine.apply(item, { kind: "bench", id: block.id }, seededRandom(1)).item;
        while (engine.counts(item).suffixes < 3)
            item = engine.addStartingMod(
                item,
                engine.pool(item, { side: "suffix" })[0]!.id,
                seededRandom(1),
            );
        const random = seededRandom(42);
        vi.spyOn(random, "pick").mockImplementationOnce((choices) => {
            for (const choice of choices) {
                const mod = engine.mod(String(choice.value));
                expect(mod.generation_type).toBe("prefix");
                expect(mod.implicit_tags).not.toContain("attack");
            }
            return choices[0]!.value;
        });
        const result = engine.apply(
            item,
            { kind: "beast", id: "EinharMasterCraft42" },
            random,
        ).item;
        expect(result.mods.slice(0, -1)).toEqual(item.mods);
        expect(engine.counts(result)).toEqual({ prefixes: 1, suffixes: 3 });
    });

    it("adds a sixth map modifier, preserves map properties and rejects a full map before randomness", () => {
        let item = { ...rare(mapBase), quality: 20 };
        while (item.mods.length < 5)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        const result = engine.apply(item, mapMethod, seededRandom(42)).item;
        expect(result.mods).toHaveLength(6);
        expect(result.mods.slice(0, 5)).toEqual(item.mods);
        expect(result.quality).toBe(20);
        expect(result.baseId).toBe(mapBase);
        expect(engine.counts(result)).toEqual({ prefixes: 3, suffixes: 3 });
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
        ).toEqual(result);
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(result, mapMethod, random)).toThrow("No eligible modifiers");
        expect(pick).not.toHaveBeenCalled();
    });

    it("rejects wrong influences, classes, rarities and protected items without changes or randomness", () => {
        const method = { kind: "beast" as const, id: "EinharMasterCraft42" };
        for (const [item, craft] of [
            [rare(), method],
            [{ ...rare(), influences: [1] }, method],
            [rare(mapBase), method],
            [{ ...rare(), influences: [0] }, mapMethod],
            [{ ...rare(), influences: [0], rarity: "magic" }, method],
            [{ ...rare(), influences: [0], corrupted: true }, method],
            [{ ...rare(), influences: [0], mirrored: true }, method],
            [{ ...rare(mapBase), rarity: "normal" }, mapMethod],
        ] satisfies [CraftingItem, CraftingMethod][]) {
            const before = structuredClone(item);
            const random = seededRandom(42);
            const pick = vi.spyOn(random, "pick");
            expect(() => engine.apply(item, craft, random)).toThrow();
            expect(pick).not.toHaveBeenCalled();
            expect(item).toEqual(before);
        }
    });

    it("uses the same weighted outcomes and recipe prices in exact calculations, processes and simulations", () => {
        const item = rare(mapBase);
        const pool = engine.pool(item);
        const selected = pool[0]!;
        const target = engine.validateTarget({ groups: [{ mods: [selected.id] }] });
        const chance = selected.weight / pool.reduce((sum, entry) => sum + entry.weight, 0);
        expect(calculateExact(engine, item, mapMethod, target).probability).toBeCloseTo(chance, 12);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            method: mapMethod,
            target: { groups: [], affixCount: { min: 1, max: 1 } },
            steps: [
                {
                    id: "add",
                    method: mapMethod,
                    condition: { groups: [] },
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [mapMethod.id]: 7 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const saved = validateProject(catalog, JSON.parse(JSON.stringify(project)));
        const exact = calculateProcessExact(engine, saved);
        expect(exact.probability).toBeCloseTo(1, 12);
        expect(exact.meanCost).toBeCloseTo(7, 12);
        const simulation = new CraftingSimulation(catalog, saved, true);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 100,
            meanCost: 7,
            spending: { [mapMethod.id]: 100 },
            errors: {},
            timeouts: 0,
        });
        expect(simulation.result().samples.every((sample) => sample.item.mods.length === 1)).toBe(
            true,
        );
    });
});
