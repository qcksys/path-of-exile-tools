import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { gildedImplicitId } from "../app/lib/crafting-fossils";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { FossilOptimizer } from "../app/lib/crafting-optimizer";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingMethod,
    craftingCatalogSchema,
    craftingModSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const fossil = (name: string) =>
    catalog.crafting.fossils.find((entry) => entry.name === `${name} Fossil`)!;
const method = (
    names = ["Gilded"],
    normal = false,
): Extract<CraftingMethod, { kind: "fossils" }> => ({
    kind: "fossils",
    ids: names.map((name) => fossil(name).id),
    resonator: catalog.crafting.currencies.find(
        (entry) =>
            entry.action === (normal ? "delve_currency_upgrade" : "delve_currency_reroll") &&
            entry.id.endsWith(String(names.length)),
    )!.id,
    logic: "additive",
});
const blank = () => ({ ...engine.createItem(baseId), rarity: "rare" as const });
const gilded = () => engine.rollMod(gildedImplicitId, seededRandom(42));

describe("Gilded Fossil", () => {
    it("exports the representative implicit unchanged from the verified build", () => {
        const mods = JSON.parse(readFileSync("../../packages/poe-1-data/data/mods.json", "utf8"));
        expect(catalog.mods[gildedImplicitId]).toEqual(
            craftingModSchema.parse(mods[gildedImplicitId]),
        );
        expect(fossil("Gilded").effects).toEqual(["BetterSellPrice"]);
        expect(engine.mod(gildedImplicitId).stats).toEqual([
            { id: "local_item_sell_price_doubled", min: 2, max: 2 },
        ]);
        expect(engine.gildedModifiers(blank()).map((entry) => entry.id)).toEqual([
            gildedImplicitId,
        ]);
        expect(engine.pool(blank()).some((entry) => entry.id === gildedImplicitId)).toBe(false);
    });

    it("adds one implicit alongside the base implicit without using an affix slot or duplicating it", () => {
        const ring = Object.entries(catalog.bases).find(
            ([, base]) => base.name === "Coral Ring",
        )![0];
        for (const normal of [false, true]) {
            const item = {
                ...engine.createItem(ring),
                rarity: normal ? ("normal" as const) : ("rare" as const),
            };
            const before = structuredClone(item);
            const result = engine.apply(item, method(undefined, normal), seededRandom(42));
            expect(result.item.implicits).toEqual([...item.implicits, gilded()]);
            expect(result.item.rarity).toBe("rare");
            expect(result.item.mods.length).toBeGreaterThanOrEqual(4);
            expect(result.cost.map((entry) => entry.id)).toEqual([
                fossil("Gilded").id,
                method(undefined, normal).resonator,
            ]);
            expect(item).toEqual(before);
            const again = engine.apply(result.item, method(), seededRandom(43)).item;
            expect(again.implicits).toEqual(result.item.implicits);
            expect(engine.limits(again)).toEqual(
                engine.limits({ ...again, implicits: item.implicits }),
            );
        }
    });

    it("combines with forced affixes and fractures while later crafts retain the implicit", () => {
        const result = engine.apply(
            blank(),
            method(["Gilded", "Hollow", "Glyphic", "Fractured"]),
            seededRandom(42),
        );
        expect(result.item.implicits).toEqual([gilded()]);
        expect(result.item.mods.filter((entry) => entry.fractured)).toHaveLength(1);
        expect(result.item.mods.some((entry) => fossil("Hollow").forced.includes(entry.id))).toBe(
            true,
        );
        const essenceMods = catalog.crafting.essences
            .filter((entry) => entry.corrupted)
            .map((entry) => entry.mods["Body Armour"]);
        expect(result.item.mods.some((entry) => essenceMods.includes(entry.id))).toBe(true);
        for (const next of [
            method(["Sanctified"]),
            currency("reroll"),
            currency("convert_to_normal"),
            currency("reroll_implicit_mod"),
        ]) {
            const crafted = engine.apply(result.item, next, seededRandom(42)).item;
            expect(crafted.implicits).toEqual(result.item.implicits);
            expect(crafted.mods).toContainEqual(result.item.mods.find((entry) => entry.fractured));
        }
    });

    it("coexists with Eldritch implicits and survives Conflict without joining its choices", () => {
        const gloves = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Gloves",
        )![0];
        let item = engine.createItem(gloves);
        item = engine.addStartingMod(
            item,
            "IncreasedAttackSpeedEldritchImplicit2",
            seededRandom(42),
        );
        item = engine.addStartingMod(
            item,
            "ChanceToSuppressSpellsEldritchImplicit2",
            seededRandom(42),
        );
        item = engine.apply({ ...item, rarity: "rare" }, method(), seededRandom(42)).item;
        expect(item.implicits).toHaveLength(3);
        // Place the auxiliary implicit first to exercise selection independent of array position.
        item.implicits.unshift(item.implicits.pop()!);
        for (const direction of [0, 1]) {
            const random = seededRandom(42);
            vi.spyOn(random, "pick").mockImplementation((choices) => choices[direction]!.value);
            const result = engine.apply(item, currency("conflict_orb"), random).item;
            expect(result.implicits.map((entry) => entry.id)).toEqual([
                gildedImplicitId,
                `IncreasedAttackSpeedEldritchImplicit${direction === 0 ? 3 : 1}`,
                `ChanceToSuppressSpellsEldritchImplicit${direction === 0 ? 1 : 3}`,
            ]);
        }
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!.item,
        ).toEqual(item);
    });

    it("supports starting items, text and JSON persistence while rejecting invalid implicit states", () => {
        const ring = Object.entries(catalog.bases).find(
            ([, base]) => base.name === "Coral Ring",
        )![0];
        const item = engine.addStartingMod(
            engine.createItem(ring),
            gildedImplicitId,
            seededRandom(42),
        );
        expect(item.rarity).toBe("normal");
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!.item,
        ).toEqual(item);
        const plain = `Rarity: Normal\nCoral Ring\n--------\nItem Level: 86\n--------\n+${item.implicits[0]!.values[0]} to maximum Life (implicit)\nItem sells for much more to vendors (implicit)`;
        expect(importCraftingItemText(engine, plain)[0]!.item).toEqual(item);
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        for (const invalid of [
            { ...item, implicits: [gilded()] },
            { ...item, implicits: [...item.implicits, gilded()] },
            {
                ...item,
                implicits: [...item.implicits.slice(0, 1), { ...gilded(), fractured: true }],
            },
            { ...item, implicits: [...item.implicits.slice(0, 1), { ...gilded(), crafted: true }] },
            { ...item, implicits: [...item.implicits.slice(0, 1), { ...gilded(), values: [3] }] },
            { ...blank(), mods: [gilded()] },
        ])
            expect(() => engine.validateItem(invalid)).toThrow();
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        for (const invalid of [
            { ...blank(), corrupted: true },
            { ...blank(), mirrored: true },
            { ...blank(), rarity: "magic" as const },
        ])
            expect(() => engine.apply(invalid, method(), random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const model = new CraftingEngine(data);
        expect(data.mods[gildedImplicitId]).toBeUndefined();
        expect(model.gildedModifiers(model.createItem(Object.keys(data.bases)[0]!))).toEqual([]);
        expect(() => model.validateMethod(method())).toThrow();
    });

    it("calculates implicit targets and carries their costs through processes and optimization", () => {
        const data = {
            ...catalog,
            mods: Object.fromEntries(
                [gildedImplicitId, "IncreasedLife1"].map((id) => [id, catalog.mods[id]!]),
            ),
        };
        const model = new CraftingEngine(data);
        const target = model.validateTarget({
            groups: [{ mods: [gildedImplicitId] }],
            stats: [{ id: "local_item_sell_price_doubled", min: 2, scope: "implicit" }],
        });
        expect(calculateExact(model, blank(), method(), target).probability).toBeCloseTo(1);
        expect(calculateExact(model, blank(), method(["Jagged"]), target).probability).toBe(0);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: blank(),
            method: method(),
            target,
            steps: [
                {
                    id: "gild",
                    method: method(),
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [fossil("Gilded").id]: 4, [fossil("Jagged").id]: 2, [method().resonator]: 1 },
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        expect(calculateProcessExact(model, project)).toMatchObject({
            probability: expect.closeTo(1),
            meanCost: expect.closeTo(5),
        });
        const simulation = new CraftingSimulation(data, project);
        for (let i = 0; i < project.iterations; i++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ successes: 100, errors: {}, meanCost: 5 });
        const optimizer = new FossilOptimizer(model, project.item, target, project.prices, 42, {
            fossils: [fossil("Jagged").id, fossil("Gilded").id],
            maxSockets: 1,
            trials: 100,
            logic: "additive",
        });
        while (!optimizer.runBatch()) {
            /* complete the bounded search */
        }
        expect(optimizer.result()).toMatchObject({ completed: 2, failed: 0, errors: [] });
        expect(optimizer.result().byAttempts[0]).toMatchObject({
            method: method(),
            probability: 1,
            costPerSuccess: 5,
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});
