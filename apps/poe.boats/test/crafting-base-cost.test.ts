import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

afterEach(() => vi.unstubAllGlobals());

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && !entry.implicits.length,
    )![0];
    let item = engine.addStartingMod(engine.createItem(base), "IncreasedLife1", seededRandom(1));
    item = engine.addStartingMod({ ...item, rarity: "rare" }, "ColdResist1", seededRandom(1));
    const annul = catalog.crafting.currencies.find(
        (entry) => entry.action === "remove_random_mod",
    )!;
    const any = engine.validateTarget({ groups: [] });
    const target = engine.validateTarget({ groups: [{ mods: ["IncreasedLife1"] }] });
    const project = () =>
        craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            target,
            method: { kind: "currency", id: annul.id },
            useProcess: true,
            steps: [{ id: "annul", method: { kind: "currency", id: annul.id }, condition: target }],
            prices: { [annul.id]: 2 },
            baseCost: 10,
            seed: 42,
            iterations: 1000,
            maxActions: 3,
        });

    describe(`${game} starting item prices`, () => {
        it("adds one base cost to successful and failed trials without changing currency usage or odds", () => {
            const input = project();
            const before = structuredClone(input);
            const result = calculateProcessExact(engine, input);
            expect(result).toMatchObject({
                probability: 0.5,
                baseItems: 1,
                baseSpending: 10,
                meanCost: 12,
                costPerSuccess: 24,
                spending: { [annul.id]: 1 },
            });
            expect(input).toEqual(before);
            expect(result.routes!.annul!.spending).toEqual(result.spending);
            input.baseCost = 0;
            expect(calculateProcessExact(engine, input)).toMatchObject({
                baseItems: 1,
                baseSpending: 0,
                meanCost: 2,
                costPerSuccess: 4,
            });
            delete input.baseCost;
            expect(calculateProcessExact(engine, input)).toMatchObject({
                baseItems: 1,
                baseSpending: undefined,
                meanCost: 2,
                costPerSuccess: 4,
            });
        });

        it("weights replacement bases on restarts and does not buy the next base after the step limit", () => {
            const input = project();
            input.steps[0]!.onFailure = "restart";
            expect(calculateProcessExact(engine, input)).toMatchObject({
                probability: 7 / 8,
                baseItems: 7 / 4,
                baseSpending: 17.5,
                meanCost: 21,
                costPerSuccess: 24,
            });
            input.maxActions = 1;
            expect(calculateProcessExact(engine, input)).toMatchObject({
                probability: 0.5,
                baseItems: 1,
                baseSpending: 10,
                meanCost: 12,
            });
        });

        it("reuses the current base across ordinary loops and counts actual condition-only restarts", () => {
            const input = project();
            input.steps = [
                { id: "check", condition: any, onSuccess: "check", onFailure: "failure" },
            ];
            const loop = calculateProcessExact(engine, input);
            expect(loop).toMatchObject({
                baseItems: 1,
                baseSpending: 10,
                meanCost: 10,
                timeouts: 1,
            });
            input.steps[0]!.onSuccess = "restart";
            const process = new CraftingProcess(engine, input, seededRandom(input.seed));
            expect(process.result().baseItems).toBe(1);
            process.advance();
            expect(process.result().baseItems).toBe(1);
            process.advance();
            expect(process.result().baseItems).toBe(2);
            process.advance();
            process.advance();
            expect(process.result()).toMatchObject({
                baseItems: 3,
                actions: 0,
                steps: 3,
                timeout: true,
            });
            expect(calculateProcessExact(engine, input)).toMatchObject({
                baseItems: 3,
                baseSpending: 30,
                meanCost: 30,
                costPerSuccess: null,
                spending: {},
            });
        });

        it("retains acquired bases on errors and keeps totals unknown when a currency price is missing", () => {
            const input = project();
            input.steps[0]!.onSuccess = "invalid";
            input.steps.push({
                id: "invalid",
                method: {
                    kind: "currency",
                    id: catalog.crafting.currencies.find(
                        (entry) => entry.action === "transmute_to_magic",
                    )!.id,
                },
                condition: any,
                onSuccess: "success",
                onFailure: "failure",
            });
            const result = calculateProcessExact(engine, input);
            expect(result).toMatchObject({
                baseItems: 1,
                baseSpending: 10,
                meanCost: 12,
                costPerSuccess: null,
            });
            expect(Object.values(result.errors)).toEqual([0.5]);
            delete input.prices[annul.id];
            expect(calculateProcessExact(engine, input)).toMatchObject({
                baseItems: 1,
                baseSpending: 10,
                meanCost: null,
                costPerSuccess: null,
                unpriced: [annul.id],
            });
        });

        it("aggregates base spending across sampled trials without consuming random choices", () => {
            const input = project();
            input.steps[0]!.onFailure = "restart";
            const withPrice = new CraftingSimulation(catalog, input);
            delete input.baseCost;
            const withoutPrice = new CraftingSimulation(catalog, input);
            expect(withPrice.result()).toMatchObject({
                baseItems: 0,
                baseSpending: 0,
                meanCost: null,
            });
            for (let trial = 0; trial < 1000; trial++) {
                withPrice.runTrial();
                withoutPrice.runTrial();
            }
            const result = withPrice.result();
            const free = withoutPrice.result();
            expect(result.probability).toBe(free.probability);
            expect(result.samples.map(({ cost, ...sample }) => sample)).toEqual(
                free.samples.map(({ cost, ...sample }) => sample),
            );
            for (const [index, sample] of result.samples.entries()) {
                expect(sample.cost!.spending).toEqual(free.samples[index]!.cost!.spending);
                expect(sample.cost!.total).toBe(
                    free.samples[index]!.cost!.total! + 10 * sample.cost!.baseItems!,
                );
            }
            expect(result.routes).toEqual(free.routes);
            expect(result.baseItems).toBe(result.spending[annul.id]);
            expect(result.baseSpending).toBe(10 * result.baseItems!);
            expect(result.baseItems! / result.trials).toBeCloseTo(1.75, 1);
            expect(result.meanCost).toBe((12 * result.baseItems!) / result.trials);
            expect(result.costPerSuccess).toBe((12 * result.baseItems!) / result.successes);
            expect(free.meanCost).toBe((2 * result.baseItems!) / result.trials);
        });

        it("preserves optional finite nonnegative prices in saves and leaves standalone crafts unchanged", () => {
            const input = project();
            input.baseCost = 2.25;
            expect(validateProject(catalog, JSON.parse(JSON.stringify(input))).baseCost).toBe(2.25);
            for (const baseCost of [-1, NaN, Infinity, "10", null])
                expect(() => validateProject(catalog, { ...input, baseCost })).toThrow();
            input.useProcess = false;
            const single = new CraftingSimulation(catalog, input);
            single.runTrial();
            expect(single.result()).toMatchObject({ meanCost: 2, spending: { [annul.id]: 1 } });
            expect(single.result().baseItems).toBeUndefined();
            expect(single.result().baseSpending).toBeUndefined();
        });

        it("returns base quantities and pricing through exact, sampled and emulator worker requests", async () => {
            vi.resetModules();
            const scope = {
                onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
                postMessage: vi.fn(),
            };
            vi.stubGlobal("self", scope);
            await import("../app/lib/crafting.worker");
            const input = project();
            input.steps[0]!.onFailure = "restart";
            input.iterations = 10;
            await scope.onmessage!({ data: { type: "calculate", catalog, project: input } });
            expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
                type: "done",
                result: {
                    kind: "exact-process",
                    baseItems: 1.75,
                    baseSpending: 17.5,
                    meanCost: 21,
                },
            });
            await scope.onmessage!({ data: { type: "process", catalog, project: input } });
            const sampled = scope.postMessage.mock.lastCall![0].result;
            expect(sampled.kind).toBe("process");
            expect(sampled.baseSpending).toBe(10 * sampled.baseItems);
            expect(sampled.meanCost).toBe(
                (sampled.baseSpending + 2 * sampled.spending[annul.id]) / 10,
            );
            await scope.onmessage!({ data: { type: "emulate-process", catalog, project: input } });
            const emulated = scope.postMessage.mock.lastCall![0];
            expect(emulated.type).toBe("emulated");
            expect(emulated.result.baseItems).toBe(emulated.result.spending[annul.id]);
            await scope.onmessage!({
                data: { type: "calculate", catalog, project: { ...input, useProcess: false } },
            });
            expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
                type: "done",
                result: { kind: "exact", meanCost: 2 },
            });
        });
    });
}
