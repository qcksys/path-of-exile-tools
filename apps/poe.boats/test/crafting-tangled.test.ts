import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { tangledFossilOutcomes } from "../app/lib/crafting-fossils";
import { FossilOptimizer } from "../app/lib/crafting-optimizer";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { type CraftingMethod, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const fossil = (name: string) =>
    catalog.crafting.fossils.find((entry) => entry.name === `${name} Fossil`)!;
const tangled = fossil("Tangled");
const outcomes = tangledFossilOutcomes(catalog);
const pair = (positive: string, negative: string) =>
    outcomes.find(
        (entry) => entry.positive[0]!.tag === positive && entry.negative[0]!.tag === negative,
    )!.id;
const method = (
    positive = "life",
    negative = "resistance",
    names: string[] = [],
    normal = false,
): Extract<CraftingMethod, { kind: "fossils" }> => ({
    kind: "fossils",
    ids: [tangled.id, ...names.map((name) => fossil(name).id)],
    tangled: pair(positive, negative),
    logic: "additive",
    resonator: catalog.crafting.currencies.find(
        (entry) =>
            entry.action === (normal ? "delve_currency_upgrade" : "delve_currency_reroll") &&
            entry.id.endsWith(String(names.length + 1)),
    )!.id,
});
const blank = () => ({ ...engine.createItem(baseId), rarity: "rare" as const });

describe("Tangled Fossil revealed effects", () => {
    it("uses the extracted boosted and blocked types, including hybrid modifiers and independent pool caches", () => {
        const item = blank();
        const ordinary = engine.pool(item);
        const pool = (
            positive: string,
            negative: string,
            names: string[] = [],
            logic: "additive" | "multiplicative" = "additive",
        ) =>
            engine.pool(item, {
                fossils: method(positive, negative, names).ids,
                tangled: pair(positive, negative),
                logic,
            });
        const boosted = pool("life", "resistance");
        expect(boosted.length).toBeLessThan(ordinary.length);
        expect(boosted.some((entry) => entry.mod.implicit_tags.includes("life"))).toBe(true);
        for (const entry of ordinary) {
            const tags = entry.mod.implicit_tags;
            const actual = boosted.find((candidate) => candidate.id === entry.id);
            if (tags.includes("resistance")) expect(actual).toBeUndefined();
            else expect(actual?.weight).toBe(entry.weight * (tags.includes("life") ? 30 : 1));
        }
        const life = ordinary.find((entry) => entry.id === "IncreasedLife1")!;
        expect(
            pool("life", "resistance", ["Pristine"]).find((entry) => entry.id === life.id)?.weight,
        ).toBe(life.weight * 40);
        expect(
            pool("life", "resistance", ["Pristine"], "multiplicative").find(
                (entry) => entry.id === life.id,
            )?.weight,
        ).toBe(life.weight * 300);
        expect(
            pool("resistance", "life").some((entry) => entry.mod.implicit_tags.includes("life")),
        ).toBe(false);
        expect(
            pool("resistance", "cold").some((entry) => entry.mod.implicit_tags.includes("cold")),
        ).toBe(false);
        expect(pool("life", "resistance")).toEqual(boosted);
        expect(engine.pool(item)).toEqual(ordinary);
    });

    it.each([
        false,
        true,
    ])("crafts with the selected pair and charges physical ingredients (normal: %s)", (normal) => {
        const selected = method("life", "resistance", [], normal);
        const item = normal ? engine.createItem(baseId) : blank();
        const eligible = new Set(
            engine
                .pool(blank(), { fossils: selected.ids, tangled: selected.tangled })
                .map((entry) => entry.id),
        );
        for (let seed = 0; seed < 20; seed++) {
            const result = engine.apply(item, selected, seededRandom(seed));
            expect(result.item.rarity).toBe("rare");
            expect(result.item.mods.length).toBeGreaterThanOrEqual(4);
            expect(result.item.mods.every((entry) => eligible.has(entry.id))).toBe(true);
            expect(result.item.mods.some((entry) => tangled.added.includes(entry.id))).toBe(false);
            expect(engine.validateItem(result.item)).toEqual(result.item);
        }
        expect(engine.costs(selected, item).map(({ id, amount }) => ({ id, amount }))).toEqual([
            { id: tangled.id, amount: 1 },
            { id: selected.resonator, amount: 1 },
        ]);
        expect(engine.methodName(selected)).toContain("Tangled Fossil");
        for (const description of engine.fossil(selected.tangled!).descriptions)
            expect(engine.methodName(selected)).toContain(description);
    });

    it("rejects missing, unrelated and standalone outcome records before random selection", () => {
        const valid = method();
        for (const selected of [
            { ...valid, tangled: undefined },
            { ...valid, tangled: fossil("Pristine").id },
            { ...valid, ids: [fossil("Pristine").id] },
            { ...valid, ids: [valid.tangled!], tangled: undefined },
        ]) {
            const random = seededRandom(1);
            const pick = vi.spyOn(random, "pick");
            const integer = vi.spyOn(random, "integer");
            expect(() => engine.apply(blank(), selected, random)).toThrow();
            expect(pick).not.toHaveBeenCalled();
            expect(integer).not.toHaveBeenCalled();
        }
        expect(engine.availableFossils(blank())).toContainEqual(tangled);
        expect(engine.availableFossils(blank()).some((entry) => outcomes.includes(entry))).toBe(
            false,
        );
    });

    it("shares the selected pair with Glyphic guarantees, exact odds, saved processes and sampled trials", () => {
        const bodyMods = catalog.crafting.essences
            .filter((entry) => entry.corrupted)
            .map((entry) => entry.mods["Body Armour"]!);
        const critical = bodyMods.find((id) => engine.mod(id).implicit_tags.includes("critical"))!;
        const ids = [
            ...bodyMods,
            "IncreasedLife1",
            "LocalIncreasedPhysicalDamageReductionRating1",
            "ColdResist1",
        ];
        const reduced = {
            ...catalog,
            mods: Object.fromEntries(ids.map((id) => [id, catalog.mods[id]!])),
        };
        const crafting = new CraftingEngine(reduced);
        const selected = method("critical", "fire", ["Glyphic"]);
        const target = crafting.validateTarget({ groups: [{ mods: [critical] }] });
        const pool = crafting.corruptedEssencePool(blank(), {
            fossils: selected.ids,
            tangled: selected.tangled,
        });
        expect(pool.map((entry) => entry.weight).sort((a, b) => a - b)).toEqual([1, 1, 1, 30]);
        expect(calculateExact(crafting, blank(), selected, target).probability).toBeCloseTo(
            30 / 33,
            12,
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: blank(),
            target,
            method: selected,
            steps: [{ id: "tangled", method: selected, condition: target }],
            prices: Object.fromEntries([...selected.ids, selected.resonator].map((id) => [id, 2])),
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project))).method).toEqual(
            selected,
        );
        expect(calculateProcessExact(crafting, project)).toMatchObject({
            probability: expect.closeTo(30 / 33, 12),
            meanCost: expect.closeTo(6),
        });
        const simulation = new CraftingSimulation(reduced, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(30 / 33, 1);
        expect(simulation.result().errors).toEqual({});
    });

    it("retains a fixed pair only on optimizer combinations containing Tangled", () => {
        const selected = method();
        const options = {
            fossils: [tangled.id, fossil("Pristine").id],
            maxSockets: 2,
            trials: 100,
            logic: selected.logic,
            tangled: selected.tangled,
        };
        const prices = Object.fromEntries(
            [...catalog.crafting.currencies, tangled, fossil("Pristine")].map((entry) => [
                entry.id,
                1,
            ]),
        );
        const target = engine.validateTarget({ groups: [], rarity: "rare" });
        const optimizer = new FossilOptimizer(engine, blank(), target, prices, 13, options);
        optimizer.runBatch(300);
        expect(optimizer.result()).toMatchObject({ completed: 3, failed: 0 });
        for (const candidate of optimizer.result().byAttempts) {
            expect(candidate.method.tangled).toBe(
                candidate.method.ids.includes(tangled.id) ? selected.tangled : undefined,
            );
            expect(candidate.cost).toBe(candidate.method.ids.length + 1);
        }
        expect(
            () =>
                new FossilOptimizer(engine, blank(), target, prices, 13, {
                    ...options,
                    tangled: undefined,
                }),
        ).toThrow("revealed Tangled");
    });
});
