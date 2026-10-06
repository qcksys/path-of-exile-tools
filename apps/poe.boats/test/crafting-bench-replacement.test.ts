import { describe, expect, it, vi } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import { type CraftingItem, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const blank = (): CraftingItem => ({ ...engine.createItem(baseId), rarity: "rare" });
const recipes = catalog.crafting.bench.filter(
    (entry) => entry.mod && entry.itemClasses.includes(engine.base(blank()).item_class),
);
const prefix = recipes.find((entry) => engine.mod(entry.mod!).generation_type === "prefix")!;
const suffix = recipes.find(
    (entry) =>
        engine.mod(entry.mod!).generation_type === "suffix" &&
        !engine
            .mod(entry.mod!)
            .groups.some((group) => engine.mod(prefix.mod!).groups.includes(group)),
)!;
const remove = catalog.crafting.bench.find(
    (entry) =>
        entry.action === 0 &&
        !entry.mod &&
        !entry.enchantment &&
        entry.itemClasses.includes(engine.base(blank()).item_class),
)!;
const method = (id: string, skipOnConflict?: boolean) => ({
    kind: "bench" as const,
    id,
    ...(skipOnConflict === undefined ? {} : { skipOnConflict }),
});
const craft = (item: CraftingItem, id: string) =>
    engine.apply(item, method(id), seededRandom(1)).item;

function blocked() {
    let item = blank();
    while (engine.counts(item).prefixes < 3)
        item = engine.addStartingMod(
            item,
            engine.pool(item, { side: "prefix" })[0]!.id,
            seededRandom(1),
        );
    return craft(item, suffix.id);
}

function project(item: CraftingItem, skipOnConflict = true) {
    return craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item,
        method: method(prefix.id, skipOnConflict),
        target: { groups: [], affixCount: { min: 3, max: 3 } },
        steps: [
            {
                id: "bench",
                method: method(prefix.id, skipOnConflict),
                condition: { groups: [], affixCount: { min: 3, max: 3 } },
                onSuccess: "success",
            },
        ],
        prices: Object.fromEntries(remove.cost.map((entry) => [entry.id, 2])),
        seed: 5,
        iterations: 10,
        maxActions: 2,
    });
}

describe("PoE 1 bench replacement and conflicts", () => {
    it("crafts a normal base to magic and preserves known properties", () => {
        const item = { ...engine.createItem(baseId), quality: 20, memoryStrands: 82 };
        const result = engine.apply(item, method(prefix.id), seededRandom(1));
        expect(result.item).toMatchObject({
            rarity: "magic",
            quality: 20,
            memoryStrands: 82,
            mods: [{ id: prefix.mod, crafted: true }],
        });
        expect(result.cost).toEqual(prefix.cost);
        expect(item.mods).toEqual([]);
        expect(item.rarity).toBe("normal");
    });

    it("replaces the single existing craft and charges the extracted removal recipe", () => {
        const item = craft(blank(), prefix.id);
        const before = structuredClone(item);
        const result = engine.apply(item, method(suffix.id), seededRandom(1));
        expect(result.item.mods.map((entry) => entry.id)).toEqual([suffix.mod]);
        expect(result.cost).toEqual([...remove.cost, ...suffix.cost]);
        expect(engine.costs(method(suffix.id), item)).toEqual(result.cost);
        expect(item).toEqual(before);
        const repeated = engine.apply(result.item, method(suffix.id), seededRandom(2));
        expect(repeated.item.mods).toHaveLength(1);
        expect(repeated.cost).toEqual(result.cost);
    });

    it("retains paid removal when a replacement is skipped for a full affix side", () => {
        const item = blocked();
        const before = structuredClone(item);
        const random = { pick: vi.fn(), integer: vi.fn() };
        const result = engine.apply(item, method(prefix.id, true), random);
        expect(result.item.mods).toEqual(item.mods.filter((entry) => !entry.crafted));
        expect(result.cost).toEqual(remove.cost);
        expect(engine.costs(method(prefix.id, true), item)).toEqual(remove.cost);
        expect(random.pick).not.toHaveBeenCalled();
        expect(random.integer).not.toHaveBeenCalled();
        expect(item).toEqual(before);
        expect(engine.apply(result.item, method(prefix.id, true), random)).toEqual({
            item: result.item,
            cost: [],
        });
        expect(() => engine.apply(item, method(prefix.id), random)).toThrow("open prefix");
    });

    it("skips existing modifier groups and protects a fractured craft", () => {
        const compatible = recipes.find((recipe) =>
            engine
                .pool(blank())
                .some(({ mod }) =>
                    mod.groups.some((group) => engine.mod(recipe.mod!).groups.includes(group)),
                ),
        )!;
        const natural = engine
            .pool(blank())
            .find(({ mod }) =>
                mod.groups.some((group) => engine.mod(compatible.mod!).groups.includes(group)),
            )!;
        const item = engine.addStartingMod(blank(), natural.id, seededRandom(1));
        const random = { pick: vi.fn(), integer: vi.fn() };
        expect(engine.apply(item, method(compatible.id, true), random)).toEqual({ item, cost: [] });
        expect(() => engine.apply(item, method(compatible.id), random)).toThrow("conflicts");
        const fractured = craft(blank(), prefix.id);
        fractured.mods[0]!.fractured = true;
        expect(engine.apply(fractured, method(suffix.id, true), random)).toEqual({
            item: fractured,
            cost: [],
        });
        expect(random.integer).not.toHaveBeenCalled();
    });

    it("retains multimod crafts when its capacity is full", () => {
        const multimod = recipes.find((entry) =>
            engine
                .mod(entry.mod!)
                .stats.some((stat) => stat.id === "item_generation_can_have_multiple_crafted_mods"),
        )!;
        expect(multimod).toBeDefined();
        let item = craft(blank(), multimod.id);
        const candidates = recipes.filter(
            (recipe) =>
                recipe.id !== multimod.id &&
                !engine
                    .mod(recipe.mod!)
                    .groups.some((group) => engine.mod(multimod.mod!).groups.includes(group)),
        );
        for (const recipe of candidates) {
            try {
                item = craft(item, recipe.id);
            } catch {
                continue;
            }
            if (item.mods.length === 3) break;
        }
        expect(item.mods).toHaveLength(3);
        expect(engine.apply(item, method(prefix.id, true), seededRandom(1))).toEqual({
            item,
            cost: [],
        });
    });

    it("does not skip invalid recipes, wrong item classes or forbidden item states", () => {
        const other = catalog.crafting.bench.find(
            (entry) => entry.mod && !entry.itemClasses.includes(engine.base(blank()).item_class),
        )!;
        const random = { pick: vi.fn(), integer: vi.fn() };
        expect(() => engine.apply(blank(), method("missing", true), random)).toThrow(
            "Unknown bench",
        );
        expect(() => engine.apply(blank(), method(other.id, true), random)).toThrow("item class");
        expect(() => engine.apply(blank(), method(remove.id, true), random)).toThrow(
            "only for bench modifier additions",
        );
        for (const flag of ["corrupted", "mirrored"] as const)
            expect(() =>
                engine.apply({ ...blank(), [flag]: true }, method(prefix.id, true), random),
            ).toThrow();
        expect(random.integer).not.toHaveBeenCalled();
    });

    it("uses the retained item and removal spending in exact, sampled and process results", () => {
        const input = project(blocked());
        expect(validateProject(catalog, JSON.parse(JSON.stringify(input))).method).toEqual(
            input.method,
        );
        expect(calculateExact(engine, input.item, input.method, input.target).probability).toBe(1);
        const simulation = new CraftingSimulation(catalog, input);
        simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            probability: 1,
            errors: {},
            spending: Object.fromEntries(remove.cost.map((entry) => [entry.id, entry.amount])),
        });
        const exact = calculateProcessExact(engine, input);
        expect(exact).toMatchObject({ probability: 1, errors: {}, meanCost: 2, totalActions: 1 });
        const process = new CraftingProcess(engine, input, seededRandom(1));
        process.advance();
        expect(process.result()).toMatchObject({
            success: true,
            actions: 1,
            item: { mods: input.item.mods.filter((entry) => !entry.crafted) },
        });
    });

    it("retains removal spending and item state when a process stops on the conflict", () => {
        const input = project(blocked(), false);
        const process = new CraftingProcess(engine, input, seededRandom(1));
        process.advance();
        expect(process.result()).toMatchObject({
            success: false,
            actions: 1,
            spending: Object.fromEntries(remove.cost.map((entry) => [entry.id, entry.amount])),
            item: { mods: input.item.mods.filter((entry) => !entry.crafted) },
        });
        expect(process.result().error).toContain("open prefix");
        expect(calculateProcessExact(engine, input)).toMatchObject({
            probability: 0,
            meanCost: 2,
            totalActions: 1,
        });
        const simulation = new CraftingSimulation(catalog, input);
        simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            probability: 0,
            meanCost: 2,
            totalActions: 1,
            errors: { [process.result().error!]: 1 },
        });
        expect(simulation.result().samples[0]!.item).toEqual(process.result().item);
        expect(simulation.result().samples[0]!.cost).toMatchObject({
            spending: process.result().spending,
            total: 2,
        });
        expect(simulation.result().successCosts).toEqual({
            cheapest: null,
            costliest: null,
            unpriced: 0,
        });
    });

    it("quotes actual replacement and skipped-addition costs through the calculator worker", async () => {
        vi.resetModules();
        const scope = {
            onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
            postMessage: vi.fn(),
        };
        vi.stubGlobal("self", scope);
        try {
            await import("../app/lib/crafting.worker");
            for (const item of [blocked(), craft(blank(), suffix.id)]) {
                const input = project(item);
                input.target = engine.validateTarget({ groups: [], rarity: "rare" });
                const costs = engine.apply(item, input.method, seededRandom(1)).cost;
                const spending: Record<string, number> = {};
                for (const cost of costs)
                    spending[cost.id] = (spending[cost.id] ?? 0) + cost.amount;
                input.prices = Object.fromEntries(costs.map((entry) => [entry.id, 2]));
                await scope.onmessage!({ data: { type: "calculate", catalog, project: input } });
                expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
                    type: "done",
                    result: {
                        kind: "exact",
                        probability: 1,
                        spending,
                        meanCost: costs.reduce((sum, entry) => sum + entry.amount * 2, 0),
                    },
                });
            }
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
