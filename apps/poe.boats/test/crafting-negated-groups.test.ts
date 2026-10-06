import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import {
    CraftingProcess,
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
    validateProject,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Ring" && base.implicits.length > 0,
    )![0];
    const normal = engine.createItem(base);
    const emptyRare = { ...normal, rarity: "rare" as const };
    const prefix = engine.pool(emptyRare, { side: "prefix" })[0]!.id;
    const withPrefix = engine.addStartingMod(emptyRare, prefix, seededRandom(42));
    const suffix = engine.pool(withPrefix, { side: "suffix" })[0]!.id;
    const rare = engine.addStartingMod(withPrefix, suffix, seededRandom(42));
    const annul = {
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === "remove_random_mod")!.id,
    };
    const group = { mods: [prefix], minimum: 1, negated: true };
    const absent = engine.validateTarget({ groups: [group] });
    const project = craftingProjectSchema.parse({
        format: 1,
        game,
        patch: catalog.patch,
        item: rare,
        method: annul,
        target: absent,
        steps: [],
        prices: { [annul.id]: 2 },
        seed: 42,
        iterations: 1000,
        maxActions: 3,
    });

    describe(`${game} negated modifier requirements`, () => {
        it("preserves existing documents and matches the complement of a positive group", () => {
            const positive = engine.validateTarget({ groups: [{ mods: [prefix] }] });
            expect(positive.groups).toEqual([{ mods: [prefix], minimum: 1 }]);
            expect(hasCraftingRequirements(absent)).toBe(true);
            for (const item of [normal, withPrefix, rare]) {
                expect(engine.matches(item, absent)).toBe(!engine.matches(item, positive));
                expect(
                    engine.matches(item, { ...absent, groups: [{ ...group, negated: false }] }),
                ).toBe(engine.matches(item, positive));
            }
            expect(engine.matches({ ...normal, destroyed: true }, absent)).toBe(false);
        });

        it("negates the complete count threshold, including alternative tiers", () => {
            const multiple = engine.validateTarget({
                groups: [{ mods: [prefix, suffix], minimum: 2, negated: true }],
            });
            expect(engine.matches(normal, multiple)).toBe(true);
            expect(engine.matches(withPrefix, multiple)).toBe(true);
            expect(engine.matches(rare, multiple)).toBe(false);
            const none = engine.validateTarget({
                groups: [{ mods: [prefix, suffix], negated: true }],
            });
            expect(engine.matches(normal, none)).toBe(true);
            expect(engine.matches(withPrefix, none)).toBe(false);
            expect(engine.matches(rare, none)).toBe(false);
            const family = engine
                .pool(emptyRare, { side: "prefix" })
                .filter(
                    (entry) =>
                        entry.mod.type === catalog.mods[prefix]!.type &&
                        entry.mod.groups.some((id) => catalog.mods[prefix]!.groups.includes(id)),
                );
            expect(family.length).toBeGreaterThan(1);
            const tiers = engine.validateTarget({
                groups: [{ mods: family.map((entry) => entry.id), negated: true }],
            });
            for (const entry of family)
                expect(
                    engine.matches(engine.addStartingMod(normal, entry.id, seededRandom(1)), tiers),
                ).toBe(false);
        });

        it("combines positive and negative groups under all, any and minimum matching", () => {
            const groups = [{ mods: [prefix] }, { mods: [suffix], negated: true }];
            const all = engine.validateTarget({ groups });
            const any = engine.validateTarget({ groups, minimumGroups: 1 });
            expect([normal, withPrefix, rare].map((item) => engine.matches(item, all))).toEqual([
                false,
                true,
                false,
            ]);
            expect([normal, withPrefix, rare].map((item) => engine.matches(item, any))).toEqual([
                true,
                true,
                true,
            ]);
            const mixed = engine.validateTarget({
                groups: [...groups, { mods: [normal.implicits[0]!.id], negated: true }],
                minimumGroups: 2,
            });
            expect([normal, withPrefix, rare].map((item) => engine.matches(item, mixed))).toEqual([
                false,
                true,
                false,
            ]);
            expect(engine.matches(normal, { ...any, rarity: "rare" })).toBe(false);
            expect(engine.matches(withPrefix, { ...all, openAffixes: 6 })).toBe(false);
        });

        it("counts only matching fractures when negating a fractured group and includes implicits", () => {
            const target = engine.validateTarget({ groups: [{ ...group, fractured: true }] });
            expect(engine.matches(rare, target)).toBe(true);
            const fractured = structuredClone(rare);
            fractured.mods[1]!.fractured = true;
            expect(engine.matches(fractured, target)).toBe(true);
            fractured.mods[0]!.fractured = true;
            expect(engine.matches(fractured, target)).toBe(false);
            const implicit = engine.validateTarget({
                groups: [{ mods: [normal.implicits[0]!.id], negated: true }],
            });
            expect(engine.matches(normal, implicit)).toBe(false);
        });

        it("validates excluded identities, thresholds and flag types and preserves nested process conditions", () => {
            for (const invalid of [
                { mods: ["missing"], negated: true },
                { mods: [prefix], negated: "true" },
                { mods: [prefix], negated: true, minimum: 0 },
                { mods: [prefix, prefix], negated: true, minimum: 2 },
            ])
                expect(() => engine.validateTarget({ groups: [invalid] })).toThrow();
            const input = {
                ...project,
                steps: [
                    { id: "check", condition: absent, onSuccess: "success", onFailure: "failure" },
                ],
            };
            expect(validateProject(catalog, JSON.parse(JSON.stringify(input)))).toEqual(input);
            expect(() =>
                validateProject(catalog, {
                    ...input,
                    steps: [
                        {
                            ...input.steps[0],
                            condition: { groups: [{ mods: ["missing"], negated: true }] },
                        },
                    ],
                }),
            ).toThrow();
        });

        it("calculates complementary annulment odds and samples the exclusion without changing the item", () => {
            const original = structuredClone(project);
            const positive = engine.validateTarget({ groups: [{ mods: [prefix] }] });
            const excluded = calculateExact(engine, rare, annul, absent);
            expect(excluded.probability).toBeCloseTo(0.5);
            expect(
                excluded.probability + calculateExact(engine, rare, annul, positive).probability,
            ).toBeCloseTo(1);
            const simulation = new CraftingSimulation(catalog, project);
            for (let index = 0; index < 1000; index++) simulation.runTrial();
            const result = simulation.result();
            expect(result.probability).toBeGreaterThan(0.45);
            expect(result.probability).toBeLessThan(0.55);
            expect(result).toMatchObject({
                errors: {},
                meanCost: 2,
                spending: { [annul.id]: 1000 },
            });
            expect(project).toEqual(original);
            const invalid = new CraftingSimulation(catalog, { ...project, item: normal });
            expect(() => invalid.runTrial()).toThrow("magic or rare");
            expect(invalid.result()).toMatchObject({ successes: 0, spending: {} });
        });

        it("routes exclusion checks for free and retries annulment with exact conditional costs", () => {
            const steps = [
                { id: "check", condition: absent, onSuccess: "success", onFailure: "annul" },
                {
                    id: "annul",
                    method: annul,
                    condition: absent,
                    onSuccess: "success",
                    onFailure: "annul",
                },
            ];
            const input = { ...project, useProcess: true, steps };
            expect(calculateProcessExact(engine, input)).toMatchObject({
                probability: 1,
                meanCost: 3,
                spending: { [annul.id]: 1.5 },
            });
            const simulation = new CraftingSimulation(catalog, input, true);
            for (let index = 0; index < 1000; index++) simulation.runTrial();
            expect(simulation.result()).toMatchObject({ successes: 1000, errors: {}, timeouts: 0 });
            expect(simulation.result().meanCost).toBeGreaterThan(2.9);
            expect(simulation.result().meanCost).toBeLessThan(3.1);
            const random = seededRandom(1);
            const pick = vi.spyOn(random, "pick");
            const process = new CraftingProcess(engine, { ...input, item: normal }, random);
            process.advance();
            expect(process.result()).toMatchObject({
                success: true,
                actions: 0,
                steps: 1,
                spending: {},
                item: normal,
            });
            expect(pick).not.toHaveBeenCalled();
        });
    });
}
