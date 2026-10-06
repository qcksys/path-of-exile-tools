import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { retainedSocketLimit, socketBenchEligible, socketLimit } from "../app/lib/crafting-sockets";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const recipes = catalog.crafting.bench.filter((entry) => entry.socketCount);
const six = { kind: "bench" as const, id: recipes.find((entry) => entry.socketCount === 6)!.id };
const two = { kind: "bench" as const, id: recipes.find((entry) => entry.socketCount === 2)!.id };
const random = () => ({
    pick: vi.fn(() => {
        throw new Error("Socket bench must be deterministic");
    }),
    integer: vi.fn(() => {
        throw new Error("Socket bench must be deterministic");
    }),
});

describe("PoE 1 socket-count bench crafting", () => {
    it("crafts corrupted equipment with matching Vaal costs and preserves the original recipe", () => {
        const vaal = catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!;
        for (const recipe of recipes) {
            const item = {
                ...engine.createItem(baseId, 1),
                corrupted: true,
                quality: 20,
                sockets: 1,
            };
            const method = { kind: "bench" as const, id: recipe.id };
            const before = structuredClone(recipe);
            const surcharge = {
                id: vaal.id,
                name: vaal.name,
                amount: recipe.cost.reduce((sum, entry) => sum + entry.amount, 0),
            };
            const result = engine.apply(item, method, random());
            expect(result.item).toEqual({ ...item, sockets: recipe.socketCount });
            expect(result.cost).toEqual([...recipe.cost, surcharge]);
            expect(engine.costs(method, item)).toEqual(result.cost);
            expect(engine.costs(method)).toEqual(result.cost);
            expect(engine.costs(method, { ...item, corrupted: false })).toEqual(recipe.cost);
            expect(recipe).toEqual(before);
            expect(item.sockets).toBe(1);
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, result.item))[0]!
                    .item,
            ).toEqual(result.item);
        }
    });

    it("includes corrupted socket surcharges in exact and simulated process costs", () => {
        const vaal = {
            kind: "currency" as const,
            id: catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!.id,
        };
        const jeweller = recipes[0]!.cost[0]!.id;
        const item = { ...engine.createItem(baseId, 1), corrupted: true, sockets: 1 };
        const target = engine.validateTarget({
            groups: [],
            sockets: { min: 6, max: 6 },
            corrupted: true,
        });
        expect(calculateExact(engine, item, six, target).probability).toBe(1);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            target,
            method: six,
            steps: [
                {
                    id: "prepare",
                    method: two,
                    condition: { groups: [], sockets: { min: 2, max: 2 } },
                    onSuccess: "finish",
                    onFailure: "failure",
                },
                {
                    id: "finish",
                    method: six,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [jeweller]: 0.2, [vaal.id!]: 1 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(1);
        expect(exact.meanCost).toBeCloseTo(421.2);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            probability: 1,
            errors: {},
            spending: { [jeweller]: 35100, [vaal.id!]: 35100 },
        });
        expect(simulation.result().meanCost).toBeCloseTo(exact.meanCost!);
        delete project.prices[vaal.id!];
        expect(calculateProcessExact(engine, project).unpriced).toContain(vaal.id!);
    });

    it("keeps Abyss socket layouts unavailable instead of counting them as ordinary gem sockets", () => {
        const hollow = {
            ...engine.createItem(baseId),
            rarity: "rare" as const,
            mods: [engine.rollMod("DelveAbyssJewelSocket1", seededRandom(1))],
        };
        expect(engine.validateItem(hollow)).toEqual(hollow);
        expect(socketBenchEligible(catalog, hollow, recipes[0]!)).toBe(false);
        expect(() => engine.apply(hollow, six, random())).toThrow("unavailable");
        expect(() => engine.validateItem({ ...hollow, sockets: 6 })).toThrow("Abyss sockets");
    });

    it("charges a surcharge only after an earlier process step corrupts the item", () => {
        const vaal = {
            kind: "currency" as const,
            id: catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!.id,
        };
        const jeweller = recipes[0]!.cost[0]!.id;
        const target = { groups: [], sockets: { min: 6, max: 6 }, corrupted: true };
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: engine.createItem(baseId, 1),
            target,
            method: six,
            steps: [
                {
                    id: "corrupt",
                    method: vaal,
                    condition: { groups: [], corrupted: true },
                    onSuccess: "socket",
                    onFailure: "failure",
                },
                {
                    id: "socket",
                    method: six,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [jeweller]: 0.2, [vaal.id!]: 1 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        expect(engine.costs(six, project.item)).toEqual(
            recipes.find((entry) => entry.id === six.id)!.cost,
        );
        expect(engine.costs(six).map((entry) => entry.id)).toContain(vaal.id!);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            probability: 1,
            errors: {},
            spending: { [jeweller]: 35000, [vaal.id!]: 35100 },
        });
        expect(simulation.result().meanCost).toBeCloseTo(421);
    });

    it("uses extracted counts, costs and base limits across all socketable equipment", () => {
        expect(recipes.map((entry) => entry.socketCount)).toEqual([2, 3, 4, 5, 6]);
        let checked = 0;
        for (const [baseId, base] of Object.entries(catalog.bases)) {
            if (base.corrupted) continue;
            const item = engine.createItem(baseId, 1);
            for (const recipe of recipes) {
                const eligible =
                    recipe.itemClasses.includes(base.item_class) &&
                    recipe.socketCount! <= socketLimit(catalog, item);
                expect(socketBenchEligible(catalog, item, recipe)).toBe(eligible);
                if (!eligible) continue;
                const result = engine.apply(item, { kind: "bench", id: recipe.id }, random());
                expect(result.item).toEqual({ ...item, sockets: recipe.socketCount });
                expect(result.cost).toEqual(recipe.cost);
                expect(engine.validateItem(result.item)).toEqual(result.item);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(1000);
        expect(socketLimit(catalog, { baseId })).toBe(6);
        expect(retainedSocketLimit(catalog, { baseId, corrupted: true })).toBe(6);
    });

    it("increases and reduces counts at low item level without changing modifiers or quality", () => {
        let item = engine.apply(
            engine.createItem(baseId, 1),
            currency("transmute_to_magic"),
            seededRandom(1),
        ).item;
        item = { ...item, quality: 20, sockets: 2, memoryStrands: 50 };
        const before = structuredClone(item);
        const result = engine.apply(item, six, random());
        expect(result.item).toEqual({ ...before, sockets: 6 });
        expect(result.cost).toMatchObject([{ name: "Jeweller's Orb", amount: 350 }]);
        expect(engine.apply(result.item, two, random()).item).toEqual(before);
        expect(item).toEqual(before);
        expect(() => engine.apply(result.item, six, random())).toThrow("already has");
    });

    it("calculates deterministic targets, conditional processes and repeated trial costs", () => {
        const item = engine.createItem(baseId, 1);
        const target = engine.validateTarget({ groups: [], sockets: { min: 6, max: 6 } });
        expect(calculateExact(engine, item, six, target).probability).toBe(1);
        expect(calculateExact(engine, item, two, target).probability).toBe(0);
        const priceId = recipes[0]!.cost[0]!.id;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            target,
            method: six,
            steps: [
                {
                    id: "prepare",
                    method: two,
                    condition: { groups: [], sockets: { min: 2, max: 2 } },
                    onSuccess: "finish",
                    onFailure: "failure",
                },
                {
                    id: "finish",
                    method: six,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [priceId]: 0.2 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(1);
        expect(exact.meanCost).toBeCloseTo(70.2);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 100,
            probability: 1,
            errors: {},
            spending: { [priceId]: 35100 },
        });
        expect(simulation.result().meanCost).toBeCloseTo(70.2);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("retains socket counts through currency crafting, imprints, JSON and item text", () => {
        let item = engine.apply(
            engine.createItem(baseId),
            currency("transmute_to_magic"),
            seededRandom(1),
        ).item;
        item = engine.apply(item, six, random()).item;
        const imprinted = engine.apply(item, currency("inital_imprint"), seededRandom(1)).item;
        const changed = engine.apply(imprinted, two, random()).item;
        expect(
            engine.apply(changed, currency("restore_imprint"), seededRandom(1)).item.sockets,
        ).toBe(6);
        expect(
            engine.apply(item, currency("reroll_mod_values"), seededRandom(1)).item.sockets,
        ).toBe(6);
        expect(
            engine.apply(item, currency("convert_to_normal"), seededRandom(1)).item.sockets,
        ).toBe(6);
        for (const sockets of [0, 2, 6]) {
            const expected = { ...item, sockets };
            const text = exportCraftingItemText(engine, expected);
            expect(text).toContain(`Socket Count: ${sockets}`);
            expect(importCraftingItemText(engine, text)[0]!.item).toEqual(expected);
            expect(engine.validateItem(JSON.parse(JSON.stringify(expected)))).toEqual(expected);
        }
        const text = exportCraftingItemText(engine, item);
        const imported = importCraftingItemText(
            engine,
            text.replace("Socket Count: 6", "Sockets: R-G-B W-N-R"),
        )[0]!;
        expect(imported.item).toEqual({ ...item, socketLinks: [true, true, false, true, true] });
        expect(imported.warnings).toContain(
            "Gem socket counts and links were imported. Socket colours are not retained.",
        );
        for (const malformed of [
            "Socket Count: 7",
            "Socket Count: -1",
            "Socket Count: 1.5",
            "Sockets: S S",
            "Sockets: R-A",
            "Sockets: R--G",
            "Socket Count: 6\nSockets: R-G-B",
            "Socket Count: 6\nSocket Count: 6",
            "Sockets: R-G\nSockets: W",
        ])
            expect(() =>
                importCraftingItemText(engine, text.replace("Socket Count: 6", malformed)),
            ).toThrow();
    });

    it("rejects class, base-capacity and protected-state violations without using randomness", () => {
        const item = engine.createItem(baseId);
        const swordId = Object.keys(catalog.bases).find(
            (id) => catalog.bases[id]!.name === "Rusted Sword",
        )!;
        const flaskId = Object.keys(catalog.bases).find(
            (id) => catalog.bases[id]!.name === "Quicksilver Flask",
        )!;
        const fishingId = Object.keys(catalog.bases).find(
            (id) => catalog.bases[id]!.item_class === "FishingRod",
        )!;
        expect(socketLimit(catalog, { baseId: swordId })).toBe(3);
        for (const invalid of [
            engine.createItem(swordId),
            engine.createItem(flaskId),
            { ...item, mirrored: true },
            { ...item, corrupted: true, mirrored: true },
        ])
            expect(() => engine.apply(invalid, six, random())).toThrow();
        if (fishingId)
            expect(() => engine.apply(engine.createItem(fishingId), two, random())).toThrow(
                "unavailable",
            );
        for (const sockets of [-1, 1.5, 7])
            expect(() => engine.validateItem({ ...item, sockets })).toThrow();
        expect(() => engine.validateTarget({ groups: [], sockets: { min: 7, max: 7 } })).toThrow(
            "six",
        );
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(() => poe2.validateMethod(six)).toThrow("Unknown bench");
        const base2 = Object.keys(poe2.catalog.bases).find(
            (baseId) => socketLimit(poe2.catalog, { baseId }) === 2,
        )!;
        const item2 = poe2.createItem(base2);
        expect(() =>
            importCraftingItemText(poe2, `${exportCraftingItemText(poe2, item2)}\nSocket Count: 2`),
        ).toThrow("Socket Count");
    });
});
