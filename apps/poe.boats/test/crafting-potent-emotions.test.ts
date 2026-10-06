import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { rolledModText, scaledModValues } from "../app/lib/crafting-text";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const recipes = catalog.crafting.liquidEmotions.filter((entry) =>
    entry.rules.some((rule) => rule.mods.length > 1),
);
const rare = (baseId = "Metadata/Items/Jewels/JewelStr"): CraftingItem => ({
    ...engine.createItem(baseId),
    rarity: "rare",
});
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const fillSide = (input: CraftingItem, side: "prefix" | "suffix", count: number) => {
    let item = input;
    for (let index = 0; index < count; index++) {
        const next = engine.pool(item, { side })[0]!;
        item = engine.addStartingMod(item, next.id, seededRandom(1));
    }
    return item;
};

describe("Potent Liquid Emotion outcomes", () => {
    it("supports all 26 extracted recipes and both outcomes on every eligible jewel", () => {
        expect(
            catalog.crafting.liquidEmotions.filter((entry) => engine.emotionSupported(entry.id)),
        ).toHaveLength(26);
        expect(recipes).toHaveLength(3);
        for (const recipe of recipes) {
            for (const rule of recipe.rules) {
                const input = fillSide(rare(rule.base), "prefix", 1);
                const seen = new Set<string>();
                for (let seed = 0; seed < 16; seed++) {
                    const result = engine.apply(
                        input,
                        { kind: "currency", id: recipe.id },
                        seededRandom(seed),
                    );
                    expect(result.item.mods).toHaveLength(1);
                    const outcome = result.item.mods[0]!;
                    expect(rule.mods).toContain(outcome.id);
                    expect(outcome.crafted).toBe(true);
                    expect(result.cost).toMatchObject([{ id: recipe.id, amount: 1 }]);
                    seen.add(outcome.id);
                }
                expect([...seen].sort()).toEqual([...rule.mods].sort());
                expect(input.mods).toHaveLength(1);
            }
        }
    });

    it("selects each compatible outcome equally before removing from a full selected side", () => {
        const item = fillSide(fillSide(rare(), "prefix", 2), "suffix", 2);
        for (const recipe of recipes.filter((entry) => engine.emotionRule(item, entry.id))) {
            const method = { kind: "currency" as const, id: recipe.id };
            const rule = engine.emotionRule(item, recipe.id)!;
            for (const id of rule.mods) {
                const target = engine.validateTarget({ groups: [{ mods: [id] }] });
                expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(0.5);
            }
            const keep = engine.validateTarget({ groups: [{ mods: [item.mods[0]!.id] }] });
            expect(calculateExact(engine, item, method, keep).probability).toBeCloseTo(0.75);
            for (let seed = 0; seed < 12; seed++) {
                const result = engine.apply(item, method, seededRandom(seed)).item;
                const added = result.mods.find((entry) => entry.crafted)!;
                const removed = item.mods.find(
                    (entry) => !result.mods.some((other) => other.id === entry.id),
                )!;
                expect(engine.mod(added.id).generation_type).toBe(
                    engine.mod(removed.id).generation_type,
                );
                expect(result.mods).toHaveLength(4);
            }
        }
    });

    it("increases jewel capacity from extracted stats and retains extra affixes after removing the capacity modifier", () => {
        for (const [id, side, opposite] of [
            ["CraftedJewelAdditionalSuffixAllowed", "suffix", "prefix"],
            ["CraftedJewelAdditionalPrefixAllowed", "prefix", "suffix"],
        ] as const) {
            let item = engine.addStartingMod(rare(), id, seededRandom(1), "emotion");
            expect(engine.limits(item)).toMatchObject({
                [side === "prefix" ? "prefixes" : "suffixes"]: 3,
                max: 5,
            });
            item = fillSide(item, side, 3);
            const omen = catalog.crafting.currencies.find((entry) =>
                entry.id.endsWith(
                    opposite === "prefix"
                        ? "/OmenOnAnnulRemovePrefixes"
                        : "/OmenOnAnnulRemoveSuffixes",
                ),
            )!.id;
            const removed = engine.apply(
                item,
                { ...currency("remove_random_mod"), omens: [omen] },
                seededRandom(1),
            ).item;
            expect(removed.mods).toHaveLength(3);
            expect(removed.mods.some((entry) => entry.id === id)).toBe(false);
            expect(engine.pool(removed, { side })).toEqual([]);
            expect(engine.limits(removed)).toMatchObject({ prefixes: 2, suffixes: 2, max: 5 });
            expect(
                engine.matches(removed, engine.validateTarget({ groups: [], openAffixes: 2 })),
            ).toBe(true);
            const filled = fillSide(removed, opposite, 2);
            expect(filled.mods).toHaveLength(5);
            expect(engine.pool(filled)).toEqual([]);
            expect(
                engine.matches(
                    filled,
                    engine.validateTarget({ groups: [], affixCount: { min: 5, max: 5 } }),
                ),
            ).toBe(true);
            expect(
                engine.matches(filled, engine.validateTarget({ groups: [], openAffixes: 1 })),
            ).toBe(false);
            expect(engine.validateItem(JSON.parse(JSON.stringify(filled)))).toEqual(filled);
            const matches = importCraftingItemText(engine, exportCraftingItemText(engine, filled));
            expect(
                matches.some(
                    ({ item }) =>
                        item.mods.length === 5 &&
                        engine.counts(item)[side === "prefix" ? "prefixes" : "suffixes"] === 3,
                ),
            ).toBe(true);
            expect(() => engine.validateItem({ ...filled, rarity: "magic" })).toThrow(
                "affix limits",
            );
        }
    });

    it("scales only the opposite affix's scalable stats, supports value targets and imports effect lines after affected mods", () => {
        for (const [id, side] of [
            ["CraftedJewelPrefixEffect", "prefix"],
            ["CraftedJewelSuffixEffect", "suffix"],
        ] as const) {
            const item = fillSide(fillSide(rare(), "prefix", 1), "suffix", 1);
            const effect = {
                ...engine.rollMod(id, seededRandom(1), { crafted: true }),
                values: [50],
            };
            item.mods.push(effect);
            engine.validateItem(item);
            for (const entry of item.mods) {
                const mod = engine.mod(entry.id);
                const expected = entry.values.map((value, index) =>
                    mod.generation_type === side &&
                    catalog.crafting.scalableStats.includes(mod.stats[index]!.id)
                        ? Math.trunc(value * 1.5)
                        : value,
                );
                expect(scaledModValues(catalog, entry, item)).toEqual(expected);
            }
            expect(scaledModValues(catalog, effect, item)).toEqual([50]);
            const changed = item.mods.find(
                (entry) => engine.mod(entry.id).generation_type === side,
            )!;
            const stat = engine.mod(changed.id).stats[0]!;
            const total = engine.statTotals(item).get(stat.id)!;
            expect(
                engine.matches(
                    item,
                    engine.validateTarget({ groups: [], stats: [{ id: stat.id, min: total }] }),
                ),
            ).toBe(true);
            const text = exportCraftingItemText(engine, item);
            const imported = importCraftingItemText(engine, text)[0]!.item;
            for (const original of item.mods) {
                const recovered = imported.mods.find((entry) => entry.id === original.id)!;
                expect(rolledModText(catalog, recovered, imported)).toBe(
                    rolledModText(catalog, original, item),
                );
            }
            const plain = text.replace(/\{modGroup:[^}]+\}/g, "");
            expect(
                importCraftingItemText(engine, plain)[0]!.item.mods.some(
                    (entry) => entry.id === id,
                ),
            ).toBe(true);
        }
    });

    it("uses the same outcome model in conditional calculations, simulation, spending and saves", () => {
        const recipe = recipes.find((entry) => entry.id.endsWith("/EndgameDistilledEmotion2"))!;
        const item = fillSide(rare(), "prefix", 1);
        const method = { kind: "currency" as const, id: recipe.id };
        const target = engine.validateTarget({ groups: [{ mods: [recipe.rules[0]!.mods[0]!] }] });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            target,
            method,
            steps: [{ id: "emotion", method, condition: target }],
            prices: { [recipe.id]: 9 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: expect.closeTo(0.5),
            meanCost: expect.closeTo(9),
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            errors: {},
            meanCost: 9,
            spending: { [recipe.id]: 1000 },
        });
        expect(simulation.result().probability).toBeCloseTo(0.5, 1);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});
