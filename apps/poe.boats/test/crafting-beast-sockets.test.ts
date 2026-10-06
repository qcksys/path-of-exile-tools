import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import { socketLimit } from "../app/lib/crafting-sockets";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const recipe = catalog.crafting.beasts.find((entry) => entry.maximumSockets)!;
const method = { kind: "beast" as const, id: recipe.id };
const random = () => ({
    pick: vi.fn(() => {
        throw new Error("Socket beastcraft must be deterministic");
    }),
    integer: vi.fn(() => {
        throw new Error("Socket beastcraft must be deterministic");
    }),
});

describe("PoE 1 maximum-socket beastcraft", () => {
    it("uses the extracted operation independently of recipe identity and excludes other games", () => {
        expect(recipe.id).toBe("EinharMasterCraftMorrigan8");
        expect(recipe.components.map((entry) => entry.id)).toEqual([
            "LegendaryBeastShieldCrab",
            "Morrigan",
        ]);
        expect(engine.beastOperation(method.id)).toBe("maximum-sockets");
        expect(engine.beastRequiresLevel(method.id)).toBe(false);
        expect(engine.validateMethod(method)).toEqual(method);
        const changed = structuredClone(catalog);
        const renamed = changed.crafting.beasts.find((entry) => entry.id === method.id)!;
        renamed.id = "ChangedBuildRecipeId";
        expect(new CraftingEngine(changed).beastOperation(renamed.id)).toBe("maximum-sockets");
        renamed.gameMode = 2;
        expect(new CraftingEngine(changed).beastOperation(renamed.id)).toBeUndefined();
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(() => poe2.validateMethod(method)).toThrow("not supported");
    });

    it("uses each eligible base's extracted capacity, including low-level equipment", () => {
        let checked = 0;
        for (const [id, base] of Object.entries(catalog.bases)) {
            if (base.corrupted) continue;
            const item = engine.createItem(id, 1);
            const maximum = socketLimit(catalog, item);
            if (!maximum || maximum === item.sockets) continue;
            const result = engine.apply(item, method, random());
            expect(result.item).toEqual({ ...item, sockets: maximum });
            expect(result.cost).toEqual(engine.costs(method));
            checked++;
        }
        expect(checked).toBeGreaterThan(500);
        for (const [name, expected] of [
            ["Plate Vest", 6],
            ["Driftwood Wand", 3],
            ["Iron Hat", 4],
        ] as const) {
            const id = Object.entries(catalog.bases).find(
                ([, base]) => base.name === name && !base.corrupted,
            )![0];
            expect(engine.apply(engine.createItem(id, 1), method, random()).item.sockets).toBe(
                expected,
            );
        }
    });

    it("retains rolls, quality, strands, influences, fractures and imprint checkpoints", () => {
        const item = {
            ...engine.createItem(baseId, 1),
            rarity: "magic" as const,
            sockets: 2,
            quality: 20,
            memoryStrands: 82,
            influences: [0],
            mods: [engine.rollMod("IncreasedLife1", seededRandom(42))],
        };
        const imprinted = engine.apply(
            item,
            { kind: "beast", id: "EinharMasterCraft27" },
            random(),
        ).item;
        const result = engine.apply(imprinted, method, random());
        expect(result.item).toEqual({ ...imprinted, sockets: 6 });
        expect(result.item.imprint?.sockets).toBe(2);
        expect(imprinted.sockets).toBe(2);
        const fractured = {
            ...item,
            influences: [],
            mods: item.mods.map((mod) => ({ ...mod, fractured: true })),
        };
        expect(engine.apply(fractured, method, random()).item).toEqual({
            ...fractured,
            sockets: 6,
        });
        const restored = engine.apply(result.item, currency("restore_imprint"), random()).item;
        expect(restored.sockets).toBe(2);
        expect(restored.memoryStrands).toBe(82);
        expect(
            engine.apply(result.item, currency("reroll_magic"), seededRandom(42)).item.sockets,
        ).toBe(6);
    });

    it("rejects protected items, already maximum sockets and unsupported Abyss layouts before randomness", () => {
        const item = engine.createItem(baseId);
        const roll = random();
        for (const invalid of [
            { ...item, corrupted: true },
            { ...item, mirrored: true },
            { ...item, destroyed: true as const },
            { ...item, sockets: 6 },
            {
                ...item,
                rarity: "rare" as const,
                mods: [engine.rollMod("DelveAbyssJewelSocket1", seededRandom(1))],
            },
            engine.createItem("Metadata/Items/Rings/Ring1"),
        ])
            expect(() => engine.apply(invalid, method, roll)).toThrow();
        expect(roll.pick).not.toHaveBeenCalled();
        expect(roll.integer).not.toHaveBeenCalled();
        expect(item.sockets ?? 0).toBe(0);
    });

    it("preserves socket results and the method in item text and project JSON", () => {
        const result = engine.apply(engine.createItem(baseId, 1), method, random()).item;
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
        ).toEqual(result);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: result,
            method,
            target: { groups: [], sockets: { min: 6, max: 6 } },
            steps: [],
            prices: { [method.id]: 4 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        expect(validateProject(catalog, JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("shares deterministic odds, complete-recipe pricing and conditional process costs", () => {
        const item = engine.createItem(baseId, 1);
        const target = engine.validateTarget({ groups: [], sockets: { min: 6, max: 6 } });
        expect(calculateExact(engine, item, method, target).probability).toBe(1);
        const countTwo = catalog.crafting.bench.find((entry) => entry.socketCount === 2)!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [
                {
                    id: "maximum",
                    method,
                    condition: target,
                    onSuccess: "reduce",
                    onFailure: "failure",
                },
                {
                    id: "reduce",
                    method: { kind: "bench", id: countTwo.id },
                    condition: { groups: [], sockets: { min: 2, max: 2 } },
                    onSuccess: "finish",
                    onFailure: "failure",
                },
                {
                    id: "finish",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [method.id]: 4, [countTwo.cost[0]!.id]: 0.2 },
            seed: 42,
            iterations: 100,
            maxActions: 3,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 8.2,
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 100; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            probability: 1,
            errors: {},
            spending: { [method.id]: 200, [countTwo.cost[0]!.id]: 100 },
        });
        expect(simulation.result().meanCost).toBeCloseTo(8.2);
        expect(engine.costs(method)).toEqual([
            { id: method.id, name: `Beastcraft · ${engine.methodName(method)}`, amount: 1 },
        ]);
        delete project.prices[method.id];
        expect(calculateProcessExact(engine, project).unpriced).toContain(method.id);
    });
});
