import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { socketLimit } from "../app/lib/crafting-sockets";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const method = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find(
        (entry) => entry.action === "reroll_socket_numbers_hellscape",
    )!.id,
};
const first: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };
const last: CraftingRandom = {
    pick: (choices) => choices.at(-1)!.value,
    integer: (_min, max) => max,
};
const item = (sockets = 4, level = 86): CraftingItem => ({
    ...engine.createItem(baseId, level),
    corrupted: true,
    sockets,
    quality: 20,
    memoryStrands: 82,
});
const target = engine.validateTarget({ groups: [], sockets: { min: 6, max: 6 } });

describe("Tainted Jeweller's Orb", () => {
    it("uses the extracted action only in PoE 1", () => {
        expect(engine.currencySupported("reroll_socket_numbers_hellscape")).toBe(true);
        expect(engine.methodName(method)).toBe("Tainted Jeweller's Orb");
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(poe2.currencySupported("reroll_socket_numbers_hellscape")).toBe(false);
    });

    it.each([
        "normal",
        "magic",
        "rare",
    ] as const)("adds and removes a socket on %s items without changing modifiers or strands", (rarity) => {
        const prepared = { ...item(), rarity };
        if (rarity !== "normal")
            prepared.mods = [engine.rollMod("IncreasedLife1", seededRandom(1))];
        const before = structuredClone(prepared);
        for (const [random, sockets] of [
            [first, 5],
            [last, 3],
        ] as const) {
            const result = engine.apply(prepared, method, random);
            expect(result.item).toEqual({ ...prepared, sockets });
            expect(result.cost).toEqual([
                { id: method.id, name: engine.methodName(method), amount: 1 },
            ]);
        }
        expect(prepared).toEqual(before);
    });

    it("uses each base's extracted capacity and item-level thresholds", () => {
        for (const [level, maximum] of [
            [1, 2],
            [2, 3],
            [24, 3],
            [25, 4],
            [34, 4],
            [35, 5],
            [49, 5],
            [50, 6],
        ]) {
            const prepared = item(maximum! - 1, level!);
            expect(socketLimit(catalog, prepared, level)).toBe(maximum);
            expect(engine.apply(prepared, method, first).item.sockets).toBe(maximum);
            expect(() => engine.apply({ ...prepared, sockets: maximum }, method, first)).toThrow(
                "maximum sockets",
            );
        }
        for (const [id, base] of Object.entries(catalog.bases)) {
            if (!base.rarities.includes("normal")) continue;
            const prepared = { ...engine.createItem(id), corrupted: true, sockets: 1 };
            const limit = socketLimit(catalog, prepared, prepared.level);
            if (limit > 1) {
                expect(engine.apply(prepared, method, first).item.sockets).toBe(2);
                expect(() => engine.apply({ ...prepared, sockets: limit }, method, first)).toThrow(
                    "maximum sockets",
                );
            }
        }
        expect(socketLimit(catalog, item(6, 1))).toBe(6);
        expect(() => engine.apply(item(6, 1), method, first)).toThrow("maximum sockets");
    });

    it("retains one socket on a failed removal and is unaffected by quality", () => {
        expect(engine.apply(item(1), method, last).item).toEqual(item(1));
        expect(engine.apply(item(1), method, first).item.sockets).toBe(2);
        const two = engine.validateTarget({ groups: [], sockets: { min: 2, max: 2 } });
        for (const quality of [0, 20, 30])
            expect(calculateExact(engine, { ...item(1), quality }, method, two).probability).toBe(
                0.5,
            );
    });

    it("rejects unsocketed, full, uncorrupted, mirrored and Abyss-socket items before randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const hollow = {
            ...item(0),
            rarity: "rare" as const,
            mods: [engine.rollMod("DelveAbyssJewelSocket1", first)],
        };
        for (const prepared of [
            item(0),
            item(6),
            { ...item(), corrupted: false },
            { ...item(), mirrored: true },
            hollow,
        ])
            expect(() => engine.apply(prepared, method, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
    });

    it("preserves socket outcomes in item text and project JSON", () => {
        const crafted = engine.apply(item(5), method, first).item;
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, crafted))[0]!.item,
        ).toEqual(crafted);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: crafted,
            method,
            target,
            steps: [],
            prices: {},
            seed: 42,
            iterations: 1000,
            maxActions: 3,
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("calculates bounded attempts with actual costs and no post-success maximum-socket errors", () => {
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: item(5),
            method,
            target,
            steps: [
                { id: "roll", method, condition: target, onSuccess: "success", onFailure: "roll" },
            ],
            prices: { [method.id]: 4 },
            seed: 42,
            iterations: 1000,
            maxActions: 3,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(0.625);
        expect(exact.meanCost).toBe(8);
        expect(exact.totalActions).toBe(2);
        expect(exact.errors).toEqual({});
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.probability).toBeGreaterThan(0.58);
        expect(result.probability).toBeLessThan(0.67);
        expect(result.meanCost).toBeCloseTo(8, 0);
        expect(result.meanCost).toBe((4 * result.spending[method.id]!) / 1000);
    });

    it("combines corrupted bench preparation and tainted attempts with the Vaal surcharge", () => {
        const recipe = catalog.crafting.bench.find((entry) => entry.socketCount === 4)!;
        const bench = { kind: "bench" as const, id: recipe.id };
        const vaal = catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!;
        const jeweller = recipe.cost[0]!.id;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: item(1),
            method,
            target,
            steps: [
                {
                    id: "bench",
                    method: bench,
                    condition: { groups: [] },
                    onSuccess: "roll",
                    onFailure: "failure",
                },
                { id: "roll", method, condition: target, onSuccess: "success", onFailure: "roll" },
            ],
            prices: { [method.id]: 4, [jeweller]: 0.2, [vaal.id]: 1 },
            seed: 42,
            iterations: 1000,
            maxActions: 3,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBe(0.25);
        expect(exact.meanCost).toBe(20);
        expect(exact.errors).toEqual({});
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            errors: {},
            meanCost: 20,
            spending: { [method.id]: 2000, [jeweller]: 10000, [vaal.id]: 10000 },
        });
    });
});
