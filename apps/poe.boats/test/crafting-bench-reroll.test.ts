import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { type CraftingItem, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const first: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };
const recipe = (action: number) => catalog.crafting.bench.find((entry) => entry.action === action)!;
const method = (action: number) => ({ kind: "bench" as const, id: recipe(action).id });
function filled() {
    let item: CraftingItem = { ...engine.createItem(baseId), rarity: "rare" };
    while (item.mods.length < 6)
        item = engine.addStartingMod(item, engine.pool(item)[0]!.id, first);
    return item;
}

describe("PoE 1 extracted bench modifier rerolls", () => {
    it.each([
        8, 9,
    ])("applies action %i with its extracted cost and retains item state", (action) => {
        const item = { ...filled(), quality: 20, memoryStrands: 100 };
        const before = structuredClone(item);
        const random = { ...first };
        const pick = vi.spyOn(random, "pick");
        const result = engine.apply(item, method(action), random);
        const count = action === 8 ? 3 : 1;
        expect(pick).toHaveBeenCalledTimes(count * 2);
        for (let index = 0; index < count; index++)
            expect(pick.mock.calls[index]![0]).toHaveLength(6 - index);
        expect(result.item.mods).toHaveLength(6);
        expect(result.item.mods.slice(0, 6 - count)).toEqual(item.mods.slice(count));
        expect(result.item).toMatchObject({ rarity: "rare", quality: 20, memoryStrands: 100 });
        expect(result.cost).toEqual(recipe(action).cost);
        expect(result.cost).toMatchObject([{ name: "Chaos Orb", amount: action === 8 ? 3 : 8 }]);
        expect(item).toEqual(before);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result.item))[0]!.item,
        ).toEqual(result.item);
    });

    it("recalculates prefix protection between removals before adding replacements", () => {
        let item: CraftingItem = { ...engine.createItem(baseId), rarity: "rare" };
        for (let index = 0; index < 2; index++)
            item = engine.addStartingMod(item, engine.pool(item, { side: "prefix" })[0]!.id, first);
        const lock = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                entry.itemClasses.includes(engine.base(item).item_class) &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_change_prefixes"),
        )!;
        item = engine.apply(item, { kind: "bench", id: lock.id }, first).item;
        const random = { ...first };
        const pick = vi.spyOn(random, "pick");
        const result = engine.apply(item, method(8), random);
        expect(pick.mock.calls[0]![0]).toMatchObject([{ value: { id: lock.mod } }]);
        expect(pick.mock.calls[1]![0]).toMatchObject(
            item.mods.slice(0, 2).map((value) => ({ value })),
        );
        expect(pick.mock.calls[2]![0]).toMatchObject([{ value: item.mods[1] }]);
        expect(pick).toHaveBeenCalledTimes(6);
        expect(result.item.mods).toHaveLength(3);
        expect(result.item.mods.every((entry) => !entry.crafted)).toBe(true);
    });

    it.each([
        8, 9,
    ])("removes only eligible modifiers and pays for protected no-ops with action %i", (action) => {
        const item = filled();
        for (const entry of item.mods) entry.fractured = true;
        const random = { ...first };
        const pick = vi.spyOn(random, "pick");
        const unchanged = engine.apply(item, method(action), random);
        expect(unchanged.item).toEqual(item);
        expect(unchanged.cost).toEqual(recipe(action).cost);
        expect(pick).not.toHaveBeenCalled();
        item.mods.at(-1)!.fractured = false;
        const result = engine.apply(item, method(action), random);
        expect(pick).toHaveBeenCalledTimes(2);
        expect(result.item.mods.slice(0, 5)).toEqual(item.mods.slice(0, 5));
        expect(result.item.mods).toHaveLength(6);
    });

    it("retains paid removal outcomes when no replacement can roll", () => {
        const blank: CraftingItem = { ...engine.createItem(baseId), rarity: "rare" };
        const mod = engine.recipePool(blank, "bench")[0]!.id;
        const craft = catalog.crafting.bench.find((entry) => entry.mod === mod)!;
        const item = engine.apply(blank, { kind: "bench", id: craft.id }, first).item;
        const changed = structuredClone(catalog);
        for (const mod of Object.values(changed.mods)) mod.spawn_weights = [];
        const current = new CraftingEngine(changed);
        const result = current.apply(item, method(8), first);
        expect(result.item.mods).toEqual([]);
        expect(result.item.rarity).toBe("rare");
        expect(result.cost).toEqual(recipe(8).cost);
    });

    it.each([
        "attack",
        "caster",
    ])("honors a surviving %s blocker for removal and replacement", (tag) => {
        const base = Object.entries(catalog.bases).find(
            ([, entry]) => entry.item_class === "Wand",
        )![0];
        let item: CraftingItem = { ...engine.createItem(base), rarity: "rare" };
        const protectedMod = engine
            .pool(item)
            .find((entry) => entry.mod.implicit_tags.includes(tag))!.id;
        item = engine.addStartingMod(item, protectedMod, first);
        const blocker = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                entry.itemClasses.includes("Wand") &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === `item_generation_cannot_roll_${tag}_affixes`),
        )!;
        item = engine.apply(item, { kind: "bench", id: blocker.id }, first).item;
        item.mods.at(-1)!.fractured = true;
        item = engine.addStartingMod(item, engine.pool(item)[0]!.id, first);
        const random = { ...first };
        const pick = vi.spyOn(random, "pick");
        const result = engine.apply(item, method(8), random);
        expect(pick.mock.calls[0]![0]).toMatchObject([{ value: item.mods.at(-1) }]);
        expect(pick).toHaveBeenCalledTimes(2);
        expect(result.item.mods.slice(0, 2)).toEqual(item.mods.slice(0, 2));
        expect(engine.mod(result.item.mods.at(-1)!.id).implicit_tags).not.toContain(tag);
    });

    it.each([8, 9])("calculates action %i replacement odds, retries and spending", (action) => {
        const item = filled();
        for (const entry of item.mods.slice(0, 5)) entry.fractured = true;
        const pool = engine.pool({ ...item, mods: item.mods.slice(0, 5) });
        const chosen = pool.reduce((best, entry) => (entry.weight > best.weight ? entry : best));
        const probability = chosen.weight / pool.reduce((sum, entry) => sum + entry.weight, 0);
        const target = engine.validateTarget({ groups: [{ mods: [chosen.id], minimum: 1 }] });
        expect(calculateExact(engine, item, method(action), target).probability).toBeCloseTo(
            probability,
            12,
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: method(action),
            target,
            steps: [
                {
                    id: "roll",
                    method: method(action),
                    condition: target,
                    onSuccess: "success",
                    onFailure: "roll",
                },
            ],
            prices: { [recipe(action).cost[0]!.id]: 2 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        const price = recipe(action).cost[0]!.amount * 2;
        expect(exact.probability).toBeCloseTo(1 - (1 - probability) ** 2, 12);
        expect(exact.meanCost).toBeCloseTo(price * (2 - probability), 12);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().probability).toBeCloseTo(exact.probability, 1);
        expect(simulation.result().meanCost).toBeCloseTo(exact.meanCost!, 0);
        expect(simulation.result().spending[recipe(action).cost[0]!.id]).toBe(
            simulation.result().totalActions * recipe(action).cost[0]!.amount,
        );
    });

    it("requires rare, uncorrupted, unmirrored items of an extracted recipe class", () => {
        for (const item of [
            engine.createItem(baseId),
            { ...engine.createItem(baseId), rarity: "magic" as const },
            { ...filled(), corrupted: true },
            { ...filled(), mirrored: true },
        ]) {
            const random = seededRandom(1);
            const pick = vi.spyOn(random, "pick");
            expect(() => engine.apply(item, method(8), random)).toThrow();
            expect(pick).not.toHaveBeenCalled();
        }
        const changed = structuredClone(catalog);
        changed.crafting.bench.find((entry) => entry.id === recipe(8).id)!.itemClasses = [];
        expect(() => new CraftingEngine(changed).apply(filled(), method(8), first)).toThrow(
            "item class",
        );
    });
});
