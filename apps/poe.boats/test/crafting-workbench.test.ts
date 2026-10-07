import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { CraftingWorkbenchCalculation, emulateCraftingItem } from "../app/lib/crafting-workbench";
import type { CraftingItem } from "../app/schemas/crafting";
import {
    craftingProcessResultSchema,
    craftingWorkbenchResultSchema,
} from "../app/schemas/crafting-workbench";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";
import { workbenchCatalog, workbenchProject } from "./crafting-workbench-fixtures";

describe("shared workbench execution", () => {
    it.each([
        "poe1",
        "poe2",
    ] as const)("calculates and samples %s with explicit unknown costs and action limits", (game) => {
        const data = workbenchCatalog(game);
        const project = workbenchProject(game);
        const before = structuredClone(project);
        const calculation = new CraftingWorkbenchCalculation(data, project, "calculate");
        while (!calculation.runBatch()) {
            /* finish fixture */
        }
        const exact = craftingWorkbenchResultSchema.parse(calculation.result());
        expect(exact.probability).toBeCloseTo(1, 12);
        expect(exact.costPerSuccess).toBeCloseTo(2, 12);
        expect(exact).toMatchObject({
            meanCost: 2,
            unpriced: [],
        });
        const unpriced = new CraftingWorkbenchCalculation(
            data,
            { ...project, prices: {} },
            "sample",
        );
        unpriced.runBatch();
        expect(craftingWorkbenchResultSchema.parse(unpriced.result())).toMatchObject({
            kind: "sampled",
            trials: 3,
            successes: 3,
            meanCost: null,
            costPerSuccess: null,
            unpriced: [project.method.kind === "currency" ? project.method.id : "missing"],
        });
        const bounded = new CraftingWorkbenchCalculation(
            data,
            {
                ...project,
                simulationLimit: { kind: "actions", count: 1 },
                steps: [
                    {
                        id: "wait",
                        condition: engine.validateTarget({ groups: [], rarity: "rare" }),
                        onSuccess: "success",
                        onFailure: "wait",
                    },
                ],
            },
            "process",
        );
        expect(bounded.runBatch()).toBe(true);
        const result = craftingWorkbenchResultSchema.parse(bounded.result());
        expect(result).toMatchObject({ trials: 0, stopReason: "actions", meanCost: null });
        expect(craftingProcessResultSchema.parse(result.unfinished)).toMatchObject({
            steps: 1,
            nextStep: "wait",
            success: false,
        });
        expect(project).toEqual(before);
    });

    it("defers Allflame costs until a copy is chosen and cannot charge a choice twice", () => {
        const item = { ...engine.createItem(baseId, 86), rarity: "rare" as const };
        const method = { ...currency("reroll"), allflame: true as const };
        const expected = engine.prepareAllflame(item, method, seededRandom(9));
        const result = emulateCraftingItem(engine, item, { kind: "apply", method }, 9);
        expect(result).toEqual({ item: expected.item, cost: [], actions: 0 });
        const chosen = emulateCraftingItem(
            engine,
            result.item,
            { kind: "choose-allflame", index: 0 },
            9,
        );
        expect(chosen.cost).toEqual(expected.cost);
        expect(chosen.actions).toBe(1);
        expect(chosen.item.allflameCopies).toBeUndefined();
        expect(() =>
            emulateCraftingItem(engine, chosen.item, { kind: "choose-allflame", index: 0 }, 9),
        ).toThrow();
        expect(item.mods).toEqual([]);
    });

    it.each([
        "poe1",
        "poe2",
    ] as const)("keeps %s reveal choices explicit and preserves their source", (game) => {
        const current = new CraftingEngine(workbenchCatalog(game));
        const base = Object.keys(current.catalog.bases).find(
            (id) =>
                current.catalog.bases[id]!.item_class === "Body Armour" &&
                current.catalog.bases[id]!.drop_level === 1,
        )!;
        const blank = current.createItem(base, 86);
        const source = current.revealSources(blank)[0]!.id;
        const item = current.validateItem({
            ...blank,
            rarity: "rare",
            mods: [current.rollMod("VeiledPrefix", seededRandom(1))],
            reveal: { mod: "VeiledPrefix", source, choices: [] },
        });
        const before = structuredClone(item);
        const result = emulateCraftingItem(current, item, { kind: "prepare-reveal" }, 17);
        expect(result.item.reveal).toMatchObject({ source });
        expect(result.item.reveal!.choices).toHaveLength(3);
        const id = result.item.reveal!.choices[0]!;
        const chosen = emulateCraftingItem(
            current,
            result.item,
            { kind: "choose-revealed", id },
            18,
        );
        expect(chosen.item.mods.some((entry) => entry.id === id)).toBe(true);
        expect(chosen).toMatchObject({ actions: 1, cost: [] });
        expect(item).toEqual(before);
        expect(() =>
            emulateCraftingItem(
                current,
                result.item,
                { kind: "choose-revealed", id: "not-offered" },
                18,
            ),
        ).toThrow();
    });

    it("returns a paid bench removal with its failure instead of losing the changed item", () => {
        let item: CraftingItem = { ...engine.createItem(baseId, 86), rarity: "rare" };
        while (engine.counts(item).prefixes < 3)
            item = engine.addStartingMod(
                item,
                engine.pool(item, { side: "prefix" })[0]!.id,
                seededRandom(1),
            );
        const recipes = catalog.crafting.bench.filter(
            (entry) => entry.mod && entry.itemClasses.includes("Body Armour"),
        );
        const prefix = recipes.find(
            (entry) => engine.mod(entry.mod!).generation_type === "prefix",
        )!;
        const suffix = recipes.find(
            (entry) => engine.mod(entry.mod!).generation_type === "suffix",
        )!;
        item = engine.apply(item, { kind: "bench", id: suffix.id }, seededRandom(1)).item;
        const before = structuredClone(item);
        const result = emulateCraftingItem(
            engine,
            item,
            { kind: "apply", method: { kind: "bench", id: prefix.id } },
            2,
        );
        expect(result.error).toContain("open prefix");
        expect(result.cost.length).toBeGreaterThan(0);
        expect(result.actions).toBe(1);
        expect(result.item.mods).toEqual(item.mods.filter((entry) => !entry.crafted));
        expect(item).toEqual(before);
    });
});
