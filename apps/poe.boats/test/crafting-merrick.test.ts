import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { allflameBracket, allflameQuote } from "../app/lib/crafting-allflame";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const record = catalog.crafting.currencies.find(
    (entry) => entry.action === "add_mod_and_corrupt_rare_abyss_jewel",
)!;
const method = { kind: "currency", id: record.id, allflame: true } as const;
const sulphur = catalog.crafting.allflame!.sulphur;
const base = "Metadata/Items/Jewels/JewelAbyssMelee";
const first: CraftingRandom = {
    pick: (choices) => choices.find((entry) => entry.weight > 0)!.value,
    integer: (min) => min,
};
const force = (outcome: string): CraftingRandom => ({
    ...first,
    pick: (choices) =>
        choices.find((entry) => entry.value === outcome)?.value ?? first.pick(choices),
});
const start = (count = 4, level = 86): CraftingItem => {
    let item: CraftingItem = {
        ...engine.createItem(base, level),
        rarity: "rare",
        intangibility: 100,
    };
    while (item.mods.length < count)
        item = engine.addStartingMod(item, engine.pool(item)[0]!.id, first);
    return item;
};
const target = engine.validateTarget({
    groups: [],
    corrupted: true,
    affixCount: { min: 5, max: 5 },
});
const project = (item = start(), patch = {}) =>
    craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item,
        method,
        target,
        steps: [],
        prices: { [method.id]: 3, [sulphur]: 0.001 },
        seed: 42,
        iterations: 500,
        maxActions: 1,
        ...patch,
    });

describe("Merrick's Allflame corruption", () => {
    it("uses the extracted four-copy bracket and scaled sulphur cost with mandatory Allflame", () => {
        expect(allflameBracket(catalog, method)).toMatchObject({
            outcomes: { min: 4, max: 4 },
            sulphurCost: 5000,
            intangibility: { min: 0, max: 0 },
        });
        expect(allflameQuote(catalog, start(), method)?.amount).toBe(12200);
        expect(allflameQuote(catalog, start(0, 1), method)?.amount).toBe(1700);
        expect(() => engine.validateMethod({ ...method, allflame: undefined })).toThrow(
            "requires Allflame",
        );
    });

    it("adds a fifth weighted modifier on either side while preserving all existing values and fractures", () => {
        const item = start();
        item.mods[0]!.fractured = true;
        const before = structuredClone(item);
        const pool = engine.pool(item, { limits: { max: 5, prefixes: 3, suffixes: 3 } });
        const sides = new Set<string>();
        for (let seed = 0; seed < 30; seed++) {
            const result = engine.apply(item, method, seededRandom(seed));
            expect(result.item.mods.slice(0, 4)).toEqual(item.mods);
            expect(result.item.mods).toHaveLength(5);
            expect(pool.some((entry) => entry.id === result.item.mods[4]!.id)).toBe(true);
            sides.add(engine.mod(result.item.mods[4]!.id).generation_type);
            expect(result.item).toMatchObject({
                corrupted: true,
                corruptedBy: method.id,
                allflameCrafted: true,
                rarity: "rare",
                intangibility: 100,
            });
            expect(result.cost).toEqual(engine.costs(method, item));
            expect(result.item.implicits).toEqual(item.implicits);
            expect(engine.limits(result.item)).toEqual({
                prefixes: 2,
                suffixes: 2,
                min: 3,
                max: 4,
            });
            expect(engine.pool(result.item)).toEqual([]);
        }
        expect(sides).toEqual(new Set(["prefix", "suffix"]));
        expect(item).toEqual(before);
    });

    it("keeps ordinary limits when a jewel has room and can corrupt an empty rare jewel", () => {
        const item = start(3);
        expect(engine.counts(item)).toEqual({ prefixes: 2, suffixes: 1 });
        const result = engine.apply(item, method, first).item;
        expect(engine.counts(result)).toEqual({ prefixes: 2, suffixes: 2 });
        expect(result.corruptedBy).toBe(method.id);
        const empty = engine.apply(start(0), method, first).item;
        expect(empty.mods).toHaveLength(1);
        expect(empty.corrupted).toBe(true);
    });

    it("rejects invalid inputs before randomness and prevents forged extra capacity or unrelated corrupted copies", () => {
        const invalid = [
            { ...start(), rarity: "magic" },
            { ...start(), corrupted: true },
            { ...start(), mirrored: true },
            { ...engine.createItem(baseId), rarity: "rare" },
            { ...engine.createItem("Metadata/Items/Jewels/JewelStr"), rarity: "rare" },
        ];
        for (const item of invalid) {
            const random = seededRandom(1);
            vi.spyOn(random, "pick");
            expect(() => engine.prepareAllflame(item as CraftingItem, method, random)).toThrow();
            expect(random.pick).not.toHaveBeenCalled();
        }
        const result = engine.apply(start(), method, first).item;
        expect(() => engine.validateItem({ ...result, corruptedBy: undefined })).toThrow(
            "affix limits",
        );
        for (const patch of [
            { corruptedBy: "missing" },
            { corrupted: false },
            { allflameCrafted: undefined },
            { mirrored: true },
            { baseId },
            { corruptedBy: (currency("corrupt_item") as { id: string }).id },
        ])
            expect(() => engine.validateItem({ ...result, ...patch })).toThrow("corruption source");
        const another = engine.pool(
            { ...start(0), mods: result.mods },
            { limits: { max: 6, prefixes: 4, suffixes: 4 } },
        )[0]!;
        expect(() =>
            engine.validateItem({
                ...result,
                mods: [...result.mods, engine.rollMod(another.id, first)],
            }),
        ).toThrow("affix limits");
        const pending = engine.prepareAllflame(
            { ...start(), intangibility: 0 },
            method,
            first,
        ).item;
        const forged = structuredClone(pending);
        delete forged.allflameCopies![0]!.corruptedBy;
        expect(() => engine.validateItem(forged)).toThrow("Invalid pending Allflame copy");
    });

    it("preserves four independent corrupted offers and the chosen item through text, JSON and cost accounting", () => {
        const item = { ...start(), intangibility: 0 };
        const before = structuredClone(item);
        const pending = engine.prepareAllflame(item, method, seededRandom(42)).item;
        expect(pending.corrupted).toBe(false);
        expect(pending.allflameCopies).toHaveLength(4);
        expect(
            pending.allflameCopies!.every((copy) => copy.corrupted && copy.mods.length === 5),
        ).toBe(true);
        expect(pending.allflameCost).toEqual(engine.costs(method, item));
        expect(item).toEqual(before);
        const saved = validateProject(catalog, JSON.parse(JSON.stringify(project(pending))));
        expect(saved.item).toEqual(pending);
        for (let i = 0; i < 4; i++) {
            const chosen = engine.chooseAllflame(saved.item, i);
            const text = exportCraftingItemText(engine, chosen);
            expect(text).toContain("Corrupted by: Merrick's Ducat");
            expect(importCraftingItemText(engine, text)[0]!.item).toEqual(chosen);
            expect(() =>
                importCraftingItemText(engine, `${text}\nCorrupted by: Merrick's Ducat`),
            ).toThrow("one extracted currency");
            expect(() => engine.apply(chosen, method, first)).toThrow("uncorrupted");
        }
    });

    it("calculates the actual weighted side probability and samples target-aware four-copy selection", () => {
        const item = start();
        const pool = engine.pool(item, { limits: { max: 5, prefixes: 3, suffixes: 3 } });
        const p =
            pool
                .filter((entry) => entry.mod.generation_type === "prefix")
                .reduce((sum, entry) => sum + entry.weight, 0) /
            pool.reduce((sum, entry) => sum + entry.weight, 0);
        const wanted = engine.validateTarget({ ...target, prefixCount: { min: 3, max: 3 } });
        expect(calculateExact(engine, item, method, wanted).probability).toBeCloseTo(p, 12);
        const simulation = new CraftingSimulation(
            catalog,
            project({ ...item, intangibility: 0 }, { target: wanted }),
        );
        for (let i = 0; i < 500; i++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().probability).toBeCloseTo(1 - (1 - p) ** 4, 1);
        expect(simulation.result().spending[method.id]).toBe(500);
        expect(simulation.result().spending[sulphur]).toBe(12200 * 500);
        const process = calculateProcessExact(
            engine,
            project(item, {
                target: wanted,
                useProcess: true,
                steps: [
                    {
                        id: "merrick",
                        method,
                        condition: wanted,
                        onSuccess: "success",
                        onFailure: "failure",
                    },
                ],
            }),
        );
        expect(process.probability).toBeCloseTo(p, 12);
        expect(process.spending[method.id]).toBeCloseTo(1, 12);
        expect(process.spending[sulphur]).toBeCloseTo(12200, 8);
    });

    it("retains corruption provenance through tainted crafts without allowing ordinary crafts or permanent extra capacity", () => {
        const item = engine.apply(start(), method, first).item;
        expect(() => engine.apply(item, currency("add_mod_to_rare"), first)).toThrow();
        const scoured = engine.apply(item, currency("reroll_rare_hellscape"), force("scour")).item;
        expect(scoured.rarity).toBe("normal");
        expect(scoured.mods).toHaveLength(0);
        expect(scoured.corruptedBy).toBe(method.id);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, scoured))[0]!.item,
        ).toEqual(scoured);
        const rerolled = engine.apply(
            item,
            currency("reroll_rare_hellscape"),
            force("reroll"),
        ).item;
        expect(rerolled.mods.length).toBeLessThanOrEqual(4);
        expect(rerolled.corruptedBy).toBe(method.id);
        expect(engine.validateItem(rerolled)).toEqual(rerolled);
        const exalt = currency("add_mod_to_rare_hellscape");
        const removed = engine.apply(item, exalt, force("add")).item;
        expect(removed.mods).toHaveLength(4);
        expect(removed.corruptedBy).toBe(method.id);
        expect(engine.apply(removed, exalt, force("add")).item.mods).toHaveLength(3);
        expect(
            calculateExact(
                engine,
                item,
                exalt,
                engine.validateTarget({ groups: [], affixCount: { min: 4, max: 4 } }),
            ).probability,
        ).toBeCloseTo(1, 12);
    });

    it("does not enable Merrick methods or source records in PoE 2", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const other = new CraftingEngine(data);
        expect(() => other.validateMethod(method)).toThrow();
        const id = Object.entries(data.bases).find(([, base]) => base.item_class === "Jewel")![0];
        expect(() =>
            other.validateItem({
                ...other.createItem(id),
                corrupted: true,
                corruptedBy: method.id,
            }),
        ).toThrow("corruption source");
    });
});
