import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { craftingSequences } from "../app/lib/crafting-sequences";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    type CraftingStep,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Ring" && base.implicits.length > 0,
    )![0];
    const normal = engine.createItem(baseId);
    let rare: CraftingItem = { ...normal, rarity: "rare" };
    for (const side of ["prefix", "suffix"] as const)
        rare = engine.addStartingMod(rare, engine.pool(rare, { side })[0]!.id, seededRandom(42));
    const currency = (action: string) => ({
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
    });
    const target = (patch: object = {}) => engine.validateTarget({ groups: [], ...patch });
    const project = (item: CraftingItem, steps: CraftingStep[]) =>
        craftingProjectSchema.parse({
            format: 1,
            game,
            patch: catalog.patch,
            item,
            target: target(),
            method: currency("add_mod_to_rare"),
            steps,
            useProcess: true,
            prices: {},
            seed: 42,
            iterations: 100,
            maxActions: 20,
        });

    describe(`${game} item conditions and currency sequences`, () => {
        it("matches rarity and inclusive explicit affix counts without counting implicits", () => {
            expect(normal.implicits.length).toBeGreaterThan(0);
            expect(
                engine.matches(
                    normal,
                    target({ rarity: "normal", affixCount: { min: 0, max: 0 } }),
                ),
            ).toBe(true);
            expect(
                engine.matches(
                    rare,
                    target({
                        rarity: "rare",
                        affixCount: { min: 2, max: 2 },
                        prefixCount: { min: 1, max: 1 },
                        suffixCount: { min: 1, max: 1 },
                    }),
                ),
            ).toBe(true);
            for (const condition of [
                { rarity: "magic" },
                { affixCount: { min: 3, max: 6 } },
                { prefixCount: { min: 0, max: 0 } },
                { suffixCount: { min: 2, max: 3 } },
            ])
                expect(engine.matches(rare, target(condition))).toBe(false);
            expect(engine.matches(rare, target({ affixCount: { min: 1, max: 3 } }))).toBe(true);
        });

        it("combines item conditions with modifier groups and open affixes", () => {
            const condition = target({
                groups: [{ mods: [rare.mods[0]!.id] }],
                rarity: "rare",
                openAffixes: 4,
                openPrefixes: 2,
                openSuffixes: 2,
            });
            expect(engine.matches(rare, condition)).toBe(true);
            expect(engine.matches(rare, { ...condition, openAffixes: 5 })).toBe(false);
            expect(engine.matches({ ...normal, rarity: "rare" }, condition)).toBe(false);
        });

        it("rejects invalid ranges and keeps existing target documents compatible", () => {
            for (const key of ["affixCount", "prefixCount", "suffixCount"])
                for (const range of [
                    { min: 3, max: 2 },
                    { min: -1, max: 2 },
                    { min: 0, max: key === "affixCount" ? (game === "poe2" ? 10 : 9) : 7 },
                    { min: 0.5, max: 1 },
                ])
                    expect(() => target({ [key]: range })).toThrow();
            expect(() => target({ rarity: "unique" })).toThrow();
            expect(() => target({ openAffixes: 10 })).toThrow();
            expect(engine.matches(normal, target())).toBe(true);
        });

        it("routes condition-only steps without spending currency or consuming randomness", () => {
            const input = project(rare, [
                {
                    id: "check",
                    condition: target({ affixCount: { min: 2, max: 2 } }),
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ]);
            const random = seededRandom(42);
            const pick = vi.spyOn(random, "pick");
            const process = new CraftingProcess(engine, input, random);
            process.advance();
            expect(process.result()).toMatchObject({
                success: true,
                actions: 0,
                steps: 1,
                spending: {},
                item: rare,
            });
            expect(pick).not.toHaveBeenCalled();
            expect(calculateProcessExact(engine, input)).toMatchObject({
                probability: 1,
                totalActions: 0,
                spending: {},
                meanCost: 0,
                unpriced: [],
            });
        });

        it("bounds loops made entirely of checks and reports a failure without costs", () => {
            const input = project(rare, [
                { id: "check", condition: target(), onSuccess: "check", onFailure: "failure" },
            ]);
            input.maxActions = 3;
            const process = new CraftingProcess(engine, input, seededRandom(42));
            while (!process.done) process.advance();
            expect(process.result()).toMatchObject({
                success: false,
                timeout: true,
                actions: 0,
                steps: 3,
                spending: {},
            });
            expect(calculateProcessExact(engine, input)).toMatchObject({
                probability: 0,
                timeouts: 1,
                totalActions: 0,
                spending: {},
            });
            const simulation = new CraftingSimulation(catalog, input);
            simulation.runTrial();
            expect(simulation.result()).toMatchObject({
                successes: 0,
                timeouts: 1,
                totalActions: 0,
                spending: {},
            });
        });

        it("checks before crafting, skips unreachable currencies, and validates only actual methods", () => {
            const input = project(rare, [
                {
                    id: "check",
                    condition: target({ rarity: "normal" }),
                    onSuccess: "craft",
                    onFailure: "success",
                },
                {
                    id: "craft",
                    method: currency("transmute_to_magic"),
                    condition: target(),
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ]);
            expect(
                validateProject(catalog, JSON.parse(JSON.stringify(input))).steps[0]!.method,
            ).toBeUndefined();
            expect(calculateProcessExact(engine, input)).toMatchObject({
                probability: 1,
                spending: {},
                errors: {},
            });
            input.steps[1]!.method = { kind: "currency", id: "missing" };
            expect(() => validateProject(catalog, input)).toThrow("not supported");
        });

        it("builds sequence names and currencies solely from the extracted catalog", () => {
            const sequences = craftingSequences(engine);
            expect(sequences.length).toBeGreaterThan(0);
            for (const sequence of sequences) {
                for (const step of sequence.steps) {
                    if (!step.method) continue;
                    expect(step.method.kind).toBe("currency");
                    if (step.method.kind === "currency") {
                        const id = step.method.id;
                        const row = catalog.crafting.currencies.find((entry) => entry.id === id)!;
                        expect(sequence.name).toContain(row.name);
                    }
                }
            }
        });

        it("fills magic affixes before Regal and charges Augmentation only when needed", () => {
            const sequence = craftingSequences(engine).find((entry) => entry.rarity === "normal")!;
            const counts = new Set<number>();
            for (let seed = 0; seed < 30; seed++) {
                const input = project(normal, sequence.steps);
                const process = new CraftingProcess(engine, input, seededRandom(seed));
                process.advance();
                const missing = engine.limits(process.item).max - process.item.mods.length;
                counts.add(missing);
                while (!process.done) process.advance();
                const result = process.result();
                expect(result.error).toBeUndefined();
                expect(result.success).toBe(true);
                expect(result.item.rarity).toBe("rare");
                expect(result.item.mods).toHaveLength(3);
                expect(result.spending[currency("transmute_to_magic").id]).toBe(1);
                expect(result.spending[currency("upgrade_magic_to_rare").id]).toBe(1);
                expect(result.spending[currency("add_mod_to_magic").id] ?? 0).toBe(missing);
            }
            expect(counts).toEqual(new Set(game === "poe1" ? [0, 1] : [1]));
        });

        if (game === "poe1") {
            it("skips Augmentation on Simplex, whose extracted magic limits allow no affixes", () => {
                const simplex = Object.entries(catalog.bases).find(
                    ([, base]) => base.name === "Simplex Amulet",
                )![0];
                const item = { ...engine.createItem(simplex), rarity: "magic" as const };
                expect(engine.limits(item).max).toBe(0);
                const sequence = craftingSequences(engine).find(
                    (entry) => entry.rarity === "magic",
                )!;
                for (let seed = 0; seed < 20; seed++) {
                    const input = project(item, sequence.steps);
                    const process = new CraftingProcess(engine, input, seededRandom(seed));
                    while (!process.done) process.advance();
                    expect(process.result().error).toBeUndefined();
                    expect(process.result().success).toBe(true);
                    expect(process.item.rarity).toBe("rare");
                    expect(process.item.mods).toHaveLength(1);
                    expect(process.spending[currency("add_mod_to_magic").id]).toBeUndefined();
                    expect(process.spending[currency("reroll_magic").id]).toBe(1);
                }
            });
            it("fills two magic Cogwork suffixes before applying Regal", () => {
                const base = Object.entries(catalog.bases).find(
                    ([, entry]) => entry.name === "Cogwork Ring",
                )![0];
                const item = { ...engine.createItem(base), rarity: "magic" as const };
                const sequence = craftingSequences(engine).find(
                    (entry) => entry.rarity === "magic",
                )!;
                const process = new CraftingProcess(
                    engine,
                    project(item, sequence.steps),
                    seededRandom(1),
                );
                while (!process.done) {
                    if (
                        process.item.rarity === "magic" &&
                        !engine.matches(process.item, target({ openAffixes: 1 }))
                    )
                        expect(engine.counts(process.item)).toEqual({ prefixes: 0, suffixes: 2 });
                    process.advance();
                }
                expect(process.result().error).toBeUndefined();
                expect(process.item.mods).toHaveLength(3);
                expect(process.item.rarity).toBe("rare");
            });
        }
    });
}
