import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateProcessExact,
    ExactCalculationLimit,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

afterEach(() => vi.unstubAllGlobals());

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const baseId = Object.entries(catalog.bases).find(([, base]) => base.item_class === "Ring")![0];
    const currency = (action: string): CraftingMethod => ({
        kind: "currency",
        id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    });
    const annul = currency("remove_random_mod");
    const exalt = currency("add_mod_to_rare");
    const annulId = engine.costs(annul)[0]!.id;
    const exaltId = engine.costs(exalt)[0]!.id;
    let item: CraftingItem = { ...engine.createItem(baseId), rarity: "rare" };
    for (const side of ["prefix", "suffix"] as const)
        item = engine.addStartingMod(item, engine.pool(item, { side })[0]!.id, seededRandom(42));
    const target = engine.validateTarget({ groups: [{ mods: [item.mods[0]!.id] }] });
    const project = () =>
        craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            target,
            method: annul,
            useProcess: true,
            steps: [
                {
                    id: "annul",
                    method: annul,
                    condition: target,
                    onSuccess: "exalt",
                    onFailure: "failure",
                },
                {
                    id: "exalt",
                    method: exalt,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [annulId]: 2, [exaltId]: 10 },
            seed: 17,
            iterations: 2000,
            maxActions: 3,
        });

    describe(`${game} combined crafting processes`, () => {
        it("weights conditional costs and actions by the chance of reaching each step", () => {
            const input = project();
            const before = structuredClone(input);
            const result = calculateProcessExact(engine, input);
            expect(input).toEqual(before);
            expect(result.kind).toBe("exact-process");
            expect(result.probability).toBeCloseTo(0.5, 12);
            expect(result.spending[annulId]).toBeCloseTo(1, 12);
            expect(result.spending[exaltId]).toBeCloseTo(0.5, 12);
            expect(result.totalActions).toBeCloseTo(1.5, 12);
            expect(result.meanCost).toBeCloseTo(7, 12);
            expect(result.costPerSuccess).toBeCloseTo(14, 12);
            expect(result.timeouts).toBe(0);
            expect(result.routes).toMatchObject({
                annul: {
                    visits: expect.closeTo(1),
                    passed: expect.closeTo(0.5),
                    failed: expect.closeTo(0.5),
                    errors: 0,
                    spending: { [annulId]: expect.closeTo(1) },
                },
                exalt: {
                    visits: expect.closeTo(0.5),
                    passed: expect.closeTo(0.5),
                    failed: 0,
                    errors: 0,
                    spending: { [exaltId]: expect.closeTo(0.5) },
                },
            });
        });

        it("agrees with sampled processes on conditional spending", () => {
            const input = project();
            const simulation = new CraftingSimulation(catalog, input);
            for (let i = 0; i < input.iterations; i++) simulation.runTrial();
            const result = simulation.result();
            expect(result.probability).toBeGreaterThan(0.46);
            expect(result.probability).toBeLessThan(0.54);
            expect(result.spending[annulId]).toBe(input.iterations);
            expect(result.spending[exaltId]).toBe(result.successes);
            expect(result.meanCost).toBeCloseTo(2 + 10 * result.probability, 12);
            expect(result.routes!.annul).toMatchObject({
                visits: input.iterations,
                passed: result.successes,
                failed: input.iterations - result.successes,
                errors: 0,
                spending: { [annulId]: input.iterations },
            });
            expect(result.routes!.exalt).toMatchObject({
                visits: result.successes,
                passed: result.successes,
                failed: 0,
                errors: 0,
                spending: { [exaltId]: result.successes },
            });
            simulation.runTrial();
            expect(result.routes!.annul!.visits).toBe(input.iterations);
        });

        it("restarts from the original item, keeps prior costs, and bounds retries exactly", () => {
            const input = project();
            input.steps = [{ ...input.steps[0]!, onSuccess: "success", onFailure: "restart" }];
            const result = calculateProcessExact(engine, input);
            expect(result.probability).toBe(7 / 8);
            expect(result.timeouts).toBe(1 / 8);
            expect(result.totalActions).toBe(7 / 4);
            expect(result.spending).toEqual({ [annulId]: 7 / 4 });
            expect(result.meanCost).toBe(7 / 2);
            expect(result.costPerSuccess).toBe(4);
            expect(result.routes!.annul).toMatchObject({
                visits: 7 / 4,
                passed: 7 / 8,
                failed: 7 / 8,
                errors: 0,
                spending: { [annulId]: 7 / 4 },
            });
        });

        it("counts invalid conditional steps as failures and retains only completed costs", () => {
            const input = project();
            input.steps[1]!.method = currency("transmute_to_magic");
            const result = calculateProcessExact(engine, input);
            expect(result.probability).toBe(0);
            expect(Object.values(result.errors)).toEqual([0.5]);
            expect(result.totalActions).toBe(1);
            expect(result.spending).toEqual({ [annulId]: 1 });
            expect(result.costPerSuccess).toBeNull();
            expect(result.routes!.exalt).toMatchObject({
                visits: 0.5,
                passed: 0,
                failed: 0,
                errors: 0.5,
                spending: {},
            });
        });

        it("ignores unreachable prices and requires prices for every reachable cost", () => {
            const input = project();
            delete input.prices[exaltId];
            expect(calculateProcessExact(engine, input).unpriced).toEqual([exaltId]);
            expect(calculateProcessExact(engine, input).meanCost).toBeNull();
            input.steps[0]!.onSuccess = "success";
            const result = calculateProcessExact(engine, input);
            expect(result.unpriced).toEqual([]);
            expect(result.meanCost).toBe(2);
            expect(result.routes!.exalt).toBeUndefined();
        });

        it("does not count a success terminal unless the final requirements are met", () => {
            const input = project();
            input.steps[0]!.condition = engine.validateTarget({ groups: [] });
            input.steps[0]!.onSuccess = "success";
            expect(calculateProcessExact(engine, input).probability).toBe(0.5);
            expect(calculateProcessExact(engine, input).routes!.annul!.passed).toBe(1);
        });

        it("stops enumeration without returning partial odds or costs", () => {
            expect(() => calculateProcessExact(engine, project(), 1)).toThrow(
                ExactCalculationLimit,
            );
            const input = project();
            input.maxActions = 10000;
            input.steps = [
                {
                    ...input.steps[0]!,
                    method: currency("reroll_mod_values"),
                    onSuccess: "annul",
                    onFailure: "annul",
                },
            ];
            expect(() => calculateProcessExact(engine, input, 1)).toThrow(ExactCalculationLimit);
        });

        it("emulates the same seeded process as a simulator trial without charging after completion", () => {
            const input = project();
            const process = new CraftingProcess(engine, input, seededRandom(input.seed));
            while (!process.done) process.advance();
            const result = process.result();
            process.advance();
            expect(process.result()).toEqual(result);
            const simulation = new CraftingSimulation(catalog, input, true);
            simulation.runTrial();
            expect(simulation.result().samples[0]!.item).toEqual(result.item);
            expect(simulation.result().spending).toEqual(result.spending);
            expect(simulation.result().successes).toBe(Number(result.success));
            expect(simulation.result().routes).toEqual(result.routes);
            const saved = process.result();
            saved.routes.annul!.passed = 999;
            saved.routes.annul!.spending[annulId] = 999;
            expect(process.result()).toEqual(result);
        });

        it("keeps the partial item and spending when an emulated process fails", () => {
            const input = project();
            input.steps[0]!.condition = engine.validateTarget({ groups: [] });
            input.steps[1]!.method = currency("transmute_to_magic");
            const process = new CraftingProcess(engine, input, seededRandom(input.seed));
            while (!process.done) process.advance();
            expect(process.result()).toMatchObject({
                actions: 1,
                success: false,
                timeout: false,
                spending: { [annulId]: 1 },
            });
            expect(process.result().error).toBeDefined();
            expect(process.item.mods).toHaveLength(1);
            expect(input.item.mods).toHaveLength(2);
            expect(process.result().routes.exalt).toMatchObject({
                visits: 1,
                errors: 1,
                spending: {},
            });
        });

        it("counts condition-only loops, reports live destinations and accepts arbitrary saved step IDs", () => {
            const input = project();
            input.maxActions = 3;
            input.steps = [
                {
                    id: "__proto__",
                    condition: engine.validateTarget({ groups: [] }),
                    onSuccess: "__proto__",
                    onFailure: "failure",
                },
            ];
            const process = new CraftingProcess(engine, input, seededRandom(1));
            expect(process.result().nextStep).toBe("__proto__");
            process.advance();
            expect(process.result()).toMatchObject({
                nextStep: "__proto__",
                lastStep: "__proto__",
                actions: 0,
                spending: {},
            });
            process.advance();
            process.advance();
            expect(process.result().nextStep).toBeUndefined();
            expect(process.result().routes.__proto__).toEqual({
                visits: 3,
                passed: 3,
                failed: 0,
                errors: 0,
                spending: {},
            });
            const exact = calculateProcessExact(engine, input);
            expect(exact).toMatchObject({
                probability: 0,
                timeouts: 1,
                totalActions: 0,
                meanCost: 0,
            });
            expect(exact.routes!.__proto__).toEqual(process.result().routes.__proto__);
            const simulation = new CraftingSimulation(catalog, input, true);
            simulation.runTrial();
            expect(JSON.parse(JSON.stringify(simulation.result().routes))).toEqual(
                JSON.parse(JSON.stringify(exact.routes)),
            );
            expect(Object.prototype).not.toHaveProperty("visits");
        });

        it("dispatches exact calculation, sampled fallback, and emulation through the worker", async () => {
            vi.resetModules();
            const scope = {
                onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
                postMessage: vi.fn(),
            };
            vi.stubGlobal("self", scope);
            await import("../app/lib/crafting.worker");
            await scope.onmessage!({ data: { type: "calculate", catalog, project: project() } });
            expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
                type: "done",
                result: { kind: "exact-process" },
            });
            scope.postMessage.mockClear();
            const input = project();
            input.steps[0]!.method = currency("transmute_to_rare");
            input.item = engine.createItem(baseId);
            input.iterations = 2;
            await scope.onmessage!({ data: { type: "calculate", catalog, project: input } });
            expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
                type: "done",
                result: { kind: "process", trials: 2 },
            });
            scope.postMessage.mockClear();
            await scope.onmessage!({
                data: { type: "emulate-process", catalog, project: project() },
            });
            expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
                type: "emulated",
                result: { actions: expect.any(Number) },
            });
            expect(scope.postMessage.mock.lastCall![0].result.routes.annul.visits).toBe(1);
            scope.postMessage.mockClear();
            const loop = project();
            loop.maxActions = 101;
            loop.steps = [
                {
                    id: "check",
                    condition: engine.validateTarget({ groups: [] }),
                    onSuccess: "check",
                    onFailure: "failure",
                },
            ];
            await scope.onmessage!({ data: { type: "emulate-process", catalog, project: loop } });
            expect(scope.postMessage.mock.calls[0]![0]).toMatchObject({
                type: "emulating",
                result: { nextStep: "check", routes: { check: { visits: 100, passed: 100 } } },
            });
            expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
                type: "emulated",
                result: { timeout: true, routes: { check: { visits: 101, passed: 101 } } },
            });
        });
    });
}
