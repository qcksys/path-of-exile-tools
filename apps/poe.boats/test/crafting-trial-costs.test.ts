import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { CraftingSimulation, calculateProcessExact } from "~/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];
afterEach(() => vi.unstubAllGlobals());

describe.each(catalogs)("$game individual trial costs", (data) => {
    const engine = new CraftingEngine(data);
    const base = Object.entries(data.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && !entry.implicits.length,
    )![0];
    const annul = data.crafting.currencies.find((entry) => entry.action === "remove_random_mod")!;
    const divine = data.crafting.currencies.find((entry) => entry.action === "reroll_mod_values")!;
    const method = { kind: "currency", id: annul.id } as const;
    const any = engine.validateTarget({ groups: [] });
    function project() {
        let item = engine.addStartingMod(
            engine.createItem(base),
            "IncreasedLife1",
            seededRandom(1),
        );
        item = engine.addStartingMod({ ...item, rarity: "rare" }, "ColdResist1", seededRandom(1));
        const target = engine.validateTarget({ groups: [{ mods: ["IncreasedLife1"] }] });
        return craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item,
            method,
            target,
            useProcess: true,
            steps: [
                {
                    id: "annul",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "restart",
                },
            ],
            prices: { [annul.id]: 2 },
            baseCost: 5,
            seed: 42,
            iterations: 80,
            maxActions: 5,
            sampleStorage: { mode: "all", limit: 100 },
        });
    }
    function run(input = project()) {
        const simulation = new CraftingSimulation(data, input);
        while (!simulation.done) simulation.runTrial();
        return simulation.result();
    }

    it("charges only the single craft when no process is selected", () => {
        const result = run({ ...project(), useProcess: false });
        expect(result.successCosts).toEqual({ cheapest: 2, costliest: 2, unpriced: 0 });
        for (const sample of result.samples)
            expect(sample.cost).toEqual({
                spending: { [annul.id]: 1 },
                baseItems: undefined,
                baseSpending: undefined,
                total: 2,
                unpriced: [],
            });
    });

    it("includes acquired bases and all currency spent on restarts within each trial", () => {
        const result = run();
        expect(result.samples.some((sample) => sample.cost!.baseItems! > 1)).toBe(true);
        for (const sample of result.samples) {
            const count = sample.cost!.spending[annul.id]!;
            expect(sample.cost).toMatchObject({
                baseItems: count,
                baseSpending: count * 5,
                total: count * 7,
                unpriced: [],
            });
        }
        const successful = result.samples
            .filter((sample) => sample.success)
            .map((sample) => sample.cost!.total!);
        expect(result.successCosts).toEqual({
            cheapest: 7,
            costliest: Math.max(...successful),
            unpriced: 0,
        });
        expect(result.successCosts!.costliest).toBeGreaterThan(7);
    });

    it("keeps complete cost extremes after storage fills or is disabled", () => {
        const input = project();
        const baseline = run(input);
        for (const mode of ["successes", "none"] as const) {
            const result = run({ ...input, sampleStorage: { mode, limit: 1 } });
            expect(result.successCosts).toEqual(baseline.successCosts);
            expect(result.spending).toEqual(baseline.spending);
            expect(result.successes).toBe(baseline.successes);
            expect(result.samples).toHaveLength(mode === "none" ? 0 : 1);
        }
    });

    it("reuses one base when a value-reroll step loops", () => {
        const input = project();
        const range = data.mods.IncreasedLife1!.stats[0]!;
        const condition = engine.validateTarget({
            groups: [],
            stats: [{ id: range.id, min: Math.ceil((range.min + range.max) / 2) }],
        });
        input.target = condition;
        input.steps = [
            {
                id: "reroll",
                method: { kind: "currency", id: divine.id },
                condition,
                onSuccess: "success",
                onFailure: "reroll",
            },
        ];
        input.prices[divine.id] = 2;
        const result = run(input);
        expect(result.samples.some((sample) => sample.cost!.spending[divine.id]! > 1)).toBe(true);
        for (const sample of result.samples)
            expect(sample.cost).toMatchObject({
                baseItems: 1,
                baseSpending: 5,
                total: 5 + sample.cost!.spending[divine.id]! * 2,
            });
        expect(result.successCosts!.cheapest).toBe(7);
        expect(result.successCosts!.costliest).toBeLessThanOrEqual(15);
    });

    it("does not claim extremes across only the priced subset of successes", () => {
        const input = project();
        input.steps[0]!.onFailure = "reroll";
        input.steps.push({
            id: "reroll",
            method: { kind: "currency", id: divine.id },
            condition: any,
            onSuccess: "success",
            onFailure: "failure",
        });
        input.target = any;
        const result = run(input);
        const unpriced = result.samples.filter(
            (sample) => sample.success && sample.cost!.total === null,
        );
        expect(unpriced.length).toBeGreaterThan(0);
        expect(unpriced.length).toBeLessThan(result.successes);
        expect(result.successCosts).toEqual({
            cheapest: null,
            costliest: null,
            unpriced: unpriced.length,
        });
        expect(unpriced[0]!.cost!.unpriced).toEqual([divine.id]);
        expect(unpriced[0]!.cost!.spending).toEqual({ [annul.id]: 1, [divine.id]: 1 });
    });

    it("keeps successful ranges known when only failed trials have an unpriced currency", () => {
        const input = project();
        input.steps[0]!.onFailure = "reroll";
        input.steps.push({
            id: "reroll",
            method: { kind: "currency", id: divine.id },
            condition: any,
            onSuccess: "failure",
            onFailure: "failure",
        });
        const result = run(input);
        expect(result.unpriced).toEqual([divine.id]);
        expect(result.meanCost).toBeNull();
        expect(result.successCosts).toEqual({ cheapest: 7, costliest: 7, unpriced: 0 });
        expect(
            result.samples.some((sample) => !sample.success && sample.cost!.total === null),
        ).toBe(true);
    });

    it("reports zero-cost successes and excludes base prices only when absent", () => {
        const input = project();
        input.steps = [{ id: "free", condition: any, onSuccess: "success", onFailure: "failure" }];
        input.baseCost = 0;
        expect(run(input).successCosts).toEqual({ cheapest: 0, costliest: 0, unpriced: 0 });
        delete input.baseCost;
        const free = run(input);
        expect(free.samples[0]!.cost).toMatchObject({
            baseItems: 1,
            baseSpending: undefined,
            spending: {},
            total: 0,
        });
        input.baseCost = 5;
        expect(run(input).successCosts).toEqual({ cheapest: 5, costliest: 5, unpriced: 0 });
    });

    it("does not include unsuccessful, timed-out or unfinished trials in the range", () => {
        const input = project();
        input.steps = [{ id: "fail", condition: any, onSuccess: "failure", onFailure: "failure" }];
        expect(run(input).successCosts).toEqual({ cheapest: null, costliest: null, unpriced: 0 });
        input.steps[0]!.onSuccess = "fail";
        expect(run(input)).toMatchObject({
            timeouts: 80,
            successCosts: { cheapest: null, costliest: null, unpriced: 0 },
        });
        input.simulationLimit = { kind: "actions", count: 1 };
        expect(run(input)).toMatchObject({
            trials: 0,
            samples: [],
            successCosts: { cheapest: null, costliest: null, unpriced: 0 },
        });
    });

    it("returns costs through worker batches without assigning observed extremes to exact results", async () => {
        const input = project();
        input.iterations = 105;
        input.sampleStorage = { mode: "successes", limit: 1 };
        expect(calculateProcessExact(engine, input).successCosts).toBeUndefined();
        vi.resetModules();
        const scope = {
            onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
            postMessage: vi.fn(),
        };
        vi.stubGlobal("self", scope);
        await import("~/lib/crafting.worker");
        await scope.onmessage!({ data: { type: "process", catalog: data, project: input } });
        expect(scope.postMessage.mock.calls[0]![0]).toMatchObject({
            type: "progress",
            result: { trials: 100 },
        });
        expect(scope.postMessage.mock.lastCall![0]).toEqual({ type: "done", result: run(input) });
    });
});
