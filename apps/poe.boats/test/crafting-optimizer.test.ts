import { expect, it, vi } from "vite-plus/test";
import { allflameBracket, allflameQuote } from "../app/lib/crafting-allflame";
import {
    type FossilOptimization,
    FossilOptimizer,
    fossilCombinations,
    fossilOptimizerSchema,
    mergeFossilOptimizations,
} from "../app/lib/crafting-optimizer";
import { hasCraftingRequirements } from "../app/lib/crafting-simulation";
import {
    type CraftingTarget,
    craftingProjectSchema,
    craftingTargetSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

it("accepts stat-only and other item targets consistently, including zero-valued bounds", () => {
    expect(hasCraftingRequirements(craftingTargetSchema.parse({ groups: [] }))).toBe(false);
    expect(
        hasCraftingRequirements(
            craftingTargetSchema.parse({
                groups: [],
                stats: [],
                influences: [],
                anointments: [],
                enchantments: [],
                grantedPassives: [],
            }),
        ),
    ).toBe(false);
    const conditions: Partial<CraftingTarget>[] = [
        { groups: [{ mods: ["IncreasedLife1"], minimum: 1 }] },
        { stats: [{ id: "base_maximum_life", min: 175, scope: "all" }] },
        { openPrefixes: 1 },
        { openSuffixes: 1 },
        { openAffixes: 1 },
        { rarity: "normal" },
        { quality: { min: 0, max: 0 } },
        { catalyst: { min: 0, max: 0 } },
        { memoryStrands: { min: 0, max: 0 } },
        { intangibility: { min: 0, max: 0 } },
        { influences: [0] },
        { affixCount: { min: 0, max: 0 } },
        { prefixCount: { min: 0, max: 0 } },
        { suffixCount: { min: 0, max: 0 } },
        { unrevealedCount: { min: 0, max: 0 } },
        { anointments: ["test"] },
        { enchantments: ["test"] },
        { grantedPassives: ["test"] },
    ];
    for (const condition of conditions)
        expect(
            hasCraftingRequirements(craftingTargetSchema.parse({ groups: [], ...condition })),
        ).toBe(true);
});

it("enumerates unique combinations up to the chosen socket count", () => {
    expect(fossilCombinations(["a", "b", "c"], 2)).toEqual([
        ["a"],
        ["a", "b"],
        ["a", "c"],
        ["b"],
        ["b", "c"],
        ["c"],
    ]);
});

it.each([
    false,
    true,
])("preserves seeded candidates and rankings across partitions (Allflame: %s)", (allflame) => {
    const item = engine.createItem(baseId);
    const fossils = engine
        .availableFossils(item)
        .filter((entry) =>
            ["Scorched Fossil", "Frigid Fossil", "Pristine Fossil", "Tangled Fossil"].includes(
                entry.name,
            ),
        );
    const options = {
        fossils: fossils.map((entry) => entry.id),
        maxSockets: 2,
        trials: 100,
        logic: "additive" as const,
        allflame: allflame ? (true as const) : undefined,
        tangled: fossils.find((entry) => entry.randomOutcomes.length)!.randomOutcomes[0],
    };
    const target = engine.validateTarget({
        groups: [
            {
                mods: engine
                    .pool({ ...item, rarity: "rare" })
                    .filter((entry) => entry.mod.implicit_tags.includes("cold"))
                    .map((entry) => entry.id),
            },
        ],
    });
    const prices = Object.fromEntries(
        [...fossils, ...catalog.crafting.currencies].map((entry) => [entry.id, 1]),
    );
    const run = (partition?: { index: number; count: number }) => {
        const optimizer = new FossilOptimizer(engine, item, target, prices, 37, {
            ...options,
            partition,
        });
        while (!optimizer.runBatch(79)) {}
        return optimizer.result();
    };
    const single = run();
    const parts = [2, 0, 1].map((index) => run({ index, count: 3 }));
    expect(parts.map((result) => result.total)).toEqual([3, 4, 3]);
    expect(
        new Set(parts.flatMap((result) => result.byAttempts.map((entry) => entry.index))).size,
    ).toBe(10);
    const before = structuredClone(parts);
    expect(mergeFossilOptimizations(parts)).toEqual(single);
    expect(parts).toEqual(before);
    expect(single.failed).toBe(0);
});

it("retains the global top twenty with deterministic ties and unpriced combinations", () => {
    const item = engine.createItem(baseId);
    const fossils = engine
        .availableFossils(item)
        .filter((entry) =>
            [
                "Scorched Fossil",
                "Frigid Fossil",
                "Pristine Fossil",
                "Metallic Fossil",
                "Dense Fossil",
                "Jagged Fossil",
            ].includes(entry.name),
        );
    const target = engine.validateTarget({ groups: [], rarity: "rare" });
    const options = {
        fossils: fossils.map((entry) => entry.id),
        maxSockets: 2,
        trials: 100,
        logic: "multiplicative" as const,
    };
    const prices = Object.fromEntries(catalog.crafting.currencies.map((entry) => [entry.id, 1]));
    for (const fossil of fossils.slice(0, 4)) prices[fossil.id] = 1;
    for (const fossil of fossils.slice(4)) delete prices[fossil.id];
    const run = (partition?: { index: number; count: number }) => {
        const optimizer = new FossilOptimizer(engine, item, target, prices, 42, {
            ...options,
            partition,
        });
        while (!optimizer.runBatch(100)) {}
        return optimizer.result();
    };
    const single = run();
    expect(single.total).toBe(21);
    expect(single.byAttempts).toHaveLength(20);
    expect(single.byCost.length).toBeGreaterThan(0);
    expect(single.byCost.length).toBeLessThan(20);
    expect(single.byAttempts.some((entry) => entry.cost === null)).toBe(true);
    expect(mergeFossilOptimizations([3, 1, 0, 2].map((index) => run({ index, count: 4 })))).toEqual(
        single,
    );
});

it("validates partitions and handles workers with no assigned combinations", () => {
    const item = engine.createItem(baseId);
    const options = {
        fossils: [engine.availableFossils(item)[0]!.id],
        maxSockets: 1,
        trials: 100,
        logic: "additive" as const,
    };
    for (const partition of [
        { index: -1, count: 2 },
        { index: 2, count: 2 },
        { index: 0, count: 0 },
        { index: 0, count: 9 },
        { index: 0.5, count: 2 },
    ]) {
        expect(fossilOptimizerSchema.safeParse({ ...options, partition }).success).toBe(false);
    }
    const optimizer = new FossilOptimizer(
        engine,
        item,
        engine.validateTarget({ groups: [] }),
        {},
        42,
        { ...options, partition: { index: 1, count: 2 } },
    );
    expect(optimizer.runBatch()).toBe(true);
    expect(optimizer.result()).toEqual(mergeFossilOptimizations([]));
});

it("executes validated partitions through the worker and cancels an unfinished partition", async () => {
    vi.resetModules();
    const scope = {
        onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
        postMessage:
            vi.fn<
                (message: { type: string; result?: FossilOptimization; message?: string }) => void
            >(),
    };
    vi.stubGlobal("self", scope);
    try {
        await import("../app/lib/crafting.worker");
        const item = engine.createItem(baseId);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: currency("transmute_to_rare"),
            target: { groups: [], rarity: "rare" },
            steps: [],
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 1,
        });
        const options = {
            fossils: engine
                .availableFossils(item)
                .filter((entry) =>
                    ["Pristine Fossil", "Frigid Fossil", "Scorched Fossil"].includes(entry.name),
                )
                .map((entry) => entry.id),
            maxSockets: 2,
            trials: 100,
            logic: "additive" as const,
            partition: { index: 1, count: 2 },
        };
        const data = { type: "optimize", catalog, project, options };
        await scope.onmessage!({ data });
        const output = scope.postMessage.mock.lastCall![0];
        expect(output.type).toBe("done");
        expect(output.result).toMatchObject({ completed: 3, total: 3, failed: 0 });
        expect(output.result!.byAttempts.map((entry) => entry.index).sort()).toEqual([1, 3, 5]);
        const direct = new FossilOptimizer(engine, item, project.target, {}, 42, options);
        direct.runBatch(300);
        expect(output.result).toEqual(direct.result());
        scope.postMessage.mockClear();
        const running = scope.onmessage!({ data });
        await scope.onmessage!({ data: { type: "cancel" } });
        await running;
        expect(scope.postMessage).toHaveBeenCalledOnce();
        expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
            type: "progress",
            result: { completed: 1, total: 3 },
        });
        await scope.onmessage!({
            data: { ...data, options: { ...options, partition: { index: 2, count: 2 } } },
        });
        expect(scope.postMessage.mock.lastCall![0]).toMatchObject({ type: "error" });
    } finally {
        vi.unstubAllGlobals();
    }
});

it("ranks extracted fossil combinations by attempts and fully priced cost", () => {
    const item = engine.createItem(baseId);
    const fossils = engine
        .availableFossils(item)
        .filter((entry) => ["Scorched Fossil", "Frigid Fossil"].includes(entry.name));
    const cold = engine
        .pool({ ...item, rarity: "rare" })
        .filter((entry) => entry.mod.implicit_tags.includes("cold"));
    const target = engine.validateTarget({ groups: [{ mods: cold.map((entry) => entry.id) }] });
    const options = {
        fossils: fossils.map((entry) => entry.id),
        maxSockets: 1,
        trials: 100,
        logic: "additive" as const,
    };
    const prices = Object.fromEntries(
        [...fossils, ...catalog.crafting.currencies].map((entry) => [entry.id, 1]),
    );
    const run = () => {
        const optimizer = new FossilOptimizer(engine, item, target, prices, 37, options);
        while (!optimizer.runBatch(30)) {
            /* finish each bounded batch */
        }
        return optimizer.result();
    };
    const result = run();
    expect(result).toEqual(run());
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
    const first = result.byAttempts[0]!;
    expect(engine.methodName(first.method)).toBe("Frigid Fossil");
    expect(first.successes).toBeGreaterThan(0);
    expect(first.cost).toBe(2);
    expect(result.byCost[0]!.costPerSuccess).toBeCloseTo(2 / first.probability);
    expect(result.byAttempts[1]!.probability).toBe(0);
    expect(result.byAttempts[1]!.interval[1]).toBeGreaterThan(0);
    const excluded = new FossilOptimizer(
        engine,
        item,
        {
            ...target,
            groups: target.groups.map((group) => ({ ...group, negated: true })),
        },
        prices,
        37,
        options,
    );
    excluded.runBatch(200);
    const exclusions = excluded.result();
    const nested = new FossilOptimizer(
        engine,
        item,
        engine.validateTarget({
            groups: [],
            expression: { operator: "and", operands: [target], negated: true },
        }),
        prices,
        37,
        options,
    );
    nested.runBatch(200);
    expect(nested.result()).toEqual(exclusions);
    expect(engine.methodName(exclusions.byAttempts[0]!.method)).toBe("Scorched Fossil");
    expect(exclusions.byAttempts[0]!.probability).toBe(1);
    for (const row of result.byAttempts) {
        const opposite = exclusions.byAttempts.find(
            (entry) => engine.methodName(entry.method) === engine.methodName(row.method),
        )!;
        expect(row.successes + opposite.successes).toBe(options.trials);
    }
    const unpriced = new FossilOptimizer(engine, item, target, {}, 37, options);
    unpriced.runBatch(200);
    expect(unpriced.result().byCost).toEqual([]);
});

it("rejects invalid fossils and excludes failed combinations from rankings", () => {
    const item = engine.createItem(baseId);
    const options = {
        fossils: ["missing"],
        maxSockets: 1,
        trials: 100,
        logic: "additive" as const,
    };
    const target = engine.validateTarget({ groups: [] });
    expect(() => new FossilOptimizer(engine, item, target, {}, 0, options)).toThrow(
        "cannot be used",
    );
    const fossil = engine.availableFossils(item)[0]!;
    expect(
        () =>
            new FossilOptimizer(engine, item, target, {}, 0, {
                ...options,
                fossils: [fossil.id, fossil.id],
            }),
    ).toThrow("once");
    const prefixLock = catalog.crafting.bench.find(
        (entry) =>
            entry.mod &&
            engine
                .mod(entry.mod)
                .stats.some((stat) => stat.id === "item_generation_cannot_change_prefixes"),
    )!;
    const locked = engine.apply(
        { ...item, rarity: "rare" },
        { kind: "bench", id: prefixLock.id },
        { pick: (choices) => choices[0]!.value, integer: (min) => min },
    ).item;
    const optimizer = new FossilOptimizer(engine, locked, target, {}, 0, {
        ...options,
        fossils: [fossil.id],
    });
    expect(optimizer.runBatch()).toBe(true);
    expect(optimizer.result()).toMatchObject({
        completed: 1,
        failed: 1,
        byAttempts: [],
        byCost: [],
    });
    expect(optimizer.result().errors[0]).toContain("metamods");
    const fossils = engine
        .availableFossils(item)
        .slice(0, 3)
        .map((entry) => entry.id);
    const run = (partition?: { index: number; count: number }) => {
        const runner = new FossilOptimizer(engine, locked, target, {}, 0, {
            ...options,
            fossils,
            partition,
        });
        expect(runner.runBatch()).toBe(true);
        return runner.result();
    };
    const failed = mergeFossilOptimizations([
        run({ index: 0, count: 2 }),
        run({ index: 1, count: 2 }),
    ]);
    expect(failed).toEqual(run());
    expect(failed).toMatchObject({ completed: 3, total: 3, failed: 3, byAttempts: [], byCost: [] });
    expect(failed.errors).toHaveLength(1);
});

it.each([
    "normal",
    "rare",
] as const)("ranks Allflame fossils on %s items using eligible resonators, target selection and full sulphur costs", (rarity) => {
    const item = { ...engine.createItem(baseId, 86), rarity };
    const fossil = engine.availableFossils(item).find((entry) => entry.name === "Pristine Fossil")!;
    const options = {
        fossils: [fossil.id],
        maxSockets: 1,
        trials: 200,
        logic: "additive" as const,
        allflame: true as const,
    };
    const prices = Object.fromEntries(
        [...catalog.crafting.currencies, fossil].map((entry) => [entry.id, 1]),
    );
    const sulphur = catalog.crafting.allflame!.sulphur;
    prices[sulphur] = 0.01;
    const setup = new FossilOptimizer(
        engine,
        item,
        engine.validateTarget({ groups: [] }),
        prices,
        7,
        options,
    );
    const craft = setup.methods[0]!;
    const bracket = allflameBracket(catalog, craft)!;
    const target = engine.validateTarget({
        groups: [],
        intangibility: { min: bracket.intangibility.max, max: 100 },
    });
    const run = (start = item, costs = prices) => {
        const optimizer = new FossilOptimizer(engine, start, target, costs, 7, options);
        while (!optimizer.runBatch(50)) {
            /* finish each bounded batch */
        }
        expect(optimizer.result().failed).toBe(0);
        return optimizer.result();
    };
    const result = run();
    const candidate = result.byAttempts[0]!;
    const singleProbability = 1 / (bracket.intangibility.max - bracket.intangibility.min + 1);
    const expectedProbability = 1 - (1 - singleProbability) ** bracket.outcomes.max;
    expect(candidate.method.allflame).toBe(true);
    expect(candidate.probability).toBeGreaterThan(singleProbability + 0.1);
    expect(Math.abs(candidate.probability - expectedProbability)).toBeLessThan(0.12);
    expect(candidate.cost).toBe(2 + allflameQuote(catalog, item, craft)!.amount * 0.01);
    expect(candidate.cost).toBeGreaterThan(10);
    expect(result.byCost[0]!.costPerSuccess).toBeCloseTo(candidate.cost! / candidate.probability);
    const low = run({ ...item, level: 1 });
    expect(low.byAttempts[0]!.cost).toBeLessThan(candidate.cost!);
    const missingSulphur = { ...prices };
    delete missingSulphur[sulphur];
    const unpriced = run(item, missingSulphur);
    expect(unpriced.byAttempts[0]!.cost).toBeNull();
    expect(unpriced.byCost).toEqual([]);
});
