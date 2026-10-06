import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const talismanId = "Metadata/Items/Amulets/Talismans/Talisman1_2";
const imprint = { kind: "beast" as const, id: "EinharMasterCraft32" };
const fracture = { kind: "beast" as const, id: "EinharMasterCraft29" };
const double = { kind: "beast" as const, id: "EinharMasterCraftMorrigan6" };
function talisman(count = 6, base = talismanId): CraftingItem {
    let item: CraftingItem = { ...engine.createItem(base), rarity: "rare", memoryStrands: 82 };
    while (item.mods.length < count)
        item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
    return item;
}

describe("Talisman beastcrafting", () => {
    it("enables exactly the extracted recipes in PoE 1", () => {
        for (const method of [imprint, fracture, double]) {
            expect(engine.beastOperation(method.id)).toBe("talisman");
            expect(engine.beastRequiresLevel(method.id)).toBe(false);
        }
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        for (const method of [imprint, fracture, double])
            expect(() => poe2.validateMethod(method)).toThrow("not supported");
    });

    it("imprints every extracted Talisman base and restores exact modifiers, strands and values", () => {
        for (const [id, base] of Object.entries(catalog.bases)) {
            if (!base.tags.includes("talisman") || !base.rarities.includes("rare")) continue;
            const item = talisman(4, id);
            const before = structuredClone(item);
            const saved = engine.apply(item, imprint, seededRandom(1));
            expect(saved.item.imprint).toEqual(before);
            expect(saved.cost).toEqual([
                {
                    id: imprint.id,
                    name: "Beastcraft · Create an Imprint: Of a Rare Talisman",
                    amount: 1,
                },
            ]);
            const changed = engine.apply(
                saved.item,
                currency("remove_random_mod"),
                seededRandom(42),
            ).item;
            const consumed = engine.apply(
                changed,
                currency("consume_zana_influence_upgrade_mods"),
                seededRandom(42),
            ).item;
            expect(consumed.memoryStrands ?? 0).toBe(0);
            const restored = engine.apply(consumed, currency("restore_imprint"), seededRandom(1));
            expect(restored.item).toEqual(before);
            expect(restored.cost).toEqual([]);
            expect(restored.item.imprint).toBeUndefined();
            expect(item).toEqual(before);
        }
    });

    it.each([
        [fracture, 4, 1],
        [double, 6, 2],
    ] as const)("fractures with %j without replacing rolls or consuming strands", (method, minimum, count) => {
        const item = talisman(minimum);
        const before = structuredClone(item);
        const result = engine.apply(item, method, seededRandom(42));
        expect(result.item.mods.filter((entry) => entry.fractured)).toHaveLength(count);
        expect({
            ...result.item,
            mods: result.item.mods.map((entry) => ({ ...entry, fractured: false })),
        }).toEqual(before);
        expect(result.cost).toEqual([
            { id: method.id, name: `Beastcraft · ${engine.methodName(method)}`, amount: 1 },
        ]);
        expect(item).toEqual(before);
        const scoured = engine.apply(result.item, currency("reroll"), seededRandom(1)).item;
        for (const mod of result.item.mods.filter((entry) => entry.fractured))
            expect(scoured.mods).toContainEqual(mod);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result.item))[0]!.item,
        ).toEqual(result.item);
    });

    it("chooses distinct modifiers uniformly and includes crafted modifiers despite affix locks", () => {
        const lock = catalog.crafting.bench.find(
            (recipe) =>
                recipe.mod &&
                engine
                    .mod(recipe.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_change_suffixes"),
        )!;
        const item = talisman(2);
        const crafted = engine.apply(item, { kind: "bench", id: lock.id }, seededRandom(1)).item;
        let prepared = crafted;
        while (prepared.mods.length < 6)
            prepared = engine.addStartingMod(
                prepared,
                engine.pool(prepared)[0]!.id,
                seededRandom(1),
            );
        const sizes: number[] = [];
        const result = engine.apply(prepared, double, {
            integer: (min) => min,
            pick: (choices) => {
                sizes.push(choices.length);
                expect(choices.every((entry) => entry.weight === 1)).toBe(true);
                return choices.at(-1)!.value;
            },
        });
        expect(sizes).toEqual([6, 5]);
        expect(result.item.mods.filter((entry) => entry.fractured)).toHaveLength(2);
        const craftedLast = {
            ...prepared,
            mods: [
                ...prepared.mods.filter((entry) => !entry.crafted),
                ...prepared.mods.filter((entry) => entry.crafted),
            ],
        };
        expect(
            engine
                .apply(craftedLast, fracture, {
                    integer: (min) => min,
                    pick: (choices) => choices.at(-1)!.value,
                })
                .item.mods.at(-1),
        ).toMatchObject({ crafted: true, fractured: true });
    });

    it("rejects invalid bases, rarity, fractures, corruption, influence and short items before randomness", () => {
        const item = talisman();
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const method of [imprint, fracture, double]) {
            for (const bad of [
                { ...engine.createItem(baseId), rarity: "rare" as const },
                { ...item, rarity: "normal" as const, mods: [] },
                { ...item, corrupted: true },
                { ...item, mirrored: true },
                { ...item, mods: item.mods.map((entry, i) => ({ ...entry, fractured: i === 0 })) },
            ])
                expect(() => engine.apply(bad, method, random)).toThrow();
        }
        for (const [method, minimum] of [
            [fracture, 4],
            [double, 6],
        ] as const) {
            expect(() => engine.apply(talisman(minimum - 1), method, random)).toThrow("at least");
            expect(() => engine.apply({ ...item, influences: [1] }, method, random)).toThrow(
                "influence",
            );
        }
        expect(pick).not.toHaveBeenCalled();
    });

    it("prevents imprint restoration after fracturing and retains the original imprint in JSON", () => {
        const item = talisman();
        const saved = engine.apply(item, imprint, seededRandom(1)).item;
        const fractured = engine.apply(saved, double, seededRandom(1)).item;
        expect(fractured.imprint).toEqual(item);
        expect(engine.validateItem(JSON.parse(JSON.stringify(fractured)))).toEqual(fractured);
        expect(() => engine.apply(fractured, currency("restore_imprint"), seededRandom(1))).toThrow(
            "fractured",
        );
    });

    it("calculates single and double fracture targets and charges complete recipes in processes", () => {
        const item = talisman();
        const target = engine.validateTarget({
            groups: item.mods.slice(0, 2).map((entry) => ({ mods: [entry.id], fractured: true })),
        });
        expect(calculateExact(engine, item, double, target).probability).toBeCloseTo(1 / 15);
        const singleTarget = engine.validateTarget({
            groups: [{ mods: [item.mods[0]!.id], fractured: true }],
        });
        expect(calculateExact(engine, item, fracture, singleTarget).probability).toBeCloseTo(1 / 6);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: double,
            target,
            steps: [
                {
                    id: "fracture",
                    method: double,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [double.id]: 15 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(1 / 15);
        expect(exact.meanCost).toBeCloseTo(15);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let count = 0; count < 1000; count++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            errors: {},
            meanCost: 15,
            spending: { [double.id]: 1000 },
        });
        expect(simulation.result().probability).toBeGreaterThan(0.04);
        expect(simulation.result().probability).toBeLessThan(0.09);
    });

    it("restores strand checkpoints in conditional processes without charging restoration", () => {
        const item = talisman(4);
        const target = engine.validateTarget({
            groups: item.mods.map((entry) => ({ mods: [entry.id] })),
            memoryStrands: { min: 82, max: 82 },
        });
        const annulment = currency("remove_random_mod");
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: imprint,
            target,
            steps: [
                {
                    id: "save",
                    method: imprint,
                    condition: { groups: [] },
                    onSuccess: "change",
                    onFailure: "failure",
                },
                {
                    id: "change",
                    method: annulment,
                    condition: { groups: [] },
                    onSuccess: "restore",
                    onFailure: "failure",
                },
                {
                    id: "restore",
                    method: currency("restore_imprint"),
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [imprint.id]: 7, [engine.costs(annulment)[0]!.id]: 3 },
            seed: 42,
            iterations: 10,
            maxActions: 3,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact).toMatchObject({ probability: 1, meanCost: 10, totalActions: 3, errors: {} });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let count = 0; count < 10; count++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ successes: 10, meanCost: 10, errors: {} });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});
