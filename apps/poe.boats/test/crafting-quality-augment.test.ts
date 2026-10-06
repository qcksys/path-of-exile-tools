import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { augmentText, availableAugments } from "../app/lib/crafting-augments";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    baseQualityLimit,
    qualityInfuserState,
    retainedBaseQualityLimit,
} from "../app/lib/crafting-quality";
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
import { baseId as poe1Base, engine as poe1Engine } from "./crafting-fixtures";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const serle = catalog.crafting.augments.find((entry) =>
    entry.rules.some((rule) => rule.stats.some((stat) => stat.id === "local_maximum_quality_is_%")),
)!;
const base = Object.keys(catalog.bases).find(
    (id) =>
        catalog.bases[id]!.item_class === "One Hand Mace" && !catalog.bases[id]!.implicits.length,
)!;
const whetstone = catalog.crafting.baseQuality.find(
    (entry) => !entry.corrupted && entry.itemClasses.includes("One Hand Mace"),
)!;
const infuser = catalog.crafting.qualityInfusers.find((entry) =>
    entry.itemClasses.includes("One Hand Mace"),
)!;
const method = { kind: "currency" as const, id: whetstone.id };
const socket = { kind: "augment" as const, id: serle.id };
const blank = (): CraftingItem => ({ ...engine.createItem(base), sockets: 1 });
const equipped = () => engine.apply(blank(), socket, seededRandom(42)).item;
const target = (min: number, max = min) =>
    engine.validateTarget({ groups: [], quality: { min, max } });

describe("maximum-quality Runes", () => {
    it("exposes the extracted Rune only on its allowed classes and preserves quality when socketing", () => {
        expect(serle.name).toBe("Legacy of Serle's Grit");
        expect(serle.rules[0]!.stats[0]!.min).toBe(40);
        expect(availableAugments(catalog, blank()).map((entry) => entry.id)).toContain(serle.id);
        const item = engine.apply({ ...blank(), quality: 30 }, socket, seededRandom(42));
        expect(item.item.quality).toBe(30);
        expect(item.cost).toEqual([{ id: serle.id, name: serle.name, amount: 1 }]);
        expect(baseQualityLimit(catalog, item.item)).toBe(40);
        expect(augmentText(catalog, item.item, serle.id)).toContain("40%");
        const wrongBase = Object.keys(catalog.bases).find(
            (id) => catalog.bases[id]!.item_class === "Two Hand Mace",
        )!;
        expect(() =>
            engine.apply({ ...blank(), baseId: wrongBase }, socket, seededRandom(42)),
        ).toThrow("no effect");
        expect(() =>
            engine.validateItem({
                ...equipped(),
                corrupted: true,
                sockets: 2,
                augments: [serle.id, serle.id],
            }),
        ).toThrow("augment limit");
    });

    it("raises quality to the active Rune maximum, with unchanged item-level increments and cost", () => {
        const item = { ...equipped(), quality: 39 };
        const result = engine.apply(item, method, seededRandom(42));
        expect(result.item).toEqual({ ...item, quality: 40 });
        expect(result.cost).toMatchObject([{ id: whetstone.id, amount: 1 }]);
        expect(calculateExact(engine, item, method, target(40)).probability).toBe(1);
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(result.item, method, random)).toThrow("maximum quality");
        expect(pick).not.toHaveBeenCalled();
        expect(
            engine.apply({ ...equipped(), level: 1 }, method, seededRandom(42)).item.quality,
        ).toBe(20);
    });

    it("scales the maximum with the extracted Alloy modifier and retains quality after both effects are removed", () => {
        const item = engine.addStartingMod(
            equipped(),
            "AlloyEffectOfSocketedAugments1",
            seededRandom(42),
            "essence",
        );
        item.mods[0]!.values = [30];
        expect(baseQualityLimit(catalog, item)).toBe(52);
        expect(retainedBaseQualityLimit(catalog, blank())).toBe(62);
        expect(augmentText(catalog, item, serle.id)).toContain("52%");
        const result = engine.apply({ ...item, quality: 51 }, method, seededRandom(42)).item;
        expect(result.quality).toBe(52);
        const rune = availableAugments(catalog, item).find((entry) =>
            entry.id.endsWith("RuneFire"),
        )!;
        const replaced = engine.apply(
            result,
            { kind: "augment", id: rune.id, replace: 0 },
            seededRandom(42),
        ).item;
        expect(replaced.quality).toBe(52);
        expect(baseQualityLimit(catalog, replaced)).toBe(20);
        const annul = catalog.crafting.currencies.find(
            (entry) => entry.action === "remove_random_mod",
        )!;
        const removed = engine.apply(
            replaced,
            { kind: "currency", id: annul.id },
            seededRandom(42),
        ).item;
        expect(removed.mods).toEqual([]);
        expect(removed.quality).toBe(52);
        expect(() => engine.apply(removed, method, seededRandom(42))).toThrow("maximum quality");
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, removed)).map(
                (entry) => entry.item,
            ),
        ).toContainEqual(removed);
    });

    it("starts Infusers at the current maximum and models their corruption chance from excess quality", () => {
        const item = { ...equipped(), quality: 49 };
        expect(qualityInfuserState(catalog, item, infuser.id)).toMatchObject({
            maximum: 40,
            limit: 50,
            corruptionChance: 45,
        });
        expect(() =>
            engine.apply(
                { ...item, quality: 39 },
                { kind: "currency", id: infuser.id },
                seededRandom(42),
            ),
        ).toThrow("at least 40%");
        expect(
            calculateExact(engine, item, { kind: "currency", id: infuser.id }, target(50))
                .probability,
        ).toBeCloseTo(1);
        expect(
            calculateExact(
                engine,
                item,
                { kind: "currency", id: infuser.id },
                engine.validateTarget({
                    groups: [],
                    quality: { min: 50, max: 50 },
                    corrupted: true,
                }),
            ).probability,
        ).toBeCloseTo(0.45);
        for (const locked of [
            { corrupted: true },
            { mirrored: true },
            { sanctified: true },
        ] as const) {
            const random = seededRandom(42);
            const pick = vi.spyOn(random, "pick");
            expect(() => engine.apply({ ...item, ...locked }, method, random)).toThrow();
            expect(pick).not.toHaveBeenCalled();
        }
        expect(() => engine.validateItem({ ...blank(), quality: 63 })).toThrow("maximum quality");
        expect(() =>
            poe1Engine.validateItem({ ...poe1Engine.createItem(poe1Base), quality: 40 }),
        ).toThrow("maximum quality");
        expect(() =>
            poe1Engine.validateTarget({ groups: [], quality: { min: 41, max: 41 } }),
        ).toThrow("40%");
    });

    it("runs quality loops consistently through exact calculation, simulation and saved projects", () => {
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item: { ...equipped(), quality: 39 },
            method,
            target: target(40),
            steps: [
                {
                    id: "quality",
                    method,
                    condition: target(40),
                    onSuccess: "success",
                    onFailure: "quality",
                },
            ],
            useProcess: true,
            prices: { [whetstone.id]: 3 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 3,
            errors: {},
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < 100; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 100,
            totalActions: 100,
            meanCost: 3,
            errors: {},
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
        const result = engine.apply(project.item, method, seededRandom(42)).item;
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result)).map(
                (entry) => entry.item,
            ),
        ).toContainEqual(result);
    });
});
