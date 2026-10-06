import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import {
    connectProcessSteps,
    processBranches,
    processStepId,
    removeProcessStep,
    withProcessBranches,
} from "../app/lib/crafting-flow";
import { craftingBranchCount } from "../app/lib/crafting-routes";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

describe.each(["poe1", "poe2"] as const)("%s ordered process routes", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && !entry.implicits.length,
    )![0];
    const currency = (action: string) => ({
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    });
    const annul = currency("remove_random_mod");
    const divine = currency("reroll_mod_values");
    const item = engine.addStartingMod(
        engine.addStartingMod(engine.createItem(base), "IncreasedLife1", seededRandom(1)),
        "ColdResist1",
        seededRandom(1),
    );
    const always = engine.validateTarget({ groups: [] });
    const life = engine.validateTarget({ groups: [{ mods: ["IncreasedLife1"] }] });
    const cold = engine.validateTarget({ groups: [{ mods: ["ColdResist1"] }] });
    const project = () =>
        craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            method: annul,
            target: always,
            useProcess: true,
            prices: { [annul.id]: 2, [divine.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 4,
            steps: [
                {
                    id: "roll",
                    method: annul,
                    condition: life,
                    onSuccess: "success",
                    onFailure: "failure",
                    branches: [
                        { id: "life", condition: life, destination: "success" },
                        { id: "cold", condition: cold, destination: "value" },
                    ],
                },
                { id: "value", method: divine, condition: always },
            ],
        });

    it("uses only the first matching route and retains stable IDs after priority changes", () => {
        const input = project();
        input.steps = [
            {
                ...input.steps[0]!,
                method: undefined,
                branches: [
                    { id: "first", condition: always, destination: "failure" },
                    { id: "second", condition: always, destination: "success" },
                ],
            },
        ];
        expect(calculateProcessExact(engine, input)).toMatchObject({
            probability: 0,
            totalActions: 0,
            routes: { roll: { visits: 1, passed: 1, branches: { first: 1 } } },
        });
        input.steps[0] = withProcessBranches(
            input.steps[0]!,
            [...input.steps[0]!.branches!].reverse(),
        );
        expect(calculateProcessExact(engine, input)).toMatchObject({
            probability: 1,
            routes: { roll: { branches: { second: 1 } } },
        });
        expect(validateProject(catalog, JSON.parse(JSON.stringify(input)))).toEqual(input);
    });

    it("weights independently conditioned routes and downstream costs consistently in exact, sampled and manual runs", () => {
        const input = project();
        const before = structuredClone(input);
        const exact = calculateProcessExact(engine, input);
        expect(exact).toMatchObject({
            probability: 1,
            meanCost: 3.5,
            totalActions: 1.5,
            spending: { [annul.id]: 1, [divine.id]: 0.5 },
            routes: { roll: { branches: { life: 0.5, cold: 0.5 }, passed: 1, failed: 0 } },
        });
        const simulation = new CraftingSimulation(catalog, input);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        const sampled = simulation.result();
        expect(sampled).toMatchObject({ successes: 1000, errors: {} });
        expect(sampled.meanCost).toBeGreaterThan(3.3);
        expect(sampled.meanCost).toBeLessThan(3.7);
        expect(
            craftingBranchCount(sampled.routes!.roll, "life") +
                craftingBranchCount(sampled.routes!.roll, "cold"),
        ).toBe(1000);
        const process = new CraftingProcess(engine, input, seededRandom(42));
        process.advance();
        const partial = process.result();
        const second = partial.nextStep === "value";
        while (!process.done) process.advance();
        expect(process.result()).toMatchObject({ success: true, actions: second ? 2 : 1 });
        expect(process.result().spending[divine.id] ?? 0).toBe(second ? 1 : 0);
        const sameSeed = new CraftingSimulation(catalog, input);
        sameSeed.runTrial();
        expect(sameSeed.result().routes).toEqual(process.result().routes);
        const snapshot = process.result();
        const selected = Object.keys(snapshot.routes.roll!.branches!)[0]!;
        snapshot.routes.roll!.branches![selected] = 999;
        expect(craftingBranchCount(process.result().routes.roll, selected)).toBe(1);
        expect(input).toEqual(before);
    });

    it("enumerates numeric values needed only by a later route, including nested and negated conditions", () => {
        const input = project();
        input.item = { ...item, mods: [item.mods[0]!] };
        const stat = engine.mod("IncreasedLife1").stats[0]!;
        const threshold = Math.floor((stat.min + stat.max) / 2);
        const values = engine.validateTarget({
            groups: [],
            expression: {
                operator: "and",
                operands: [
                    { groups: [], stats: [{ id: stat.id, min: threshold + 1, scope: "explicit" }] },
                    { groups: [{ mods: ["ColdResist1"], negated: true }] },
                ],
            },
        });
        input.steps = [
            {
                ...input.steps[0]!,
                method: divine,
                branches: [
                    { id: "unreachable", condition: cold, destination: "success" },
                    { id: "high", condition: values, destination: "success" },
                ],
            },
        ];
        const expected = (stat.max - threshold) / (stat.max - stat.min + 1);
        const result = calculateProcessExact(engine, input);
        expect(result.probability).toBeCloseTo(expected);
        expect(craftingBranchCount(result.routes!.roll, "high")).toBeCloseTo(expected);
        expect(result.routes!.roll!.failed).toBeCloseTo(1 - expected);
        expect(result.meanCost).toBeCloseTo(3);
        expect(craftingBranchCount(result.routes!.roll, "unreachable")).toBe(0);
    });

    it("uses the fallback when no route matches and bounds restart and ordinary loops", () => {
        const input = project();
        const impossible = engine.validateTarget({ groups: [], rarity: "normal" });
        input.baseCost = 5;
        input.maxActions = 3;
        input.steps = [
            {
                ...input.steps[0]!,
                method: undefined,
                onFailure: "restart",
                branches: [{ id: "impossible", condition: impossible, destination: "success" }],
            },
        ];
        expect(calculateProcessExact(engine, input)).toMatchObject({
            probability: 0,
            timeouts: 1,
            baseItems: 3,
            meanCost: 15,
            routes: { roll: { visits: 3, failed: 3 } },
        });
        input.steps[0]!.onFailure = "roll";
        expect(calculateProcessExact(engine, input)).toMatchObject({
            timeouts: 1,
            baseItems: 1,
            meanCost: 5,
        });
        input.steps[0] = { ...withProcessBranches(input.steps[0]!, []), onFailure: "success" };
        expect(calculateProcessExact(engine, input)).toMatchObject({
            probability: 1,
            totalActions: 0,
            routes: { roll: { visits: 1, failed: 1 } },
        });
        input.steps[0]!.branches = [{ id: "retry", condition: always, destination: "restart" }];
        expect(calculateProcessExact(engine, input)).toMatchObject({
            timeouts: 1,
            baseItems: 3,
            meanCost: 15,
            routes: { roll: { visits: 3, passed: 3, failed: 0, branches: { retry: 3 } } },
        });
    });

    it("keeps legacy pass/fail saves unchanged and rejects invalid advanced routes", () => {
        const input = project();
        for (const step of input.steps) delete step.branches;
        expect(validateProject(catalog, JSON.parse(JSON.stringify(input)))).toEqual(input);
        expect(calculateProcessExact(engine, input).probability).toBe(0.5);
        for (const branches of [
            [{ id: "x", condition: always, destination: "missing" }],
            [{ id: "fail", condition: always, destination: "success" }],
            [{ id: "x", condition: { groups: [{ mods: ["missing"] }] }, destination: "success" }],
            [0, 1].map(() => ({ id: "same", condition: always, destination: "success" })),
            Array.from({ length: 13 }, (_, index) => ({
                id: String(index),
                condition: always,
                destination: "success",
            })),
        ])
            expect(() =>
                validateProject(catalog, { ...input, steps: [{ ...input.steps[0], branches }] }),
            ).toThrow();
    });

    it("connects any route, redirects deleted destinations and safely counts arbitrary imported route IDs", () => {
        const input = project();
        const linked = connectProcessSteps(input.steps, {
            source: processStepId("roll"),
            sourceHandle: "cold",
            target: "restart",
            targetHandle: "in",
        });
        expect(linked[0]!.branches![1]!.destination).toBe("restart");
        expect(linked[0]!.branches![0]).toEqual(input.steps[0]!.branches![0]);
        const deleted = removeProcessStep(input.steps, "value");
        expect(deleted[0]!.branches![1]!.destination).toBe("failure");
        expect(validateProject(catalog, { ...input, steps: deleted }).steps).toEqual(deleted);
        input.steps = [
            {
                ...input.steps[0]!,
                method: undefined,
                branches: [{ id: "__proto__", condition: always, destination: "success" }],
            },
        ];
        const result = calculateProcessExact(engine, input);
        expect(craftingBranchCount(result.routes!.roll, "__proto__")).toBe(1);
        expect(craftingBranchCount(result.routes!.roll, "constructor")).toBe(0);
        expect(processBranches(input.steps[0]!)).toEqual(input.steps[0]!.branches);
    });
});
