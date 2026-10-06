import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { type CraftingItem, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const conversion = { kind: "harvest" as const, id: "ChangeFireToColdResist" };
const reforgeInfluence = { kind: "harvest" as const, id: "BossInfluence1" };

describe("extracted Harvest affinity reforges", () => {
    const methods = [
        { kind: "harvest", id: "ReforgeMoreLikely" },
        { kind: "harvest", id: "ReforgeLessLikely" },
    ] as const;
    const prepared = () =>
        engine.addStartingMod(engine.createItem(baseId), "IncreasedLife1", seededRandom(1));

    it.each(
        methods,
    )("$id weights all matching tiers without boosting unrelated life modifiers", (method) => {
        const item = prepared();
        const before = structuredClone(item);
        const empty = { ...item, mods: [] };
        const recipe = catalog.crafting.harvest.find((entry) => entry.id === method.id)!;
        const random = seededRandom(13);
        const pick = vi.spyOn(random, "pick");
        const result = engine.apply(item, method, random);
        expect(engine.harvestSupported(method.id)).toBe(true);
        expect(item).toEqual(before);
        const weighted = pick.mock.calls[1]![0];
        const expected = engine.pool(empty);
        expect(weighted).toEqual(
            expected.map((entry) => ({
                value: entry.id,
                weight:
                    entry.weight *
                    (entry.mod.type === "IncreasedLife" ? recipe.affinityMultiplier! : 1),
            })),
        );
        expect(weighted.find((entry) => entry.value === "IncreasedLife2")!.weight).toBe(
            1000 * recipe.affinityMultiplier!,
        );
        expect(weighted.find((entry) => entry.value === "LocalBaseArmourAndLife1")!.weight).toBe(
            expected.find((entry) => entry.id === "LocalBaseArmourAndLife1")!.weight,
        );
        expect(result.item.rarity).toBe("rare");
        expect(result.cost[0]!.amount).toBe(recipe.lifeforce);
    });

    it("uses a fixed snapshot of starting types throughout one reforge", () => {
        const item = prepared();
        const random = seededRandom(2);
        const pick = vi
            .spyOn(random, "pick")
            .mockImplementation(
                (choices) =>
                    (choices.find((entry) => entry.value === "ColdResist1") ?? choices[0]!).value,
            );
        engine.apply(item, methods[0], random);
        const first = pick.mock.calls[1]![0];
        const second = pick.mock.calls[2]![0];
        expect(first.find((entry) => entry.value === "ColdResist1")!.weight).toBe(1000);
        expect(second.find((entry) => entry.value === "IncreasedLife2")!.weight).toBe(10000);
        expect(second.some((entry) => entry.value === "ColdResist1")).toBe(false);
        expect(second.find((entry) => entry.value === "FireResist1")!.weight).toBe(1000);
    });

    it.each([
        "prefix",
        "suffix",
    ] as const)("preserves locked %ses and snapshots crafted modifier types", (side) => {
        let item = prepared();
        item = engine.addStartingMod(item, "ColdResist1", seededRandom(1));
        const lock = catalog.crafting.bench.find(
            (recipe) =>
                recipe.mod &&
                recipe.itemClasses.includes(engine.base(item).item_class) &&
                engine
                    .mod(recipe.mod)
                    .stats.some((stat) => stat.id === `item_generation_cannot_change_${side}es`),
        )!;
        item = engine.apply(item, { kind: "bench", id: lock.id }, seededRandom(1)).item;
        const kept = item.mods.filter((entry) => engine.mod(entry.id).generation_type === side);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const result = engine.apply(item, methods[0], random).item;
        expect(result.mods.slice(0, kept.length)).toEqual(kept);
        expect(result.mods.some((entry) => entry.id === lock.mod)).toBe(false);
        const expectedId = side === "prefix" ? "ColdResist1" : "IncreasedLife1";
        expect(pick.mock.calls[1]![0].find((entry) => entry.value === expectedId)!.weight).toBe(
            10000,
        );

        const craft = catalog.crafting.bench.find(
            (recipe) =>
                recipe.mod &&
                recipe.itemClasses.includes(engine.base(item).item_class) &&
                engine.mod(recipe.mod).type === "IncreasedLife",
        )!;
        const start = engine.apply(
            { ...engine.createItem(baseId), rarity: "rare" },
            { kind: "bench", id: craft.id },
            seededRandom(1),
        ).item;
        pick.mockClear();
        engine.apply(start, methods[0], random);
        expect(
            pick.mock.calls[1]![0].find((entry) => entry.value === "IncreasedLife1")!.weight,
        ).toBe(10000);
    });

    it("preserves fractures, quality and implicits without forcing the same modifier count", () => {
        let item = prepared();
        item.mods[0]!.fractured = true;
        while (item.mods.length < 6)
            item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1));
        item.quality = 20;
        const result = engine.apply(item, methods[1], {
            pick: (choices) => choices[0]!.value,
            integer: (minimum) => minimum,
        }).item;
        expect(result.mods).toHaveLength(4);
        expect(result.mods[0]).toEqual(item.mods[0]);
        expect(result.quality).toBe(20);
        expect(result.implicits).toEqual(item.implicits);
    });

    it("requires an uncorrupted, unmirrored rare item before random selection", () => {
        const item = prepared();
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const state of [
            { rarity: "normal" as const, mods: [] },
            { rarity: "magic" as const },
            { corrupted: true },
            { mirrored: true },
        ])
            expect(() => engine.apply({ ...item, ...state }, methods[0], random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
        const empty = { ...item, mods: [] };
        expect(engine.apply(empty, methods[0], seededRandom(1)).item.mods.length).toBeGreaterThan(
            0,
        );
    });

    it.each(
        methods,
    )("$id recalculates affinity on retry and agrees between exact and sampled costs", (method) => {
        const item = prepared();
        const ids = ["IncreasedLife1", "IncreasedLife2", "LocalBaseArmourAndLife1"];
        const smallCatalog = structuredClone(catalog);
        smallCatalog.mods = Object.fromEntries(ids.map((id) => [id, engine.mod(id)]));
        smallCatalog.crafting.rarities.Rare = { min: 1, max: 1, prefixes: 1, suffixes: 0 };
        const smallEngine = new CraftingEngine(smallCatalog);
        const target = smallEngine.validateTarget({ groups: [{ mods: ids.slice(0, 2) }] });
        const multiplier = catalog.crafting.harvest.find((entry) => entry.id === method.id)!
            .affinityMultiplier!;
        const raw = smallEngine.pool({ ...item, mods: [] });
        const lifeWeight = raw
            .filter((entry) => entry.mod.type === "IncreasedLife")
            .reduce((sum, entry) => sum + entry.weight, 0);
        const hybridWeight = raw.find((entry) => entry.id === ids[2])!.weight;
        const first = (lifeWeight * multiplier) / (lifeWeight * multiplier + hybridWeight);
        const retry = lifeWeight / (lifeWeight + hybridWeight * multiplier);
        expect(calculateExact(smallEngine, item, method, target).probability).toBeCloseTo(
            first,
            12,
        );
        const cost = engine.costs(method)[0]!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target,
            steps: [{ id: "reforge", method, condition: target, onFailure: "reforge" }],
            prices: { [cost.id]: 0.01 },
            seed: 8,
            iterations: 2000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(smallEngine, project);
        const probability = first + (1 - first) * retry;
        expect(exact.probability).toBeCloseTo(probability, 12);
        expect(exact.meanCost).toBeCloseTo(cost.amount * 0.01 * (2 - first), 12);
        const simulation = new CraftingSimulation(smallCatalog, project, true);
        for (let trial = 0; trial < project.iterations; trial++) simulation.runTrial();
        const result = simulation.result();
        expect(Math.abs(result.probability - probability)).toBeLessThan(0.03);
        expect(Math.abs(result.meanCost! - exact.meanCost!)).toBeLessThan(0.08);
        expect(result.errors).toEqual({});
    });
});

describe("extracted Harvest influence reforges", () => {
    const influenced = (influences = [0]): CraftingItem => ({
        ...engine.createItem(baseId),
        rarity: "rare" as const,
        influences,
    });

    it.each([
        0, 1, 2, 3, 4, 5,
    ])("guarantees influence %i and charges both extracted costs", (influence) => {
        const item = influenced([influence]);
        const before = structuredClone(item);
        const result = engine.apply(item, reforgeInfluence, seededRandom(13));
        expect(item).toEqual(before);
        expect(result.item.influences).toEqual([influence]);
        expect(catalog.crafting.modRules[result.item.mods[0]!.id]!.influence).toBe(influence);
        expect(result.item.mods.length).toBeGreaterThanOrEqual(4);
        expect(result.item.mods.length).toBeLessThanOrEqual(6);
        const recipe = catalog.crafting.harvest.find((entry) => entry.id === reforgeInfluence.id)!;
        expect(recipe.command).toBe("reroll_with_influence_mod");
        expect(engine.harvestSupported(recipe.id)).toBe(true);
        expect(result.cost).toEqual([
            {
                id: "Metadata/Items/Currency/HarvestSeedBlue",
                name: "Primal Crystallised Lifeforce",
                amount: recipe.lifeforce,
            },
            {
                id: "Metadata/Items/Currency/HarvestSeedBoss",
                name: "Sacred Crystallised Lifeforce",
                amount: recipe.sacred,
            },
        ]);
    });

    it("weights a dual-influence guarantee by modifiers and opens later rolls to ordinary mods", () => {
        const item = influenced([0, 1]);
        const random = seededRandom(3);
        const pick = vi.spyOn(random, "pick");
        engine.apply(item, reforgeInfluence, random);
        const expected = engine
            .pool(item)
            .filter((entry) => catalog.crafting.modRules[entry.id]?.influence != null);
        expect(
            new Set(expected.map((entry) => catalog.crafting.modRules[entry.id]!.influence)),
        ).toEqual(new Set([0, 1]));
        expect(pick.mock.calls[1]![0]).toEqual(
            expected.map((entry) => ({ value: entry.id, weight: entry.weight })),
        );
        expect(
            pick.mock.calls[2]![0].some(
                (choice) => catalog.crafting.modRules[String(choice.value)]?.influence == null,
            ),
        ).toBe(true);
    });

    it.each([
        "prefix",
        "suffix",
    ] as const)("preserves locked %ses and adds a new guarantee", (side) => {
        let item = influenced([0, 1]);
        for (let index = 0; index < 3; index++) {
            const mod = engine.pool(item, { side, ...(index === 0 ? { influence: 0 } : {}) })[0]!;
            item = engine.addStartingMod(item, mod.id, seededRandom(index));
        }
        const preserved = structuredClone(item.mods);
        const lock = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                entry.itemClasses.includes(catalog.bases[baseId]!.item_class) &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === `item_generation_cannot_change_${side}es`),
        )!;
        item = engine.apply(item, { kind: "bench", id: lock.id }, seededRandom(1)).item;
        const result = engine.apply(item, reforgeInfluence, seededRandom(9)).item;
        expect(result.mods.slice(0, 3)).toEqual(preserved);
        expect(result.mods.some((entry) => entry.id === lock.mod)).toBe(false);
        const added = result.mods.slice(3);
        expect(catalog.crafting.modRules[added[0]!.id]!.influence).not.toBeNull();
        expect(added.every((entry) => engine.mod(entry.id).generation_type !== side)).toBe(true);
    });

    it.each([
        { tag: "attack", method: reforgeInfluence },
        { tag: "caster", method: reforgeInfluence },
        { tag: "attack", method: { kind: "harvest", id: "ReforgeFire" } },
        { tag: "caster", method: { kind: "harvest", id: "ReforgeFire" } },
    ] as const)("applies removed $tag blockers to the $method.id guarantee only", ({
        tag,
        method,
    }) => {
        const weapon = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Wand",
        )![0];
        const empty = { ...engine.createItem(weapon), rarity: "rare" as const, influences: [0, 1] };
        const lock = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                entry.itemClasses.includes(catalog.bases[weapon]!.item_class) &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === `item_generation_cannot_roll_${tag}_affixes`),
        )!;
        const item = engine.apply(empty, { kind: "bench", id: lock.id }, seededRandom(1)).item;
        expect(
            engine
                .pool(empty, { influence: "any" })
                .some((entry) => entry.mod.implicit_tags.includes(tag)),
        ).toBe(true);
        const random = seededRandom(2);
        const pick = vi
            .spyOn(random, "pick")
            .mockImplementation(
                (choices) =>
                    (
                        choices.find(
                            (choice) =>
                                typeof choice.value === "string" &&
                                catalog.mods[choice.value]?.implicit_tags.includes(tag),
                        ) ?? choices[0]!
                    ).value,
            );
        const result = engine.apply(item, method, random).item;
        expect(
            pick.mock.calls[1]![0].every(
                (choice) => !engine.mod(String(choice.value)).implicit_tags.includes(tag),
            ),
        ).toBe(true);
        expect(engine.mod(result.mods[0]!.id).implicit_tags).not.toContain(tag);
        expect(
            result.mods.slice(1).some((entry) => engine.mod(entry.id).implicit_tags.includes(tag)),
        ).toBe(true);
        expect(result.mods.some((entry) => entry.id === lock.mod)).toBe(false);
    });

    it("rejects ineligible starting states and empty guarantee pools before randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            { ...influenced(), influences: [] },
            { ...influenced(), rarity: "normal" as const },
            { ...influenced(), rarity: "magic" as const },
            { ...influenced(), level: 1 },
            { ...influenced(), corrupted: true },
            { ...influenced(), mirrored: true },
        ]) {
            expect(() => engine.apply(item, reforgeInfluence, random)).toThrow();
        }
        expect(pick).not.toHaveBeenCalled();
    });

    it("uses the same extracted weights and costs in exact calculation and simulated processes", () => {
        const weapon = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "Wand",
        )![0];
        const item = { ...engine.createItem(weapon), rarity: "rare" as const, influences: [0, 1] };
        const pool = engine.pool(item, { influence: "any" });
        const first = pool.find((entry) =>
            pool.some(
                (other) =>
                    other.weight !== entry.weight &&
                    other.mod.groups.some((group) => entry.mod.groups.includes(group)),
            ),
        )!;
        const second = pool.find(
            (entry) =>
                entry.weight !== first.weight &&
                entry.mod.groups.some((group) => first.mod.groups.includes(group)),
        )!;
        const smallCatalog = {
            ...catalog,
            mods: Object.fromEntries(
                [first.id, second.id, ...item.implicits.map((mod) => mod.id)].map((id) => [
                    id,
                    engine.mod(id),
                ]),
            ),
        };
        const smallEngine = new CraftingEngine(smallCatalog);
        const target = smallEngine.validateTarget({ groups: [{ mods: [first.id] }] });
        const expected = first.weight / (first.weight + second.weight);
        expect(calculateExact(smallEngine, item, reforgeInfluence, target).probability).toBeCloseTo(
            expected,
            12,
        );
        const costs = engine.costs(reforgeInfluence);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            target,
            method: reforgeInfluence,
            steps: [
                {
                    id: "reforge",
                    method: reforgeInfluence,
                    condition: target,
                    onFailure: "failure",
                },
            ],
            prices: { [costs[0]!.id]: 0.01, [costs[1]!.id]: 10 },
            seed: 3,
            iterations: 2000,
            maxActions: 1,
        });
        const exact = calculateProcessExact(smallEngine, project);
        expect(exact.probability).toBeCloseTo(expected, 12);
        expect(exact.meanCost).toBeCloseTo(60, 12);
        expect(exact.spending[costs[0]!.id]).toBeCloseTo(costs[0]!.amount, 8);
        expect(exact.spending[costs[1]!.id]).toBeCloseTo(costs[1]!.amount, 12);
        const simulation = new CraftingSimulation(smallCatalog, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        const result = simulation.result();
        expect(Math.abs(result.probability - expected)).toBeLessThan(0.035);
        expect(result.meanCost).toBeCloseTo(60, 12);
        expect(result.errors).toEqual({});
        expect(result.spending[costs[0]!.id]).toBe(costs[0]!.amount * project.iterations);
        expect(result.spending[costs[1]!.id]).toBe(costs[1]!.amount * project.iterations);
    });
});

describe("extracted Harvest conversions", () => {
    it("converts to the extracted equivalent tier, rerolls its value and charges lifeforce", () => {
        const item = engine.addStartingMod(
            engine.createItem(baseId),
            "FireResist6",
            seededRandom(1),
        );
        const before = structuredClone(item);
        const result = engine.apply(item, conversion, {
            pick: (choices) => choices[0]!.value,
            integer: (_min, max) => max,
        });
        expect(item).toEqual(before);
        expect(result.item.mods).toEqual([
            {
                id: "ColdResist6",
                values: engine.mod("ColdResist6").stats.map((stat) => stat.max),
                crafted: false,
                fractured: false,
            },
        ]);
        const recipe = catalog.crafting.harvest.find((entry) => entry.id === conversion.id)!;
        expect(result.cost[0]!.amount).toBe(recipe.lifeforce);
        expect(engine.harvestSupported(conversion.id)).toBe(true);
    });

    it("preserves crafted state and supports magic items", () => {
        const recipe = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                entry.itemClasses.includes(engine.base(engine.createItem(baseId)).item_class) &&
                engine.mod(entry.mod).type === "FireResistance",
        )!;
        const item = engine.apply(
            { ...engine.createItem(baseId), rarity: "magic" },
            { kind: "bench", id: recipe.id },
            seededRandom(1),
        ).item;
        const result = engine.apply(item, conversion, seededRandom(2)).item;
        expect(result.rarity).toBe("magic");
        expect(result.mods[0]!.crafted).toBe(true);
        expect(engine.mod(result.mods[0]!.id).implicit_tags).toContain("cold");
    });

    it("rejects fractured, locked and group-blocked conversions", () => {
        const item = engine.addStartingMod(
            engine.createItem(baseId),
            "FireResist6",
            seededRandom(1),
        );
        const fractured = { ...item, mods: item.mods.map((mod) => ({ ...mod, fractured: true })) };
        expect(() => engine.apply(fractured, conversion, seededRandom(1))).toThrow("No eligible");
        const blocked = engine.addStartingMod(item, "ColdResist1", seededRandom(1));
        expect(() => engine.apply(blocked, conversion, seededRandom(1))).toThrow("No eligible");
        const lock = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_change_suffixes"),
        )!;
        const locked = engine.apply(item, { kind: "bench", id: lock.id }, seededRandom(1)).item;
        expect(() => engine.apply(locked, conversion, seededRandom(1))).toThrow("No eligible");
    });

    it("uses the extracted elemental damage mappings on weapons", () => {
        const weapon = Object.entries(catalog.bases).find(
            ([, base]) => base.item_class === "One Hand Sword",
        )![0];
        const empty = { ...engine.createItem(weapon), rarity: "rare" as const };
        const candidate = engine
            .pool(empty)
            .find(
                (entry) =>
                    entry.mod.type === "LocalFireDamage" &&
                    catalog.crafting.modEquivalencies.some((group) =>
                        group.mods.includes(entry.id),
                    ),
            )!;
        const equivalency = catalog.crafting.modEquivalencies.find((group) =>
            group.mods.includes(candidate.id),
        )!;
        const expected = equivalency.mods.find((id) =>
            engine.mod(id).implicit_tags.includes("cold"),
        )!;
        const item = engine.addStartingMod(empty, candidate.id, seededRandom(1));
        const result = engine.apply(
            item,
            { kind: "harvest", id: "ChangeFireToColdDamage" },
            seededRandom(2),
        ).item;
        expect(result.mods[0]!.id).toBe(expected);
    });
});
