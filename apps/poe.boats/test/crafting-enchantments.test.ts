import { describe, expect, it, vi } from "vite-plus/test";
import { availableEnchantments } from "../app/lib/crafting-enchantments";
import { seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { type CraftingItem, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const life = { kind: "harvest" as const, id: "LifeBodyEnchant" };
const mana = { kind: "harvest" as const, id: "ManaBodyEnchant" };
const lifeMod = "HarvestAlternateArmourQualityIncreasedLife";
const manaMod = "HarvestAlternateArmourQualityIncreasedMana";
const harvestRecipes = availableEnchantments(catalog).filter((entry) =>
    catalog.crafting.harvest.some((recipe) => recipe.id === entry.recipe),
);

describe("build-extracted Harvest enchantments", () => {
    it("applies every extracted enchantment to every allowed class and rarity without taking an affix slot", () => {
        const recipes = harvestRecipes;
        expect(recipes).toHaveLength(14);
        for (const recipe of recipes) {
            for (const itemClass of recipe.itemClasses) {
                const base = Object.entries(catalog.bases).find(
                    ([, entry]) => entry.item_class === itemClass && !entry.corrupted,
                )![0];
                for (const rarity of ["normal", "magic", "rare"] as const) {
                    const item = { ...engine.createItem(base, 1), rarity, quality: 20 };
                    const random = seededRandom(1);
                    const pick = vi.spyOn(random, "pick");
                    const result = engine.apply(
                        item,
                        { kind: "harvest", id: recipe.recipe },
                        random,
                    );
                    expect(result.item).toEqual({
                        ...item,
                        enchantments: [
                            {
                                id: recipe.mod,
                                values: engine.mod(recipe.mod).stats.map((stat) => stat.min),
                                crafted: false,
                                fractured: false,
                            },
                        ],
                    });
                    expect(pick).not.toHaveBeenCalled();
                    expect(engine.counts(result.item)).toEqual(engine.counts(item));
                    const source = catalog.crafting.harvest.find(
                        (entry) => entry.id === recipe.recipe,
                    )!;
                    expect(result.cost[0]!.amount).toBe(source.lifeforce);
                    expect(engine.harvestSupported(source.id)).toBe(true);
                }
            }
        }
    });

    it("replaces an enchantment and preserves a full item's rolls, fractures, metamods and quality", () => {
        let item: CraftingItem = { ...engine.createItem(baseId), rarity: "rare", quality: 28 };
        const lock = catalog.crafting.bench.find(
            (recipe) =>
                recipe.mod &&
                recipe.itemClasses.includes("Body Armour") &&
                engine
                    .mod(recipe.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_change_prefixes"),
        )!;
        item = engine.apply(item, { kind: "bench", id: lock.id }, seededRandom(1)).item;
        for (let index = 0; index < 5; index++)
            item = engine.apply(item, currency("add_mod_to_rare"), seededRandom(index)).item;
        item.mods[1]!.fractured = true;
        const before = structuredClone(item);
        const enchanted = engine.apply(item, life, seededRandom(2)).item;
        const replaced = engine.apply(enchanted, mana, seededRandom(3)).item;
        expect(item).toEqual(before);
        expect(replaced).toEqual({
            ...before,
            enchantments: [{ id: manaMod, values: [1, 1], crafted: false, fractured: false }],
        });
        expect(engine.statTotals(replaced)).toEqual(engine.statTotals(before));
    });

    it("rejects wrong classes, unavailable enchantments, corrupt states and tampered rolls", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const integer = vi.spyOn(random, "integer");
        const wand = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Wand",
        )![0];
        const item = engine.createItem(baseId);
        expect(() => engine.apply(engine.createItem(wand), life, random)).toThrow("item class");
        expect(() =>
            engine.apply(
                engine.createItem(wand),
                { kind: "harvest", id: "WeaponRangeEnchant" },
                random,
            ),
        ).toThrow("item class");
        for (const flags of [{ corrupted: true }, { mirrored: true }])
            expect(() => engine.apply({ ...item, ...flags }, life, random)).toThrow(
                "uncorrupted, unmirrored",
            );
        expect(pick).not.toHaveBeenCalled();
        expect(integer).not.toHaveBeenCalled();
        const enchanted = engine.apply(item, life, seededRandom(1)).item;
        const mod = enchanted.enchantments![0]!;
        for (const entry of [
            { ...mod, id: "IncreasedLife1" },
            { ...mod, crafted: true },
            { ...mod, fractured: true },
            { ...mod, values: [2, 1] },
            { ...mod, values: [1] },
            { ...mod, origin: { kind: "awakener", level: 86 } },
        ])
            expect(() => engine.validateItem({ ...enchanted, enchantments: [entry] })).toThrow();
        expect(() => engine.validateItem({ ...enchanted, enchantments: [mod, mod] })).toThrow();
        expect(() => engine.validateItem({ ...enchanted, baseId: wand })).toThrow("enchantment");
        expect(() =>
            engine.validateTarget({ groups: [], enchantments: ["IncreasedLife1"] }),
        ).toThrow("target enchantment");
    });

    it("preserves enchantments through ordinary crafting and restores them with an imprint", () => {
        const normal = engine.apply(
            { ...engine.createItem(baseId), quality: 20 },
            life,
            seededRandom(1),
        ).item;
        const rare = engine.apply(normal, currency("transmute_to_rare"), seededRandom(2)).item;
        const imprinted = engine.apply(rare, currency("inital_imprint"), seededRandom(3)).item;
        const replaced = engine.apply(imprinted, mana, seededRandom(4)).item;
        const restored = engine.apply(replaced, currency("restore_imprint"), seededRandom(5)).item;
        expect(restored.enchantments).toEqual(normal.enchantments);
        const divined = engine.apply(rare, currency("reroll_mod_values"), seededRandom(6)).item;
        const scoured = engine.apply(divined, currency("convert_to_normal"), seededRandom(7)).item;
        expect(scoured.enchantments).toEqual(normal.enchantments);
        expect(scoured.quality).toBe(20);
        expect(scoured.rarity).toBe("normal");
    });

    it("round-trips all extracted enchantments and base quality through item text", () => {
        for (const recipe of harvestRecipes) {
            const base = Object.entries(catalog.bases).find(
                ([, entry]) => entry.item_class === recipe.itemClasses[0] && !entry.corrupted,
            )![0];
            const item = engine.apply(
                { ...engine.createItem(base), quality: 20 },
                { kind: "harvest", id: recipe.recipe },
                seededRandom(1),
            ).item;
            const text = exportCraftingItemText(engine, item);
            expect(text).toContain(`{modGroup:${recipe.mod}}{enchant}`);
            expect(importCraftingItemText(engine, text).map((entry) => entry.item)).toContainEqual(
                item,
            );
        }
    });

    it("imports marked game enchantment lines and rejects unknown or forged enchantments", () => {
        const text = [
            "Rarity: Normal",
            "Plate Vest",
            "--------",
            "Quality: +20%",
            "--------",
            "Item Level: 86",
            "--------",
            "Quality does not increase Defences (enchant)",
            "Grants +1 to Maximum Life per 2% Quality (enchant)",
        ].join("\n");
        const item = importCraftingItemText(engine, text)[0]!.item;
        expect(item.quality).toBe(20);
        expect(item.mods).toEqual([]);
        expect(item.enchantments?.[0]?.id).toBe(lifeMod);
        expect(() => importCraftingItemText(engine, text.replace("+1 to", "+2 to"))).toThrow();
        expect(() =>
            importCraftingItemText(engine, `${text}\nUnknown enchantment (enchant)`),
        ).toThrow();
        expect(() => importCraftingItemText(engine, text.replaceAll(" (enchant)", ""))).toThrow();
    });

    it("supports independent enchantment targets and conditional replacement costs in all modes", () => {
        const item = engine.createItem(baseId);
        const lifeTarget = engine.validateTarget({ groups: [], enchantments: [lifeMod] });
        const manaTarget = engine.validateTarget({ groups: [], enchantments: [manaMod] });
        expect(calculateExact(engine, item, life, lifeTarget)).toEqual({
            probability: 1,
            states: 1,
        });
        expect(calculateExact(engine, item, life, manaTarget).probability).toBe(0);
        const lifeCost = engine.costs(life)[0]!;
        const manaCost = engine.costs(mana)[0]!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            target: manaTarget,
            method: life,
            steps: [
                { id: "life", method: life, condition: lifeTarget, onSuccess: "mana" },
                { id: "mana", method: mana, condition: manaTarget },
            ],
            prices: { [lifeCost.id]: 0.01, [manaCost.id]: 0.02 },
            seed: 1,
            iterations: 10,
            maxActions: 2,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 97.5,
            totalActions: 2,
            spending: { [lifeCost.id]: 3250, [manaCost.id]: 3250 },
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 10; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 10,
            meanCost: 97.5,
            totalActions: 20,
            errors: {},
        });
        const saved = { ...project, item: engine.apply(item, life, seededRandom(1)).item };
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    });
});
