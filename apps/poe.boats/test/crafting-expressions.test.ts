import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
    validateProject,
} from "../app/lib/crafting-simulation";
import { replaceTarget, targetEntries, targetNeedsValues } from "../app/lib/crafting-targets";
import {
    type CraftingTarget,
    craftingCatalogSchema,
    craftingProjectSchema,
    craftingTargetSchema,
    maximumConditionDepth,
    maximumConditionNodes,
} from "../app/schemas/crafting";

for (const game of ["poe1", "poe2"] as const) {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && !entry.implicits.length,
    )![0];
    const normal = engine.createItem(base);
    const life = "IncreasedLife1";
    const cold = "ColdResist1";
    const withLife = engine.addStartingMod(normal, life, seededRandom(42));
    const item = engine.addStartingMod({ ...withLife, rarity: "rare" }, cold, seededRandom(42));
    const leaf = (fields: object = {}) => engine.validateTarget({ groups: [], ...fields });
    const combine = (operator: "and" | "or", operands: CraftingTarget[], negated = false) =>
        leaf({ expression: { operator, operands, negated } });
    const requiredLife = leaf({ groups: [{ mods: [life] }] });
    const requiredCold = leaf({ groups: [{ mods: [cold] }] });
    const notCold = combine("and", [requiredCold], true);
    const target = combine("or", [
        combine("and", [requiredLife, notCold]),
        leaf({ affixCount: { min: 0, max: 0 } }),
    ]);
    const annul = {
        kind: "currency" as const,
        id: catalog.crafting.currencies.find((entry) => entry.action === "remove_random_mod")!.id,
    };
    const project = craftingProjectSchema.parse({
        format: 1,
        game,
        patch: catalog.patch,
        item,
        method: annul,
        target,
        steps: [],
        prices: { [annul.id]: 2 },
        seed: 42,
        iterations: 1000,
        maxActions: 2,
    });

    describe(`${game} nested crafting requirements`, () => {
        it("evaluates nested AND, OR and NOT with independent parent requirements", () => {
            const coldOnly = engine.addStartingMod(normal, cold, seededRandom(1));
            const items = [normal, withLife, coldOnly, item];
            expect(items.map((value) => engine.matches(value, target))).toEqual([
                true,
                true,
                false,
                false,
            ]);
            expect(
                items.map((value) => engine.matches(value, combine("and", [target], true))),
            ).toEqual([false, false, true, true]);
            expect(
                items.map((value) =>
                    engine.matches(value, combine("or", [requiredLife, requiredCold], true)),
                ),
            ).toEqual([true, false, false, false]);
            expect(
                items.map((value) =>
                    engine.matches(value, combine("and", [requiredLife, requiredCold], true)),
                ),
            ).toEqual([true, true, true, false]);
            expect(engine.matches(normal, { ...target, rarity: "rare" })).toBe(false);
            expect(
                engine.matches({ ...normal, destroyed: true }, combine("or", [requiredLife], true)),
            ).toBe(false);
            expect(hasCraftingRequirements(target)).toBe(true);
            expect(engine.matches(normal, combine("and", [leaf()]))).toBe(true);
            expect(engine.matches(normal, combine("and", [leaf()], true))).toBe(false);
            expect(targetNeedsValues(target)).toBe(false);
        });

        it("keeps fracture filters, exclusions and minimum-group semantics inside branches", () => {
            const branch = leaf({
                groups: [
                    { mods: [life], fractured: true },
                    { mods: [cold], negated: true },
                ],
                minimumGroups: 1,
            });
            const nested = combine("and", [branch, leaf({ rarity: "rare" })]);
            expect(engine.matches(item, nested)).toBe(false);
            const fractured = {
                ...item,
                mods: item.mods.map((mod, index) => ({ ...mod, fractured: index === 0 })),
            };
            expect(engine.matches(fractured, nested)).toBe(true);
            expect(engine.matches({ ...withLife, rarity: "magic" }, nested)).toBe(false);
        });

        it("validates every branch against the catalog, including unreachable alternatives", () => {
            for (const invalid of [
                { groups: [{ mods: ["missing"] }] },
                { groups: [], stats: [{ id: "missing", min: 1 }] },
                { groups: [{ mods: [life], minimum: 2 }] },
                {
                    groups: [],
                    ...(game === "poe1"
                        ? { socketedJewel: true }
                        : { memoryStrands: { min: 1, max: 1 } }),
                },
            ])
                expect(() =>
                    engine.validateTarget({
                        groups: [],
                        expression: { operator: "or", operands: [leaf(), invalid] },
                    }),
                ).toThrow();
            expect(validateProject(catalog, JSON.parse(JSON.stringify(project)))).toEqual(project);
            const legacy = leaf();
            expect(legacy).toEqual({
                groups: [],
                minimumGroups: 0,
                openPrefixes: 0,
                openSuffixes: 0,
            });
        });

        it("calculates exact branch unions without double counting and agrees with seeded simulations", () => {
            expect(calculateExact(engine, item, annul, target).probability).toBeCloseTo(0.5);
            const overlapping = combine("or", [requiredLife, requiredLife, requiredCold]);
            expect(calculateExact(engine, item, annul, overlapping).probability).toBe(1);
            const original = structuredClone(project);
            const simulation = new CraftingSimulation(catalog, project);
            for (let index = 0; index < 1000; index++) simulation.runTrial();
            expect(simulation.result()).toMatchObject({
                meanCost: 2,
                errors: {},
                spending: { [annul.id]: 1000 },
            });
            expect(simulation.result().probability).toBeCloseTo(0.5, 1);
            expect(project).toEqual(original);
        });

        it("routes nested conditions with retained retry costs and preserves the tree in process saves", () => {
            const input = craftingProjectSchema.parse({
                ...project,
                useProcess: true,
                target: leaf(),
                steps: [
                    {
                        id: "roll",
                        method: annul,
                        condition: target,
                        onSuccess: "success",
                        onFailure: "roll",
                    },
                ],
            });
            expect(validateProject(catalog, JSON.parse(JSON.stringify(input)))).toEqual(input);
            expect(calculateProcessExact(engine, input)).toMatchObject({
                probability: 1,
                meanCost: 3,
                spending: { [annul.id]: 1.5 },
            });
            const simulation = new CraftingSimulation(catalog, input, true);
            for (let index = 0; index < 1000; index++) simulation.runTrial();
            expect(simulation.result()).toMatchObject({ successes: 1000, errors: {}, timeouts: 0 });
            expect(simulation.result().meanCost!).toBeGreaterThan(2.9);
            expect(simulation.result().meanCost!).toBeLessThan(3.1);
        });

        it("enumerates nested numeric requirements in final targets and step-only conditions", () => {
            const range = catalog.mods[life]!.stats[0]!;
            const boundary = combine("or", [
                leaf({ stats: [{ id: range.id, scope: "explicit", min: range.max }] }),
                combine(
                    "and",
                    [leaf({ stats: [{ id: range.id, scope: "explicit", min: range.min + 1 }] })],
                    true,
                ),
            ]);
            expect(targetNeedsValues(boundary)).toBe(true);
            const divine = {
                kind: "currency" as const,
                id: catalog.crafting.currencies.find(
                    (entry) => entry.action === "reroll_mod_values",
                )!.id,
            };
            const p = 2 / (range.max - range.min + 1);
            expect(calculateExact(engine, withLife, divine, boundary).probability).toBeCloseTo(p);
            const input = craftingProjectSchema.parse({
                ...project,
                item: withLife,
                method: divine,
                target: leaf(),
                useProcess: true,
                prices: { [divine.id]: 3 },
                steps: [
                    {
                        id: "divine",
                        method: divine,
                        condition: boundary,
                        onSuccess: "success",
                        onFailure: "divine",
                    },
                ],
            });
            expect(calculateProcessExact(engine, input)).toMatchObject({
                probability: expect.closeTo(1 - (1 - p) ** 2),
                meanCost: expect.closeTo(3 * (2 - p)),
            });
        });

        it("evaluates build-derived base defence ranges inside nested conditions", () => {
            const armourBase = Object.entries(catalog.bases).find(
                ([, entry]) =>
                    entry.defences.armour &&
                    entry.item_class === "Body Armour" &&
                    !entry.implicits.length,
            )![0];
            const starting = engine.createItem(armourBase);
            const range = catalog.bases[armourBase]!.defences.armour!;
            const perfect = combine("or", [
                leaf({ baseDefences: { armour: { min: range.max, max: range.max } } }),
                leaf({ rarity: "rare" }),
            ]);
            expect(targetNeedsValues(perfect)).toBe(true);
            if (game === "poe1") {
                const sacred = {
                    kind: "currency" as const,
                    id: catalog.crafting.currencies.find(
                        (entry) => entry.action === "reroll_variable_defences",
                    )!.id,
                };
                expect(calculateExact(engine, starting, sacred, perfect).probability).toBeCloseTo(
                    1 / (range.max - range.min + 1),
                );
            } else expect(engine.matches(starting, perfect)).toBe(true);
        });
    });
}

describe("bounded requirement trees", () => {
    const empty = craftingTargetSchema.parse({ groups: [] });
    it("rejects invalid operators, empty groups, excess width/depth and cyclic inputs", () => {
        for (const expression of [
            { operator: "xor", operands: [empty] },
            { operator: "and", operands: [] },
            { operator: "or", operands: Array(13).fill(empty) },
            { operator: "and", operands: [empty], negated: "yes" },
        ])
            expect(() => craftingTargetSchema.parse({ ...empty, expression })).toThrow();
        let nested = empty;
        for (let depth = 0; depth < maximumConditionDepth; depth++)
            nested = { ...empty, expression: { operator: "and", operands: [nested] } };
        expect(craftingTargetSchema.parse(nested)).toEqual(nested);
        expect(() =>
            craftingTargetSchema.parse({
                ...empty,
                expression: { operator: "and", operands: [nested] },
            }),
        ).toThrow("nesting depth");
        const cyclic: CraftingTarget = structuredClone(empty);
        cyclic.expression = { operator: "or", operands: [cyclic] };
        expect(() => craftingTargetSchema.parse(cyclic)).toThrow("nesting depth");
        const broad = {
            ...empty,
            expression: {
                operator: "and",
                operands: Array(8).fill({
                    ...empty,
                    expression: { operator: "or", operands: Array(8).fill(empty) },
                }),
            },
        };
        expect(() => craftingTargetSchema.parse(broad)).toThrow(
            `${maximumConditionNodes} condition nodes`,
        );
    });

    it("updates only the chosen modifier destination and keeps siblings intact", () => {
        const target = craftingTargetSchema.parse({
            groups: [],
            expression: {
                operator: "or",
                operands: [empty, { ...empty, expression: { operator: "and", operands: [empty] } }],
            },
        });
        const paths = targetEntries(target).map((entry) => entry.path);
        expect(paths).toEqual([[], [0], [1], [1, 0]]);
        const replacement = { ...empty, rarity: "rare" as const };
        const updated = replaceTarget(target, [1, 0], replacement);
        expect(targetEntries(updated).at(-1)!.target).toEqual(replacement);
        expect(targetEntries(target).at(-1)!.target).toEqual(empty);
        expect(updated.expression!.operands[0]).toBe(target.expression!.operands[0]);
        expect(() => replaceTarget(target, [3], replacement)).toThrow("no longer exists");
    });
});
