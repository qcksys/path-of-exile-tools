import { describe, expect, it } from "vite-plus/test";
import {
    CraftingSimulation,
    calculateExact,
    ExactCalculationLimit,
    probabilitySummary,
    validateProject,
    wilsonInterval,
} from "../app/lib/crafting-simulation";
import { craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const item = { ...engine.createItem(baseId), rarity: "rare" as const };
const targetMod = engine.pool(item)[0]!;
const target = engine.validateTarget({ groups: [{ mods: [targetMod.id] }] });
const project = () =>
    craftingProjectSchema.parse({
        format: 1,
        game: catalog.game,
        patch: catalog.patch,
        item,
        target,
        method: currency("add_mod_to_rare"),
        steps: [],
        prices: {},
        seed: 17,
        iterations: 100,
        maxActions: 10,
    });

describe("crafting calculator", () => {
    it("exactly calculates a slam against the complete eligible weighted pool", () => {
        const result = calculateExact(engine, item, currency("add_mod_to_rare"), target);
        const total = engine.pool(item).reduce((sum, entry) => sum + entry.weight, 0);
        expect(result.probability).toBeCloseTo(targetMod.weight / total, 12);
        expect(result.states).toBeGreaterThan(1);
    });
    it("stops exact enumeration at its limit without truncating probability mass", () => {
        expect(() => calculateExact(engine, item, currency("reroll"), target, 10)).toThrow(
            ExactCalculationLimit,
        );
    });
    it("handles zero and certain success without Infinity in results", () => {
        expect(probabilitySummary(0)).toEqual({ attempts: null, attempts95: null });
        expect(probabilitySummary(1)).toEqual({ attempts: 1, attempts95: 1 });
        expect(probabilitySummary(0.5)).toEqual({ attempts: 2, attempts95: 5 });
        expect(wilsonInterval(0, 100)[1]).toBeGreaterThan(0);
        expect(wilsonInterval(100, 100)[0]).toBeLessThan(1);
    });
});

describe("crafting process simulator", () => {
    it("is reproducible, resets each trial, and tracks every currency spent", () => {
        const a = new CraftingSimulation(catalog, project());
        const b = new CraftingSimulation(catalog, project());
        for (let i = 0; i < 100; i++) {
            a.runTrial();
            b.runTrial();
        }
        expect(a.result()).toEqual(b.result());
        expect(a.result().trials).toBe(100);
        expect(a.result().spending).toEqual({
            [currency("add_mod_to_rare").kind === "currency"
                ? catalog.crafting.currencies.find((entry) => entry.action === "add_mod_to_rare")!
                      .id
                : ""]: 100,
        });
        expect(a.result().samples.every((sample) => sample.item.mods.length === 1)).toBe(true);
        expect(a.result().meanCost).toBeNull();
    });
    it("supports conditional retries, enforces an action bound and counts timeouts as failures", () => {
        const input = project();
        input.steps = [
            {
                id: "reroll",
                method: currency("reroll"),
                condition: target,
                onSuccess: "reroll",
                onFailure: "reroll",
            },
        ];
        input.maxActions = 3;
        const simulation = new CraftingSimulation(catalog, input, true);
        simulation.runTrial();
        expect(simulation.result().timeouts).toBe(1);
        expect(simulation.result().totalActions).toBe(3);
        expect(simulation.result().successes).toBe(0);
    });
    it("runs multiple steps, counts missing-target terminals as failures and computes costs", () => {
        const input = project();
        const any = engine.validateTarget({ groups: [] });
        input.target = any;
        input.steps = [
            {
                id: "first",
                method: currency("add_mod_to_rare"),
                condition: any,
                onSuccess: "second",
                onFailure: "failure",
            },
            {
                id: "second",
                method: currency("add_mod_to_rare"),
                condition: any,
                onSuccess: "success",
                onFailure: "failure",
            },
        ];
        input.prices[engine.costs(input.method)[0]!.id] = 2;
        const simulation = new CraftingSimulation(catalog, input, true);
        simulation.runTrial();
        expect(simulation.result().successes).toBe(1);
        expect(simulation.result().meanCost).toBe(4);
        expect(simulation.result().costPerSuccess).toBe(4);
        expect(simulation.result().samples[0]!.item.mods).toHaveLength(2);
    });
    it("rejects mismatched build imports and broken process routes", () => {
        expect(() => validateProject(catalog, { ...project(), patch: "old" })).toThrow(
            "different game or client build",
        );
        expect(() =>
            validateProject(catalog, {
                ...project(),
                steps: [
                    {
                        id: "one",
                        method: currency("reroll"),
                        condition: target,
                        onSuccess: "missing",
                        onFailure: "failure",
                    },
                ],
            }),
        ).toThrow("Unknown step");
    });

    it("validates every imported method without requiring its starting rarity to match", () => {
        const input = project();
        expect(() =>
            validateProject(catalog, { ...input, method: { kind: "currency", id: "missing" } }),
        ).toThrow("not supported");
        input.steps = [
            {
                id: "next",
                method: currency("transmute_to_magic"),
                condition: target,
                onSuccess: "success",
                onFailure: "failure",
            },
        ];
        expect(() => validateProject(catalog, input)).not.toThrow();
        input.steps[0]!.method = { kind: "essence", id: "missing" };
        expect(() => validateProject(catalog, input)).toThrow("Unknown essence");
    });
});
