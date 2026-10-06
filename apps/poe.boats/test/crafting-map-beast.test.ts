import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { rolledModText, scaledModValues } from "../app/lib/crafting-text";
import { craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const method = { kind: "beast" as const, id: "EinharMasterCraft28" };
const mapBase = "Metadata/Items/Maps/MapAtlasBeach";
const blank = () => engine.createItem(mapBase, 86);
function force(id: string) {
    const random = seededRandom(42);
    vi.spyOn(random, "pick").mockImplementationOnce(
        (choices) => choices.find((entry) => entry.value === id)!.value,
    );
    return random;
}

describe("PoE 1 map implicit beastcraft", () => {
    it("uses the extracted operation, including when the recipe ID changes, and rejects the historical quality recipe", () => {
        expect(engine.beastOperation(method.id)).toBe("map-implicit");
        expect(engine.beastRequiresLevel(method.id)).toBe(false);
        expect(engine.beastOperation("EinharMasterCraft48")).toBe("map-twice");
        const changed = structuredClone(catalog);
        const recipe = changed.crafting.beasts.find((entry) => entry.id === method.id)!;
        recipe.id = "ChangedRecipeId";
        expect(new CraftingEngine(changed).beastOperation(recipe.id)).toBe("map-implicit");
        recipe.mapCorruption = null;
        expect(new CraftingEngine(changed).beastOperation(recipe.id)).toBeUndefined();
        recipe.mapCorruption = "implicit";
        recipe.gameMode = 2;
        expect(new CraftingEngine(changed).beastOperation(recipe.id)).toBeUndefined();
        expect(() => engine.apply(engine.createItem(baseId), method, seededRandom(1))).toThrow(
            "requires a map",
        );
    });

    it.each([
        "normal",
        "magic",
        "rare",
    ] as const)("preserves %s map state and charges the whole recipe", (rarity) => {
        let item = { ...blank(), rarity, quality: 20 };
        if (rarity !== "normal") {
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        }
        const before = structuredClone(item);
        const result = engine.apply(item, method, seededRandom(42));
        expect(item).toEqual(before);
        expect(result.item).toEqual({ ...item, corrupted: true, implicits: expect.any(Array) });
        expect(result.item.implicits).toHaveLength(1);
        expect(engine.mod(result.item.implicits[0]!.id).generation_type).toBe("corrupted");
        expect(result.cost).toEqual([
            {
                id: method.id,
                name: "Beastcraft · Corrupt a Map: To have an Implicit Modifier",
                amount: 1,
            },
        ]);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
    });

    it("renders and imports every extracted map corruption outcome, including stats hidden in area descriptions", () => {
        const pool = engine.corruptedModifiers(blank());
        expect(pool).toHaveLength(11);
        for (const entry of pool) {
            const result = engine.apply(blank(), method, force(entry.id)).item;
            const implicit = result.implicits[0]!;
            expect(implicit.id).toBe(entry.id);
            expect(rolledModText(catalog, implicit, result), entry.id).toBeTruthy();
            const text = exportCraftingItemText(engine, result);
            const imported = importCraftingItemText(engine, text);
            expect(imported.length, entry.id).toBeGreaterThan(0);
            for (const candidate of imported) {
                expect(candidate.item.implicits, entry.id).toEqual(result.implicits);
                expect(candidate.item.corrupted).toBe(true);
            }
        }
    });

    it("applies the corrupted modifier-effect implicit to retained affix values", () => {
        const item = { ...blank(), rarity: "rare" as const };
        const entry = engine
            .pool(item)
            .find(({ mod }) =>
                mod.stats.some(
                    (stat) => catalog.crafting.scalableStats.includes(stat.id) && stat.max >= 10,
                ),
            )!;
        const starting = engine.addStartingMod(item, entry.id, seededRandom(5));
        const result = engine.apply(starting, method, force("MapCorruptionModEffect")).item;
        expect(result.mods).toEqual(starting.mods);
        const multiplier = (100 + result.implicits[0]!.values[0]!) / 100;
        expect(scaledModValues(catalog, result.mods[0]!, result)).toEqual(
            result.mods[0]!.values.map((value, index) =>
                catalog.crafting.scalableStats.includes(entry.mod.stats[index]!.id)
                    ? Math.trunc(value * multiplier)
                    : value,
            ),
        );
    });

    it("keeps level, class, mode and ordered tag restrictions for map implicits", () => {
        const changed = structuredClone(catalog);
        changed.bases[mapBase]!.tags.unshift("infected_map");
        const quantity = changed.crafting.modRules.MapCorruptionItemQuantity!;
        quantity.spawnLevel = 87;
        changed.crafting.modRules.MapCorruptionItemRarity!.itemClasses = ["Ring"];
        changed.crafting.modRules.MapCorruptionPackSize!.gameMode = 2;
        const model = new CraftingEngine(changed);
        const pool = model.corruptedModifiers(blank());
        expect(pool.map((entry) => entry.id)).toEqual([
            "MapCorruptionModEffect",
            "MapCorruptionSoulGainPrevention",
        ]);
        expect(
            model.corruptedModifiers({ ...blank(), level: 87 }).map((entry) => entry.id),
        ).toContain("MapCorruptionItemQuantity");
    });

    it("calculates weighted and numeric targets with matching simulation and conditional process costs", () => {
        const item = blank();
        const pool = engine.corruptedModifiers(item);
        const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
        const entry = pool.find((entry) => entry.id === "MapCorruptionItemQuantity")!;
        const target = engine.validateTarget({ groups: [{ mods: [entry.id] }], corrupted: true });
        const probability = entry.weight / total;
        expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(probability);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [{ id: "corrupt-map", method, condition: target }],
            prices: { [method.id]: 7 },
            seed: 42,
            iterations: 2000,
            maxActions: 1,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: expect.closeTo(probability),
            meanCost: expect.closeTo(7),
            errors: {},
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            meanCost: 7,
            spending: { [method.id]: 2000 },
            errors: {},
            timeouts: 0,
        });
        expect(simulation.result().probability).toBeCloseTo(probability, 1);
        const maximum = engine.validateTarget({
            groups: [],
            stats: [{ id: entry.mod.stats[0]!.id, min: 20 }],
        });
        expect(calculateExact(engine, item, method, maximum).probability).toBeCloseTo(
            probability / 11,
        );
    });

    it("rejects invalid states and empty pools before randomness, while keeping map-only restrictions", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            { ...blank(), corrupted: true },
            { ...blank(), mirrored: true },
            engine.createItem(baseId),
        ])
            expect(() => engine.apply(item, method, random)).toThrow();
        const changed = structuredClone(catalog);
        for (const [id, mod] of Object.entries(changed.mods)) {
            if (mod.domain === "area" && mod.generation_type === "corrupted")
                changed.crafting.modRules[id]!.gameMode = 2;
        }
        expect(() => new CraftingEngine(changed).apply(blank(), method, random)).toThrow(
            "No eligible corrupted implicit",
        );
        expect(pick).not.toHaveBeenCalled();
        expect(
            engine.apply(blank(), currency("corrupt_item"), seededRandom(42)).item.corrupted,
        ).toBe(true);
    });
});
