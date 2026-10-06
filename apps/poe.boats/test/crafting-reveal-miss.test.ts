import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import {
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.tags.includes("str_armour"),
    )![0];
    const currency = (action: string): CraftingMethod => ({
        kind: "currency",
        id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    });
    const hidden = () =>
        engine.apply(
            engine.apply(engine.createItem(baseId), currency("transmute_to_rare"), seededRandom(3))
                .item,
            currency(game === "poe1" ? "replace_rare_mod_veiled" : "abyssal_bench_ticket_armour"),
            seededRandom(11),
        ).item;

    describe(`${game} reveal preference misses`, () => {
        it("retains an unmatched offer and reuses it without further random rolls", () => {
            const offered = engine.revealChoices(hidden(), seededRandom(15));
            const absent = engine
                .revealPool(offered)
                .find(({ id }) => !offered.reveal!.choices.includes(id))!.id;
            const random = seededRandom(42);
            const pick = vi.spyOn(random, "pick");
            const integer = vi.spyOn(random, "integer");
            const method = { kind: "reveal", preferred: [absent], skipOnMiss: true } as const;
            const result = engine.apply(
                offered,
                { ...method, preferred: [...method.preferred] },
                random,
            );
            expect(result).toEqual({ item: offered, cost: [] });
            expect(
                engine.apply(result.item, { ...method, preferred: [...method.preferred] }, random),
            ).toEqual(result);
            expect(pick).not.toHaveBeenCalled();
            expect(integer).not.toHaveBeenCalled();
            const selected = offered.reveal!.choices[2]!;
            const completed = engine.apply(
                result.item,
                { kind: "reveal", preferred: [absent, selected], skipOnMiss: true },
                random,
            );
            expect(completed.item.reveal).toBeUndefined();
            expect(completed.item.mods.some(({ id }) => id === selected)).toBe(true);
            expect(completed.cost).toEqual([]);
        });

        it("keeps the default first-offer fallback and treats an empty preference list as a miss only when requested", () => {
            const offered = engine.revealChoices(hidden(), seededRandom(15));
            expect(
                engine.apply(
                    offered,
                    { kind: "reveal", preferred: [], skipOnMiss: true },
                    seededRandom(2),
                ).item,
            ).toEqual(offered);
            for (const skipOnMiss of [undefined, false]) {
                const result = engine.apply(
                    offered,
                    { kind: "reveal", preferred: [], skipOnMiss },
                    seededRandom(2),
                );
                expect(result.item.reveal).toBeUndefined();
                expect(result.item.mods.some(({ id }) => id === offered.reveal!.choices[0])).toBe(
                    true,
                );
            }
        });

        it("calculates and samples the probability of retaining an unrevealed modifier using extracted offers", () => {
            const item = hidden();
            const groups = new Set<string>();
            let count = 0;
            const candidates = engine.revealPool(item).filter((entry) => {
                if (count >= 4 || entry.mod.groups.some((group) => groups.has(group))) return false;
                for (const group of entry.mod.groups) groups.add(group);
                count++;
                return true;
            });
            expect(candidates).toHaveLength(4);
            const keep = new Set(
                [...item.mods, ...item.implicits, ...candidates].map(({ id }) => id),
            );
            const reduced = {
                ...catalog,
                mods: Object.fromEntries(
                    Object.entries(catalog.mods).filter(([id]) => keep.has(id)),
                ),
            };
            const small = new CraftingEngine(reduced);
            const preferred = candidates[0]!.id;
            const chance = small.revealProbabilities(item).get(preferred)!;
            expect(chance).toBeGreaterThan(0);
            expect(chance).toBeLessThan(1);
            const method: CraftingMethod = {
                kind: "reveal",
                preferred: [preferred],
                skipOnMiss: true,
            };
            const target = small.validateTarget({
                groups: [],
                unrevealedCount: { min: 1, max: 1 },
            });
            expect(calculateExact(small, item, method, target).probability).toBeCloseTo(
                1 - chance,
                12,
            );
            const project = craftingProjectSchema.parse({
                format: 1,
                game,
                patch: catalog.patch,
                item,
                method,
                target,
                steps: [],
                prices: {},
                seed: 42,
                iterations: 500,
                maxActions: 2,
            });
            expect(validateProject(reduced, JSON.parse(JSON.stringify(project))).method).toEqual(
                method,
            );
            const simulation = new CraftingSimulation(reduced, project);
            for (let trial = 0; trial < 500; trial++) simulation.runTrial();
            expect(simulation.result().probability).toBeCloseTo(1 - chance, 1);
            expect(simulation.result().errors).toEqual({});
            const processProject = craftingProjectSchema.parse({
                ...project,
                useProcess: true,
                target: { groups: [], unrevealedCount: { min: 0, max: 0 } },
                steps: [
                    {
                        id: "preferred",
                        method,
                        condition: { groups: [], unrevealedCount: { min: 0, max: 0 } },
                        onSuccess: "success",
                        onFailure: "fallback",
                    },
                    {
                        id: "fallback",
                        method: { kind: "reveal", preferred: [] },
                        condition: { groups: [] },
                        onSuccess: "success",
                    },
                ],
            });
            const exact = calculateProcessExact(small, processProject);
            expect(exact.probability).toBeCloseTo(1, 12);
            expect(exact).toMatchObject({
                errors: {},
                meanCost: 0,
            });
            expect(exact.totalActions).toBeCloseTo(2 - chance, 12);
            const process = new CraftingProcess(small, processProject, seededRandom(42));
            while (!process.done) process.advance();
            expect(process.result()).toMatchObject({
                success: true,
                error: undefined,
                spending: {},
            });
            expect(process.result().item.reveal).toBeUndefined();
        });

        if (game === "poe2")
            it("uses the remaining Echoes reroll before deferring and charges the omen only once", async () => {
                const item = hidden();
                const echo = catalog.crafting.currencies.find((entry) =>
                    entry.id.endsWith("/OmenOnAbyssRerollOptions"),
                )!;
                expect(echo).toBeDefined();
                const method: CraftingMethod = {
                    kind: "reveal",
                    preferred: [],
                    skipOnMiss: true,
                    omens: [echo.id],
                };
                const random = seededRandom(5);
                const first = engine.prepareReveal(item, method, random);
                const rerolled = engine.rerollReveal(first.item, random);
                const missed = engine
                    .revealPool(item)
                    .find(
                        ({ id }) =>
                            !first.item.reveal!.choices.includes(id) &&
                            !rerolled.reveal!.choices.includes(id),
                    )!.id;
                const result = engine.apply(
                    item,
                    { ...method, preferred: [missed] },
                    seededRandom(5),
                );
                expect(result.item).toEqual(rerolled);
                expect(result.cost).toEqual([{ id: echo.id, name: echo.name, amount: 1 }]);
                expect(result.item.reveal?.echoes?.remaining).toBe(0);
                expect(engine.costs(method, result.item)).toEqual([]);
                const empty = engine.apply(item, method, seededRandom(5));
                expect(empty.item).toEqual(rerolled);
                expect(empty.cost).toEqual(result.cost);
                expect(
                    engine.apply(result.item, { ...method, preferred: [missed] }, seededRandom(20)),
                ).toEqual({ item: result.item, cost: [] });
                vi.resetModules();
                const scope = {
                    onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
                    postMessage: vi.fn(),
                };
                vi.stubGlobal("self", scope);
                try {
                    await import("../app/lib/crafting.worker");
                    const project = craftingProjectSchema.parse({
                        format: 1,
                        game,
                        patch: catalog.patch,
                        item: result.item,
                        method,
                        target: { groups: [], unrevealedCount: { min: 1, max: 1 } },
                        steps: [],
                        prices: { [echo.id]: 10 },
                        seed: 42,
                        iterations: 1,
                        maxActions: 2,
                    });
                    await scope.onmessage!({ data: { type: "calculate", catalog, project } });
                    expect(scope.postMessage.mock.lastCall![0]).toMatchObject({
                        type: "done",
                        result: { kind: "exact", probability: 1, spending: {}, meanCost: 0 },
                    });
                } finally {
                    vi.unstubAllGlobals();
                }
            });
    });
}
