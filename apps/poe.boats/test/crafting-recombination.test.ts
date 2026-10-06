import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
    craftingTargetSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const empty = () => engine.createItem(baseId);
const life = "IncreasedLife1";
const resist = engine
    .pool({ ...empty(), rarity: "rare" })
    .find(
        (entry) =>
            entry.mod.generation_type === "suffix" &&
            entry.mod.stats.some((stat) => stat.id === "base_fire_damage_resistance_%"),
    )!.id;
const withMod = (id: string, item = empty()) => ({
    ...engine.addStartingMod(item, id, seededRandom(42)),
    rarity: "magic" as const,
});
const method = (item: CraftingItem): Extract<CraftingMethod, { kind: "recombine" }> => ({
    kind: "recombine",
    id: "recombine",
    donor: { id: "donor-one", name: "Recombination donor", item },
});
const target = craftingTargetSchema.parse({ groups: [{ mods: [life] }, { mods: [resist] }] });

describe("crafting workbench recombination", () => {
    it("retains only the surviving base's strands without consuming them or restricting transferred tiers", () => {
        const left = { ...withMod(life), memoryStrands: 82, quality: 20 };
        const right = { ...withMod(resist), memoryStrands: 22, quality: 10 };
        const outcomes = recombinationOutcomes(engine, left, right);
        for (const { value } of outcomes) {
            expect(value.memoryStrands).toBe(value.quality === 20 ? 82 : 22);
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, value)).map(
                    (entry) => entry.item,
                ),
            ).toContainEqual(value);
        }
        expect(
            outcomes.some(
                ({ value }) =>
                    value.memoryStrands === 82 && value.mods.some((mod) => mod.id === life),
            ),
        ).toBe(true);
        const requirement = craftingTargetSchema.parse({
            ...target,
            memoryStrands: { min: 82, max: 82 },
        });
        const craft = method(right);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: left,
            method: craft,
            target: requirement,
            steps: [{ id: "combine", method: craft, condition: requirement }],
            useProcess: true,
            prices: { "service:recombine": 2, "donor:donor-one": 4 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        expect(calculateProcessExact(engine, project).probability).toBeCloseTo(1 / 6);
        const simulation = new CraftingSimulation(catalog, project);
        for (let i = 0; i < 1000; i++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ errors: {}, meanCost: 6 });
        expect(simulation.result().probability).toBeGreaterThan(0.13);
        expect(simulation.result().probability).toBeLessThan(0.2);
        expect(left.memoryStrands).toBe(82);
        expect(right.memoryStrands).toBe(22);
    });

    it.each([
        0, 1, 2, 3, 4, 5,
    ])("uses extracted tags for influence %s without transferring the influence itself", (influence) => {
        const influenced = { ...empty(), rarity: "rare" as const, influences: [influence] };
        const prefix = engine
            .pool(influenced, { influence })
            .find((entry) => entry.mod.generation_type === "prefix")!.id;
        const left = withMod(prefix, influenced);
        const right = withMod(resist);
        const requirement = craftingTargetSchema.parse({
            groups: [{ mods: [prefix] }, { mods: [resist] }],
        });
        const outcomes = recombinationOutcomes(engine, left, right);
        expect(
            outcomes
                .filter(({ value }) => value.influences.length)
                .reduce((sum, entry) => sum + entry.weight, 0),
        ).toBeCloseTo(0.5);
        for (const { value } of outcomes) {
            if (value.mods.some((mod) => mod.id === prefix))
                expect(value.influences).toEqual([influence]);
            expect(engine.validateItem(value)).toEqual(value);
        }
        expect(calculateExact(engine, left, method(right), requirement).probability).toBeCloseTo(
            1 / 6,
        );
        expect(
            calculateExact(engine, left, method({ ...right, influences: [influence] }), requirement)
                .probability,
        ).toBeCloseTo(1 / 3);
    });

    it("retains the chosen influence set and converts Awakener provenance for a single-influence output", () => {
        const dual = { ...empty(), rarity: "rare" as const, influences: [0, 1] };
        const prefix = engine
            .pool(dual, { influence: 0 })
            .find((entry) => entry.mod.generation_type === "prefix")!.id;
        const left = withMod(prefix, dual);
        left.mods[0]!.origin = { kind: "awakener", level: 86 };
        const right = { ...withMod(resist), influences: [0], quality: 20 };
        const outcomes = recombinationOutcomes(engine, left, right);
        const transferred = outcomes.find(
            ({ value }) => value.quality === 20 && value.mods.some((mod) => mod.id === prefix),
        )!.value;
        expect(transferred.influences).toEqual([0]);
        expect(transferred.mods.find((mod) => mod.id === prefix)!.origin).toEqual({
            kind: "recombine",
            level: 86,
        });
        expect(engine.validateItem(transferred)).toEqual(transferred);
        for (const { value } of outcomes)
            expect(value.influences).toEqual(value.quality === 20 ? [0] : [0, 1]);
    });

    it("uses innate Astrolabe influence tags only while that base survives", () => {
        const astrolabe = Object.keys(catalog.bases).find(
            (id) => catalog.bases[id]!.name === "Astrolabe Amulet",
        )!;
        const otherBase = Object.keys(catalog.bases).find(
            (id) =>
                catalog.bases[id]!.item_class === "Amulet" &&
                !engine.hasFixedInfluences(engine.createItem(id)),
        )!;
        const fixed = { ...engine.createItem(astrolabe), rarity: "rare" as const };
        const prefix = engine
            .pool(fixed, { influence: 0 })
            .find((entry) => entry.mod.generation_type === "prefix")!.id;
        const left = withMod(prefix, fixed);
        const right = engine.createItem(otherBase);
        const outcomes = recombinationOutcomes(engine, left, right);
        expect(outcomes.some(({ value }) => value.mods.some((mod) => mod.id === prefix))).toBe(
            true,
        );
        for (const { value } of outcomes) {
            expect(value.influences).toEqual([]);
            expect(value.implicits).toEqual(
                value.baseId === astrolabe ? left.implicits : right.implicits,
            );
            if (value.baseId !== astrolabe) expect(value.mods).toEqual([]);
        }
    });

    it("keeps fractures eligible only on their own input, even when both inputs use the same base", () => {
        const left = { ...withMod(life), quality: 20 };
        const right = { ...withMod(resist), quality: 10 };
        left.mods[0]!.fractured = true;
        right.mods[0]!.fractured = true;
        const outcomes = recombinationOutcomes(engine, left, right);
        for (const { value } of outcomes) {
            expect(value.mods.length).toBeLessThanOrEqual(1);
            expect(value.mods).toEqual(
                value.mods.length ? (value.quality === 20 ? left.mods : right.mods) : [],
            );
        }
        expect(outcomes.some(({ value }) => value.mods.length === 0)).toBe(true);
        const requirement = craftingTargetSchema.parse({
            groups: [{ mods: [life], fractured: true }],
        });
        expect(calculateExact(engine, left, method(right), requirement).probability).toBeCloseTo(
            1 / 3,
        );
        const ordinaryCopy = withMod(life);
        expect(
            calculateExact(engine, left, method(ordinaryCopy), requirement).probability,
        ).toBeCloseTo(0.25);
    });

    it("retains a fractured high-level modifier on its original base at the new lower item level", () => {
        const high = { ...empty(), quality: 20, rarity: "rare" as const };
        const highLife = engine
            .pool(high)
            .find(
                (entry) =>
                    entry.mod.required_level > 70 &&
                    entry.mod.stats.length === 1 &&
                    entry.mod.stats[0]!.id === "base_maximum_life",
            )!;
        high.mods = [{ ...engine.rollMod(highLife.id, seededRandom(42)), fractured: true }];
        const low = engine.createItem(baseId, 1);
        const outcomes = recombinationOutcomes(engine, high, low);
        const retained = outcomes.find(({ value }) => value.mods.length)!.value;
        expect(retained).toMatchObject({ quality: 20, level: 45 });
        expect(retained.mods[0]).toMatchObject({
            fractured: true,
            origin: { kind: "recombine", level: 86 },
        });
        expect(engine.validateItem(retained)).toEqual(retained);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, retained)).map(
                (entry) => entry.item,
            ),
        ).toContainEqual(retained);
        expect(
            outcomes
                .filter(({ value }) => value.quality === 0)
                .every(({ value }) => value.mods.length === 0),
        ).toBe(true);
    });

    it("allows Unravelling after recombination while preserving retained fractures", () => {
        const left = { ...withMod(life), memoryStrands: 82 };
        left.mods[0]!.fractured = true;
        const right = withMod(resist);
        const combined = recombinationOutcomes(engine, left, right).find(
            ({ value }) => value.memoryStrands === 82 && value.mods.length === 2,
        )!.value;
        const result = engine.apply(
            combined,
            currency("consume_zana_influence_upgrade_mods"),
            seededRandom(42),
        );
        expect(result.item.mods.find((mod) => mod.fractured)).toEqual(left.mods[0]);
        expect(result.item.mods).toHaveLength(2);
        expect(result.item.memoryStrands).toBeUndefined();
        expect(combined.memoryStrands).toBe(82);
        expect(engine.validateItem(result.item)).toEqual(result.item);
    });

    it("uses the shared isolated opposite-side model and preserves exact modifier values", () => {
        const left = withMod(life);
        const right = withMod(resist);
        const before = structuredClone({ left, right });
        const outcomes = recombinationOutcomes(engine, left, right);
        expect(outcomes.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1);
        expect(calculateExact(engine, left, method(right), target).probability).toBeCloseTo(1 / 3);
        for (const { value } of outcomes) {
            expect(value.rarity).toBe("rare");
            expect(value.mods.length).toBeGreaterThan(0);
            for (const mod of value.mods) expect([...left.mods, ...right.mods]).toContainEqual(mod);
        }
        expect({ left, right }).toEqual(before);
    });

    it("keeps distinct rolls of a duplicated modifier as separate equally likely outcomes", () => {
        const low = withMod(life);
        const high = withMod(life);
        low.mods[0]!.values = [catalog.mods[life]!.stats[0]!.min];
        high.mods[0]!.values = [catalog.mods[life]!.stats[0]!.max];
        const requirement = craftingTargetSchema.parse({
            groups: [],
            stats: [{ id: "base_maximum_life", min: high.mods[0]!.values[0], scope: "explicit" }],
        });
        expect(calculateExact(engine, low, method(high), requirement).probability).toBeCloseTo(0.5);
        const random = seededRandom(42);
        const first = engine.apply(low, method(high), random);
        first.item.mods[0]!.values[0] = 999;
        expect(engine.apply(low, method(high), seededRandom(42)).item.mods[0]!.values[0]).not.toBe(
            999,
        );
    });

    it("selects all surviving base properties together and excludes non-native modifiers", () => {
        const intBase = Object.entries(catalog.bases).find(
            ([, entry]) =>
                entry.item_class === "Body Armour" &&
                entry.tags.includes("int_armour") &&
                !entry.implicits.length,
        )![0];
        const left = { ...withMod(life), quality: 20, sockets: 4 };
        const right = { ...engine.createItem(intBase), quality: 10, sockets: 2 };
        const armour = engine
            .pool({ ...empty(), rarity: "rare" })
            .find((entry) =>
                entry.mod.stats.some(
                    (stat) => stat.id === "local_base_physical_damage_reduction_rating",
                ),
            )!;
        left.mods = [engine.rollMod(armour.id, seededRandom(42))];
        const outcomes = recombinationOutcomes(engine, left, right);
        expect(
            outcomes
                .filter((entry) => entry.value.baseId === left.baseId)
                .reduce((sum, entry) => sum + entry.weight, 0),
        ).toBeCloseTo(0.5);
        for (const { value } of outcomes) {
            const parent = value.baseId === left.baseId ? left : right;
            expect(value.quality).toBe(parent.quality);
            expect(value.sockets).toBe(parent.sockets);
            expect(value.implicits).toEqual(parent.implicits);
            if (value.baseId === right.baseId) expect(value.mods).toEqual([]);
        }
    });

    it("retains transferred high-level tiers at the averaged level through subsequent crafts and text/JSON", () => {
        const high = engine.createItem(baseId, 86);
        const highLife = engine
            .pool({ ...high, rarity: "rare" })
            .find(
                (entry) =>
                    entry.mod.required_level > 70 &&
                    entry.mod.stats.length === 1 &&
                    entry.mod.stats[0]!.id === "base_maximum_life",
            )!;
        high.mods = [engine.rollMod(highLife.id, seededRandom(42))];
        high.rarity = "magic";
        const low = engine.createItem(baseId, 1);
        const outcome = recombinationOutcomes(engine, low, high).find(
            (entry) => entry.value.mods.length,
        )!.value;
        expect(outcome.level).toBe(45);
        expect(outcome.mods[0]!.origin).toEqual({ kind: "recombine", level: 86 });
        expect(outcome.mods[0]!.values).toEqual(high.mods[0]!.values);
        expect(engine.validateItem(JSON.parse(JSON.stringify(outcome)))).toEqual(outcome);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, outcome)).some(
                (entry) => JSON.stringify(entry.item) === JSON.stringify(outcome),
            ),
        ).toBe(true);
        expect(() =>
            importCraftingItemText(
                engine,
                exportCraftingItemText(engine, outcome).replace(
                    /\{origin:[^}]+\}/g,
                    `{origin:${encodeURIComponent(JSON.stringify({ kind: "recombine", level: 1 }))}}`,
                ),
            ),
        ).toThrow();
        const divine = engine.apply(outcome, currency("reroll_mod_values"), seededRandom(42)).item;
        expect(divine.mods[0]!.origin).toEqual(outcome.mods[0]!.origin);
        const rerolled = engine.apply(outcome, currency("reroll"), seededRandom(42)).item;
        expect(
            rerolled.mods.every(
                (entry) => !entry.origin && catalog.mods[entry.id]!.required_level <= 45,
            ),
        ).toBe(true);
    });

    it("supports prepared unveiled crafts on either side and rejects unsupported exclusive combinations", () => {
        const crafts = catalog.crafting.bench.filter(
            (entry) =>
                entry.mod &&
                entry.itemClasses.includes("Body Armour") &&
                catalog.mods[entry.mod]!.implicit_tags.includes("unveiled_mod"),
        );
        const prepare = (item: CraftingItem, side: string) => {
            const recipe = crafts.find(
                (entry) =>
                    catalog.mods[entry.mod!]!.generation_type === side &&
                    !item.mods.some((rolled) =>
                        catalog.mods[rolled.id]!.groups.some((group) =>
                            catalog.mods[entry.mod!]!.groups.includes(group),
                        ),
                    ),
            )!;
            return engine.apply(item, { kind: "bench", id: recipe.id }, seededRandom(42)).item;
        };
        const left = prepare(withMod(life), "suffix");
        const right = prepare(withMod(resist), "prefix");
        const outcomes = recombinationOutcomes(engine, left, right);
        expect(outcomes.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1);
        expect(
            outcomes.every(
                (entry) => entry.value.mods.filter((rolled) => rolled.crafted).length <= 1,
            ),
        ).toBe(true);
        expect(calculateExact(engine, left, method(right), target).probability).toBeGreaterThan(
            1 / 3,
        );
        const sameSide = recombinationOutcomes(engine, left, left);
        expect(sameSide.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1);
        expect(
            sameSide.every(
                (entry) => entry.value.mods.filter((rolled) => rolled.crafted).length <= 1,
            ),
        ).toBe(true);
        const rare = { ...left, rarity: "rare" as const };
        const extra = engine.pool(rare).find((entry) => entry.mod.generation_type === "prefix")!;
        const unsupported = engine.addStartingMod(rare, extra.id, seededRandom(42));
        expect(() => recombinationOutcomes(engine, unsupported, left)).toThrow(
            "exclusive modifier",
        );
    });

    it("accounts for service and donor costs in conditional calculations and seeded simulation", () => {
        const left = withMod(life);
        const craft = method(withMod(resist));
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: left,
            method: craft,
            target,
            steps: [{ id: "combine", method: craft, condition: target }],
            useProcess: true,
            prices: { "service:recombine": 2, "donor:donor-one": 4 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(1 / 3);
        expect(exact.meanCost).toBeCloseTo(6);
        const simulation = new CraftingSimulation(catalog, project);
        for (let i = 0; i < 1000; i++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            meanCost: 6,
            errors: {},
            spending: { "service:recombine": 1000, "donor:donor-one": 1000 },
        });
        expect(simulation.result().probability).toBeGreaterThan(0.29);
        expect(simulation.result().probability).toBeLessThan(0.38);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("rejects missing donors, incompatible classes and unresolved input states before drawing randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(empty(), { kind: "recombine", id: "recombine" }, random)).toThrow(
            "donor item",
        );
        for (const state of [{ corrupted: true }, { mirrored: true }, { imprint: empty() }])
            expect(() =>
                engine.apply({ ...withMod(life), ...state }, method(withMod(resist)), random),
            ).toThrow();
        const ring = Object.keys(catalog.bases).find(
            (id) => catalog.bases[id]!.item_class === "Ring",
        )!;
        expect(() => engine.apply(empty(), method(engine.createItem(ring)), random)).toThrow(
            "same item class",
        );
        const poe2 = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        expect(() => new CraftingEngine(poe2).validateMethod(method(withMod(resist)))).toThrow(
            "only in PoE 1",
        );
        expect(pick).not.toHaveBeenCalled();
    });
});
