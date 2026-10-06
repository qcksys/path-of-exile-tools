import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    ExactCalculationLimit,
    validateProject,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

afterEach(() => vi.unstubAllGlobals());

describe.each(["poe1", "poe2"] as const)("%s stat value conditions", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const life = "base_maximum_life";
    const range = catalog.mods.IncreasedLife1!.stats[0]!;
    const count = range.max - range.min + 1;
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Body Armour" && !base.implicits.length,
    )![0];
    const normal = engine.createItem(baseId);
    const item = engine.addStartingMod(normal, "IncreasedLife1", seededRandom(42));
    const divine = {
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === "reroll_mod_values")!.id,
    };
    const target = (stats: unknown[], rest: object = {}) =>
        engine.validateTarget({ groups: [], stats, ...rest });
    const perfect = target([{ id: life, min: range.max }]);
    function project() {
        return craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            method: divine,
            target: { groups: [] },
            steps: [
                {
                    id: "divine",
                    method: divine,
                    condition: perfect,
                    onSuccess: "success",
                    onFailure: "divine",
                },
            ],
            useProcess: true,
            prices: { [divine.id]: 2 },
            seed: 42,
            iterations: 4000,
            maxActions: 2,
        });
    }

    it("matches inclusive bounds, treats missing stats as zero, and keeps conditions conjunctive", () => {
        const value = item.mods[0]!.values[0]!;
        expect(engine.matches(item, target([{ id: life, min: value, max: value }]))).toBe(true);
        expect(engine.matches(item, target([{ id: life, min: value + 1 }]))).toBe(false);
        expect(engine.matches(item, target([{ id: life, max: value - 1 }]))).toBe(false);
        expect(engine.matches(normal, target([{ id: life, min: 0, max: 0 }]))).toBe(true);
        expect(engine.matches(normal, target([{ id: life, min: 1 }]))).toBe(false);
        expect(engine.matches(item, target([{ id: life, min: value }], { rarity: "normal" }))).toBe(
            false,
        );
        expect(
            engine.matches(
                item,
                target([{ id: life, min: value }], { groups: [{ mods: ["ColdResist1"] }] }),
            ),
        ).toBe(false);
        expect(
            engine.matches(
                item,
                target([
                    { id: life, min: value },
                    { id: "base_cold_damage_resistance_%", min: 1 },
                ]),
            ),
        ).toBe(false);
    });

    it("adds explicit and implicit values after catalyst effects without changing raw rolls", () => {
        const ring = Object.entries(catalog.bases).find(
            ([, base]) =>
                ["Ring", "Amulet"].includes(base.item_class) &&
                base.implicits.some((id) =>
                    catalog.mods[id]!.stats.some((stat) => stat.id === life),
                ),
        )![0];
        const catalyst = catalog.crafting.catalysts.find((entry) =>
            entry.tags.includes(game === "poe1" ? "resource" : "life"),
        )!;
        const withLife = engine.addStartingMod(
            engine.createItem(ring),
            "IncreasedLife1",
            seededRandom(1),
        );
        withLife.mods[0]!.values = [15];
        const implicit = withLife.implicits.find((entry) =>
            catalog.mods[entry.id]!.stats.some((stat) => stat.id === life),
        )!;
        const index = catalog.mods[implicit.id]!.stats.findIndex((stat) => stat.id === life);
        const implicitValue = implicit.values[index]!;
        const input = engine.validateItem({
            ...withLife,
            catalyst: { id: catalyst.id, quality: 20 },
        });
        const implicitTotal = Math.trunc((implicitValue * 120) / 100);
        expect(engine.statTotals(input, "explicit").get(life)).toBe(18);
        expect(engine.statTotals(input, "implicit").get(life)).toBe(implicitTotal);
        expect(engine.statTotals(input).get(life)).toBe(18 + implicitTotal);
        expect(
            engine.matches(input, target([{ id: life, scope: "explicit", min: 18, max: 18 }])),
        ).toBe(true);
        expect(
            engine.matches(
                input,
                target([{ id: life, scope: "implicit", min: implicitTotal, max: implicitTotal }]),
            ),
        ).toBe(true);
        expect(
            engine.matches(
                input,
                target([{ id: life, min: 18 + implicitTotal, max: 18 + implicitTotal }]),
            ),
        ).toBe(true);
        expect(input.mods[0]!.values).toEqual([15]);
        expect(input.implicits).toEqual(withLife.implicits);
    });

    it("rejects invalid bounds, duplicate stats and IDs absent from the extracted catalog", () => {
        for (const stats of [
            [{ id: "missing", min: 1 }],
            [{ id: life }],
            [{ id: life, min: 2, max: 1 }],
            [{ id: life, min: Number.NaN }],
            [{ id: life, min: Number.POSITIVE_INFINITY }],
            [{ id: life, min: 1.5 }],
            [{ id: life, min: 1, scope: "missing" }],
            [
                { id: life, min: 1 },
                { id: life, max: 2 },
            ],
        ])
            expect(() => target(stats)).toThrow();
        expect(target([{ id: life, min: -5, max: 0 }]).stats![0]).toMatchObject({
            min: -5,
            max: 0,
            scope: "all",
        });
        const input = project();
        const saved = validateProject(catalog, JSON.parse(JSON.stringify(input)));
        expect(saved.steps[0]!.condition.stats).toEqual(perfect.stats);
        input.steps[0]!.condition.stats![0]!.id = "missing";
        expect(() => validateProject(catalog, input)).toThrow("Unknown target stat");
    });

    it("adds the same stat from a hybrid modifier and an ordinary modifier", () => {
        const rare = { ...item, rarity: "rare" as const };
        const hybrid = engine
            .pool(rare)
            .find(
                (entry) =>
                    entry.mod.stats.length > 1 && entry.mod.stats.some((stat) => stat.id === life),
            )!;
        expect(hybrid).toBeDefined();
        const result = engine.addStartingMod(rare, hybrid.id, seededRandom(1));
        const index = hybrid.mod.stats.findIndex((stat) => stat.id === life);
        const total = result.mods[0]!.values[0]! + result.mods[1]!.values[index]!;
        expect(engine.statTotals(result, "explicit").get(life)).toBe(total);
        expect(engine.matches(result, target([{ id: life, min: total, max: total }]))).toBe(true);
    });

    if (game === "poe1") {
        it("uses extracted implicit magnitude bonuses in stat totals", () => {
            const simplex = Object.entries(catalog.bases).find(
                ([, base]) => base.name === "Simplex Amulet",
            )![0];
            const input = engine.addStartingMod(
                { ...engine.createItem(simplex), rarity: "rare" },
                "IncreasedLife1",
                seededRandom(1),
            );
            input.mods[0]!.values = [15];
            expect(engine.statTotals(input).get(life)).toBe(30);
            expect(engine.matches(input, target([{ id: life, min: 30, max: 30 }]))).toBe(true);
            expect(input.mods[0]!.values).toEqual([15]);
        });
    }

    it("enumerates value rolls for exact odds instead of substituting the tier midpoint", () => {
        expect(calculateExact(engine, item, divine, perfect).probability).toBeCloseTo(
            1 / count,
            12,
        );
        expect(
            calculateExact(
                engine,
                item,
                divine,
                target([{ id: life, min: range.max - 1, max: range.max }]),
            ).probability,
        ).toBeCloseTo(2 / count, 12);
        expect(
            calculateExact(engine, item, divine, target([{ id: life, min: range.max + 1 }]))
                .probability,
        ).toBe(0);
        expect(
            calculateExact(
                engine,
                item,
                divine,
                engine.validateTarget({ groups: [{ mods: ["IncreasedLife1"] }] }),
            ),
        ).toEqual({ probability: 1, states: 1 });
        expect(() => calculateExact(engine, item, divine, perfect, 2)).toThrow(
            ExactCalculationLimit,
        );
    });

    it("uses step-only stat conditions for exact routing, retry costs and sampled outcomes", () => {
        const input = project();
        const exact = calculateProcessExact(engine, input);
        const probability = 1 / count;
        expect(exact.probability).toBeCloseTo(1 - (1 - probability) ** 2, 12);
        expect(exact.timeouts).toBeCloseTo((1 - probability) ** 2, 12);
        expect(exact.totalActions).toBeCloseTo(2 - probability, 12);
        expect(exact.meanCost).toBeCloseTo(2 * (2 - probability), 12);
        const simulation = new CraftingSimulation(catalog, input);
        for (let trial = 0; trial < input.iterations; trial++) simulation.runTrial();
        expect(Math.abs(simulation.result().probability - exact.probability)).toBeLessThan(0.025);
        for (const sample of simulation.result().samples)
            expect(sample.success).toBe(engine.matches(sample.item, perfect));
        const process = new CraftingProcess(engine, input, seededRandom(input.seed));
        while (!process.done) process.advance();
        expect(process.result().success).toBe(engine.matches(process.item, perfect));
        expect(process.item).toEqual(simulation.result().samples[0]!.item);
        expect(process.spending[divine.id]).toBe(process.actions);
    });

    it("calculates stat-only targets in the worker and falls back to sampling on large rolls", async () => {
        vi.resetModules();
        const scope = {
            onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
            postMessage: vi.fn(),
        };
        vi.stubGlobal("self", scope);
        await import("../app/lib/crafting.worker");
        const input = { ...project(), target: perfect, useProcess: false };
        await scope.onmessage!({ data: { type: "calculate", catalog, project: input } });
        const message = scope.postMessage.mock.lastCall![0];
        expect(message.type).toBe("done");
        expect(message.result.kind).toBe("exact");
        expect(message.result.probability).toBeCloseTo(1 / count, 12);
        scope.postMessage.mockClear();
        input.item = normal;
        input.method = {
            kind: "currency",
            id: catalog.crafting.currencies.find((entry) => entry.action === "transmute_to_rare")!
                .id,
        };
        input.iterations = 3;
        await scope.onmessage!({ data: { type: "calculate", catalog, project: input } });
        expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
            type: "done",
            result: { kind: "sampled", trials: 3, errors: {} },
        });
    });
});
