import { describe, expect, it, vi } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { CraftingSimulation, calculateExact } from "../app/lib/crafting-simulation";
import { rolledModText } from "../app/lib/crafting-text";
import {
    craftingItemSchema,
    craftingProjectSchema,
    craftingTargetSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const recipes = catalog.crafting.beasts.filter((entry) => entry.aspectMod && entry.gameMode !== 2);
const spider = { kind: "beast", id: "EinharMasterCraftMorrigan3" } as const;

describe("Aspect beastcrafting", () => {
    it.each(
        recipes,
    )("adds the extracted outcome for $description without consuming the bench slot", (recipe) => {
        const item = engine.createItem(baseId, 1);
        const before = structuredClone(item);
        const method = { kind: "beast", id: recipe.id } as const;
        expect(engine.beastOperation(recipe.id)).toBe("aspect");
        expect(engine.beastRequiresLevel(recipe.id)).toBe(false);
        const result = engine.apply(item, method, seededRandom(1));
        expect(item).toEqual(before);
        expect(result.item.level).toBe(1);
        expect(result.item.rarity).toBe("magic");
        expect(result.item.mods).toHaveLength(1);
        expect(result.item.mods[0]).toMatchObject({
            id: recipe.aspectMod,
            crafted: false,
            fractured: false,
        });
        expect(rolledModText(catalog, result.item.mods[0]!, result.item)).toBe(
            engine.mod(recipe.aspectMod!).text,
        );
        expect(result.item.mods[0]!.values[0]).toBe(
            recipe.description.startsWith("Level 30") ? 30 : 20,
        );
        expect(result.cost).toEqual([
            {
                id: recipe.id,
                name: `Beastcraft · ${recipe.category}: ${recipe.description}`,
                amount: 1,
            },
        ]);
        expect(engine.costName(recipe.id)).toBe(result.cost[0]!.name);
        expect(
            engine.validateItem(craftingItemSchema.parse(JSON.parse(JSON.stringify(result.item)))),
        ).toEqual(result.item);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result.item))[0]!.item,
        ).toEqual(result.item);
    });

    it("preserves existing crafted modifiers, fractures and values", () => {
        let item = engine.addStartingMod(engine.createItem(baseId), "ColdResist1", seededRandom(2));
        item.mods[0]!.fractured = true;
        const bench = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                entry.itemClasses.includes(engine.base(item).item_class) &&
                engine.mod(entry.mod).stats.some((stat) => stat.id === "base_maximum_life"),
        )!;
        item = engine.apply(item, { kind: "bench", id: bench.id }, seededRandom(3)).item;
        const result = engine.apply(item, spider, seededRandom(4)).item;
        expect(result.mods.slice(0, 2)).toEqual(item.mods);
        expect(result.mods[2]!.crafted).toBe(false);
        expect(result.mods.filter((entry) => entry.crafted)).toHaveLength(1);
        const remove = catalog.crafting.bench.find((entry) => entry.action === 0 && !entry.mod)!;
        const removed = engine.apply(
            result,
            { kind: "bench", id: remove.id },
            seededRandom(5),
        ).item;
        expect(removed.mods.map((entry) => entry.id)).toEqual([
            "ColdResist1",
            "GrantsSpiderAspectCrafted30",
        ]);
        const divine = engine.apply(result, currency("reroll_mod_values"), seededRandom(8)).item;
        expect(divine.mods[2]).toEqual(result.mods[2]);
    });

    it("rejects full suffixes, conflicting granted skills and ineligible item classes before random rolls", () => {
        const random = seededRandom(1);
        const integer = vi.spyOn(random, "integer");
        let full = { ...engine.createItem(baseId), rarity: "rare" as const };
        for (let index = 0; index < 3; index++)
            full = {
                ...engine.addStartingMod(
                    full,
                    engine.pool(full, { side: "suffix" })[0]!.id,
                    seededRandom(index),
                ),
                rarity: "rare",
            };
        expect(() => engine.apply(full, spider, random)).toThrow("open suffix");
        const existing = engine.apply(
            { ...engine.createItem(baseId), rarity: "rare" },
            spider,
            seededRandom(1),
        ).item;
        expect(() =>
            engine.apply(existing, { kind: "beast", id: "EinharMasterCraft38" }, random),
        ).toThrow("conflicts");
        const jewelId = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Jewel",
        )![0];
        const jewel = engine.createItem(jewelId);
        expect(() => engine.apply(jewel, spider, random)).toThrow("cannot receive");
        expect(engine.recipePool(jewel, "aspect")).toEqual([]);
        expect(() =>
            engine.validateItem({ ...jewel, rarity: "rare", mods: existing.mods }),
        ).toThrow("not available");
        expect(() =>
            engine.apply({ ...engine.createItem(baseId), corrupted: true }, spider, random),
        ).toThrow("uncorrupted");
        expect(integer).not.toHaveBeenCalled();
    });

    it("uses adjusted magic suffix limits and exposes fixed Aspect targets without natural spawn weight", () => {
        const simplexId = Object.entries(catalog.bases).find(
            ([, base]) => base.name === "Simplex Amulet",
        )![0];
        const item = engine.createItem(simplexId);
        expect(() => engine.apply(item, spider, seededRandom(1))).toThrow("open suffix");
        const result = engine.apply({ ...item, rarity: "rare" }, spider, seededRandom(1)).item;
        expect(engine.counts(result).suffixes).toBe(1);
        expect(rolledModText(catalog, result.mods[0]!, result)).toBe(
            "Grants Level 30 Aspect of the Spider Skill",
        );
        expect(engine.recipePool(item, "aspect")).toHaveLength(8);
        expect(
            engine
                .pool({ ...item, rarity: "rare" })
                .some((entry) => entry.id === result.mods[0]!.id),
        ).toBe(false);
        expect(() =>
            engine.validateMethod({ kind: "beast", id: "EinharMasterCraftMorrigan3HardMode" }),
        ).toThrow("not supported");
    });

    it("calculates guaranteed outcomes and charges the beast recipe in conditional simulations", () => {
        const item = engine.createItem(baseId);
        const target = craftingTargetSchema.parse({
            groups: [{ mods: ["GrantsSpiderAspectCrafted30"] }],
        });
        expect(calculateExact(engine, item, spider, target)).toEqual({ probability: 1, states: 1 });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            target,
            method: spider,
            steps: [{ id: "aspect", method: spider, condition: target }],
            prices: { [spider.id]: 15 },
            seed: 1,
            iterations: 10,
            maxActions: 2,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 10; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 10,
            totalActions: 10,
            errors: {},
            meanCost: 15,
            spending: { [spider.id]: 10 },
        });
    });
});
