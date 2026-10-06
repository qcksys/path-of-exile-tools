import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { CraftingSimulation, validateProject } from "~/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];

afterEach(() => vi.unstubAllGlobals());

describe.each(catalogs)("$game fixed simulation limits", (data) => {
    const engine = new CraftingEngine(data);
    const base = Object.entries(data.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && !entry.implicits.length,
    )![0];
    const currency = data.crafting.currencies.find(
        (entry) => entry.action === "remove_random_mod",
    )!;
    const method = { kind: "currency", id: currency.id } as const;
    const any = engine.validateTarget({ groups: [] });
    function project() {
        let item = engine.addStartingMod(
            engine.createItem(base),
            "IncreasedLife1",
            seededRandom(1),
        );
        item = engine.addStartingMod({ ...item, rarity: "rare" }, "ColdResist1", seededRandom(1));
        return craftingProjectSchema.parse({
            format: 1,
            game: data.game,
            patch: data.patch,
            item,
            method,
            target: { groups: [{ mods: ["IncreasedLife1"] }] },
            steps: [],
            prices: { [currency.id]: 2 },
            baseCost: 5,
            seed: 42,
            iterations: 100,
            maxActions: 10,
        });
    }

    it("runs beyond the trial count until stopped without changing seeded outcomes", () => {
        const input = project();
        input.iterations = 2;
        input.simulationLimit = { kind: "manual" };
        input.sampleStorage = { mode: "all", limit: 2 };
        input.successDistribution = true;
        expect(validateProject(data, JSON.parse(JSON.stringify(input))).simulationLimit).toEqual({
            kind: "manual",
        });
        const continuous = new CraftingSimulation(data, input);
        const fixed = new CraftingSimulation(data, {
            ...input,
            simulationLimit: undefined,
            iterations: 205,
        });
        for (let i = 0; i < 205; i++) {
            continuous.runTrial();
            fixed.runTrial();
        }
        expect(continuous.done).toBe(false);
        expect(fixed.done).toBe(true);
        expect(continuous.result()).toMatchObject(fixed.result());
        expect(continuous.result()).toMatchObject({
            trials: 205,
            totalSteps: 205,
            stopReason: undefined,
        });
        expect(continuous.result().samples).toHaveLength(2);
    });

    it("keeps individual process loops bounded in continuous runs", () => {
        const input = project();
        input.useProcess = true;
        input.iterations = 1;
        input.maxActions = 3;
        input.simulationLimit = { kind: "manual" };
        input.steps = [{ id: "loop", condition: any, onSuccess: "loop", onFailure: "failure" }];
        const simulation = new CraftingSimulation(data, input);
        for (let i = 0; i < 5; i++) simulation.runTrial();
        expect(simulation.done).toBe(false);
        expect(simulation.result()).toMatchObject({
            trials: 5,
            totalSteps: 15,
            totalActions: 0,
            timeouts: 5,
            successes: 0,
        });
    });

    it("publishes continuous worker batches until cancellation and starts a fresh job safely", async () => {
        vi.resetModules();
        const scope = {
            onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
            postMessage: vi.fn(),
        };
        vi.stubGlobal("self", scope);
        await import("../app/lib/crafting.worker");
        const input = project();
        input.iterations = 1;
        input.simulationLimit = { kind: "manual" };
        scope.postMessage.mockImplementation((message) => {
            if (message.result?.trials === 200) void scope.onmessage!({ data: { type: "cancel" } });
        });
        await scope.onmessage!({ data: { type: "sample", catalog: data, project: input } });
        expect(
            scope.postMessage.mock.calls.map(([message]) => [message.type, message.result.trials]),
        ).toEqual([
            ["progress", 100],
            ["progress", 200],
        ]);
        const last = scope.postMessage.mock.calls.at(-1)![0].result;
        const fixed = new CraftingSimulation(data, {
            ...input,
            iterations: 200,
            simulationLimit: undefined,
        });
        while (!fixed.done) fixed.runTrial();
        expect(last).toMatchObject(fixed.result());
        scope.postMessage.mockClear();
        await scope.onmessage!({
            data: {
                type: "sample",
                catalog: data,
                project: { ...input, simulationLimit: undefined },
            },
        });
        expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({
            type: "done",
            result: expect.objectContaining({ trials: 1 }),
        });
        expect(last.trials).toBe(200);
    });

    it("keeps exact calculation and sampled fallback finite when continuous simulation is selected", async () => {
        vi.resetModules();
        const scope = {
            onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
            postMessage: vi.fn(),
        };
        vi.stubGlobal("self", scope);
        await import("../app/lib/crafting.worker");
        const input = project();
        input.simulationLimit = { kind: "manual" };
        await scope.onmessage!({ data: { type: "calculate", catalog: data, project: input } });
        expect(scope.postMessage).toHaveBeenLastCalledWith({
            type: "done",
            result: expect.objectContaining({ kind: "exact", probability: 0.5 }),
        });
        const reroll = data.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_rare",
        )!;
        input.item = engine.createItem(base);
        input.method = { kind: "currency", id: reroll.id };
        input.iterations = 3;
        await scope.onmessage!({ data: { type: "calculate", catalog: data, project: input } });
        expect(scope.postMessage).toHaveBeenLastCalledWith({
            type: "done",
            result: expect.objectContaining({ kind: "sampled", trials: 3 }),
        });
        expect(scope.postMessage.mock.calls.at(-1)![0].result.simulationLimit).toBeUndefined();
    });

    it("stops exactly on a success target with the same seeded trial prefix", () => {
        const input = project();
        input.simulationLimit = { kind: "successes", count: 3 };
        const limited = new CraftingSimulation(data, input);
        const ordinary = new CraftingSimulation(data, { ...input, simulationLimit: undefined });
        while (!limited.done) {
            limited.runTrial();
            ordinary.runTrial();
        }
        expect(limited.result()).toMatchObject(ordinary.result());
        expect(limited.result()).toMatchObject({
            successes: 3,
            stopReason: "successes",
            simulationLimit: input.simulationLimit,
        });
        expect(limited.result().trials).toBeGreaterThan(3);
        const finished = limited.result();
        limited.runTrial();
        expect(limited.result()).toEqual(finished);
    });

    it("stops impossible targets at the maximum trial count", () => {
        const input = project();
        input.target = engine.validateTarget({ groups: [], affixCount: { min: 3, max: 3 } });
        input.iterations = 4;
        input.simulationLimit = { kind: "successes", count: 2 };
        const simulation = new CraftingSimulation(data, input);
        while (!simulation.done) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            trials: 4,
            successes: 0,
            stopReason: "trials",
        });
    });

    it("stops single crafts at the action count without discarding a completed trial", () => {
        const input = project();
        input.simulationLimit = { kind: "actions", count: 5 };
        const simulation = new CraftingSimulation(data, input);
        while (!simulation.done) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            trials: 5,
            totalActions: 5,
            spending: { [currency.id]: 5 },
            stopReason: "actions",
            unfinished: undefined,
        });
    });

    it("retains a partial process separately without turning it into a failed trial", () => {
        const input = project();
        input.useProcess = true;
        input.target = engine.validateTarget({ groups: [], affixCount: { min: 0, max: 0 } });
        input.steps = [
            { id: "first", method, condition: any, onSuccess: "second", onFailure: "failure" },
            { id: "second", method, condition: any, onSuccess: "success", onFailure: "failure" },
        ];
        input.simulationLimit = { kind: "actions", count: 3 };
        const simulation = new CraftingSimulation(data, input);
        while (!simulation.done) simulation.runTrial();
        const result = simulation.result();
        expect(result).toMatchObject({
            trials: 1,
            successes: 1,
            totalActions: 2,
            baseItems: 1,
            baseSpending: 5,
            meanCost: 9,
            costPerSuccess: 9,
            spending: { [currency.id]: 2 },
            timeouts: 0,
            errors: {},
            stopReason: "actions",
            routes: { first: { visits: 1 }, second: { visits: 1 } },
            unfinished: {
                actions: 1,
                steps: 1,
                baseItems: 1,
                nextStep: "second",
                spending: { [currency.id]: 1 },
                timeout: false,
                routes: { first: { visits: 1 } },
            },
        });
        expect(result.unfinished!.item.mods).toHaveLength(1);
        expect(result.samples).toHaveLength(1);
        expect(result.samples[0]!.item.mods).toHaveLength(0);
        expect(result.unfinished!.routes.second).toBeUndefined();
    });

    it("does not run a trailing condition after exhausting the action budget", () => {
        const input = project();
        input.useProcess = true;
        input.steps = [
            { id: "craft", method, condition: any, onSuccess: "check", onFailure: "failure" },
            { id: "check", condition: any, onSuccess: "success", onFailure: "failure" },
        ];
        input.simulationLimit = { kind: "actions", count: 1 };
        const simulation = new CraftingSimulation(data, input);
        simulation.runTrial();
        expect(simulation.done).toBe(true);
        expect(simulation.result()).toMatchObject({
            trials: 0,
            successes: 0,
            totalActions: 0,
            meanCost: null,
            timeouts: 0,
            unfinished: { actions: 1, nextStep: "check" },
        });
    });

    it("counts condition-only loop steps toward the global action limit without spending currency", () => {
        const input = project();
        input.useProcess = true;
        input.steps = [{ id: "check", condition: any, onSuccess: "check", onFailure: "check" }];
        input.maxActions = 3;
        input.iterations = 4;
        input.simulationLimit = { kind: "actions", count: 2 };
        const simulation = new CraftingSimulation(data, input);
        while (!simulation.done) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            trials: 0,
            totalActions: 0,
            totalSteps: 0,
            timeouts: 0,
            stopReason: "actions",
            unfinished: { actions: 0, steps: 2, spending: {} },
        });
    });

    it("counts successful condition-only trials and paid crafts against the same action budget", () => {
        const input = project();
        input.useProcess = true;
        input.target = any;
        input.steps = [
            { id: "check", condition: any, onSuccess: "craft", onFailure: "failure" },
            { id: "craft", method, condition: any, onSuccess: "success", onFailure: "failure" },
        ];
        input.simulationLimit = { kind: "actions", count: 3 };
        const simulation = new CraftingSimulation(data, input);
        while (!simulation.done) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            trials: 1,
            successes: 1,
            totalActions: 1,
            totalSteps: 2,
            spending: { [currency.id]: 1 },
            stopReason: "actions",
            unfinished: { actions: 0, steps: 1, nextStep: "craft", spending: {} },
        });
    });

    it("counts a process timeout as completed when both bounds are reached together", () => {
        const input = project();
        input.useProcess = true;
        input.steps = [
            { id: "craft", method, condition: any, onSuccess: "craft", onFailure: "craft" },
        ];
        input.maxActions = 1;
        input.simulationLimit = { kind: "actions", count: 1 };
        const simulation = new CraftingSimulation(data, input);
        simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            trials: 1,
            totalActions: 1,
            timeouts: 1,
            stopReason: "actions",
            unfinished: undefined,
        });
    });

    it("retains validated limits in projects while accepting legacy projects", () => {
        const legacy = project();
        expect(validateProject(data, legacy).simulationLimit).toBeUndefined();
        for (const kind of ["successes", "actions"] as const) {
            const input = { ...legacy, simulationLimit: { kind, count: 100 } };
            expect(
                validateProject(data, JSON.parse(JSON.stringify(input))).simulationLimit,
            ).toEqual(input.simulationLimit);
            for (const count of [0, -1, 0.5, 1000001, Infinity])
                expect(() =>
                    validateProject(data, { ...input, simulationLimit: { kind, count } }),
                ).toThrow();
        }
    });

    it("honors limits between worker batches and keeps calculation independent", async () => {
        vi.resetModules();
        const scope = {
            onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
            postMessage: vi.fn(),
        };
        vi.stubGlobal("self", scope);
        await import("../app/lib/crafting.worker");
        const input = project();
        input.iterations = 500;
        input.simulationLimit = { kind: "actions", count: 105 };
        await scope.onmessage!({ data: { type: "sample", catalog: data, project: input } });
        expect(
            scope.postMessage.mock.calls.map(([message]) => [message.type, message.result?.trials]),
        ).toEqual([
            ["progress", 100],
            ["done", 105],
        ]);
        scope.postMessage.mockClear();
        await scope.onmessage!({ data: { type: "calculate", catalog: data, project: input } });
        expect(scope.postMessage).toHaveBeenLastCalledWith({
            type: "done",
            result: expect.objectContaining({ kind: "exact", probability: 0.5 }),
        });
        expect(scope.postMessage.mock.calls.at(-1)![0].result.simulationLimit).toBeUndefined();

        scope.postMessage.mockClear();
        const reroll = data.crafting.currencies.find(
            (entry) => entry.action === "transmute_to_rare",
        )!;
        input.item = engine.createItem(base);
        input.method = { kind: "currency", id: reroll.id };
        input.iterations = 3;
        input.simulationLimit = { kind: "actions", count: 1 };
        await scope.onmessage!({ data: { type: "calculate", catalog: data, project: input } });
        expect(scope.postMessage).toHaveBeenLastCalledWith({
            type: "done",
            result: expect.objectContaining({ kind: "sampled", trials: 3, totalActions: 3 }),
        });
        expect(scope.postMessage.mock.calls.at(-1)![0].result.simulationLimit).toBeUndefined();
    });
});
