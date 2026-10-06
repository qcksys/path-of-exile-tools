import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { FossilOptimizer } from "../app/lib/crafting-optimizer";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingMethod,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const fossil = (name: string) =>
    catalog.crafting.fossils.find((entry) => entry.name === `${name} Fossil`)!;
const sanctified = fossil("Sanctified");
const method = (
    names = ["Sanctified"],
    normal = false,
): Extract<CraftingMethod, { kind: "fossils" }> => ({
    kind: "fossils",
    ids: names.map((name) => fossil(name).id),
    resonator: catalog.crafting.currencies.find(
        (entry) =>
            entry.action === (normal ? "delve_currency_upgrade" : "delve_currency_reroll") &&
            entry.id.endsWith(String(names.length)),
    )!.id,
    logic: "additive",
});
const blank = (level = 86) => ({ ...engine.createItem(baseId, level), rarity: "rare" as const });

describe("Sanctified Fossil", () => {
    it("adjusts extracted level weights before generation weights without changing cached natural pools", () => {
        expect(sanctified.lucky).toBe(true);
        expect(engine.availableFossils(blank())).toContainEqual(sanctified);
        let generated = 0;
        let low = 0;
        let high = 0;
        for (const itemClass of ["Body Armour", "Wand", "Ring", "Jewel"]) {
            const id = Object.entries(catalog.bases).find(
                ([, base]) =>
                    base.item_class === itemClass &&
                    !base.corrupted &&
                    base.rarities.includes("rare"),
            )![0];
            const item = { ...engine.createItem(id), rarity: "rare" as const };
            const natural = engine.pool(item);
            const tags = new Set(engine.base(item).tags);
            const pool = engine.pool(item, { fossils: [sanctified.id] });
            for (const entry of pool) {
                const weight = entry.mod.spawn_weights.find((rule) => tags.has(rule.tag))!.weight;
                const generation =
                    entry.mod.generation_weights.find((rule) => tags.has(rule.tag))?.weight ?? 100;
                expect(entry.weight).toBe(
                    Math.round(
                        (Math.round((weight * (60 + entry.mod.required_level)) / 100) *
                            generation) /
                            100,
                    ),
                );
                if (generation !== 100) generated++;
                if (entry.mod.required_level === 1 && weight === 1000) {
                    expect(entry.weight).toBe(Math.round((610 * generation) / 100));
                    low++;
                }
                if (entry.mod.required_level === 84 && weight === 1000) {
                    expect(entry.weight).toBe(Math.round((1440 * generation) / 100));
                    high++;
                }
            }
            expect(engine.pool(item)).toEqual(natural);
        }
        expect(generated).toBeGreaterThan(0);
        expect(low).toBeGreaterThan(0);
        expect(high).toBeGreaterThan(0);
    });

    it("composes additive and multiplicative tag weights, exclusions and item-level eligibility", () => {
        const item = blank(40);
        const names = ["Sanctified", "Pristine", "Aetheric", "Serrated"];
        for (const logic of ["additive", "multiplicative"] as const) {
            const selection = names.map(fossil);
            const pool = engine.pool(item, { fossils: selection.map((entry) => entry.id), logic });
            expect(pool.length).toBeGreaterThan(0);
            for (const entry of pool) {
                expect(entry.mod.required_level).toBeLessThanOrEqual(40);
                expect(entry.mod.implicit_tags).not.toContain("defences");
                const tags = new Set(engine.base(item).tags);
                const weight = entry.mod.spawn_weights.find((rule) => tags.has(rule.tag))!.weight;
                const up = selection.flatMap((f) => {
                    const rule = f.positive.find((rule) =>
                        entry.mod.implicit_tags.includes(rule.tag),
                    );
                    return rule ? [rule.weight / 100] : [];
                });
                const down = selection.reduce(
                    (factor, f) =>
                        (factor *
                            (f.negative.find((rule) => entry.mod.implicit_tags.includes(rule.tag))
                                ?.weight ?? 100)) /
                        100,
                    1,
                );
                const positive = !up.length
                    ? 1
                    : logic === "additive"
                      ? up.reduce((a, b) => a + b, 0)
                      : up.reduce((a, b) => a * b, 1);
                expect(entry.weight).toBe(
                    Math.round(
                        Math.round((weight * (60 + entry.mod.required_level)) / 100) *
                            down *
                            positive,
                    ),
                );
            }
        }
    });

    it("rolls ordinary stats twice while guarantees keep their usual rolls regardless of fossil order", () => {
        for (const names of [
            ["Sanctified", "Glyphic", "Hollow"],
            ["Hollow", "Glyphic", "Sanctified"],
        ]) {
            const model = new CraftingEngine(catalog);
            const spy = vi.spyOn(model, "rollMod");
            const result = model.apply(blank(), method(names), seededRandom(42));
            const forced = new Set([
                ...fossil("Hollow").forced,
                ...catalog.crafting.essences
                    .filter((entry) => entry.corrupted)
                    .map((entry) => entry.mods["Body Armour"]!),
            ]);
            expect(result.item.mods.some((entry) => forced.has(entry.id))).toBe(true);
            for (const [id, , , lucky] of spy.mock.calls)
                expect(Boolean(lucky)).toBe(!forced.has(id));
            expect(spy.mock.calls.some(([, , , lucky]) => lucky)).toBe(true);
        }
        const random = seededRandom(42);
        const integer = vi
            .spyOn(random, "integer")
            .mockImplementationOnce((min) => min)
            .mockImplementationOnce((_, max) => max);
        const result = engine.rollMod("IncreasedLife1", random, {}, true);
        expect(result.values).toEqual([engine.mod("IncreasedLife1").stats[0]!.max]);
        expect(integer).toHaveBeenCalledTimes(2);
    });

    it("preserves fractures, quality and strands while sharing ordinary luck with Fractured Fossil", () => {
        const item = engine.addStartingMod(blank(), "ColdResist1", seededRandom(1));
        item.mods[0]!.fractured = true;
        item.quality = 20;
        item.memoryStrands = 82;
        const before = structuredClone(item);
        const result = engine.apply(item, method(), seededRandom(42));
        expect(result.item.mods).toContainEqual(item.mods[0]);
        expect(result.item).toMatchObject({ quality: 20, memoryStrands: 82 });
        expect(item).toEqual(before);
        expect(result.cost.map((entry) => entry.id)).toEqual([sanctified.id, method().resonator]);
        const fractured = engine.apply(
            blank(),
            method(["Sanctified", "Fractured"]),
            seededRandom(42),
        );
        expect(fractured.item.mods.filter((entry) => entry.fractured)).toHaveLength(1);
        const parsed = importCraftingItemText(
            engine,
            exportCraftingItemText(engine, result.item),
        )[0]!;
        expect(parsed.item?.mods).toEqual(result.item.mods);
        expect(parsed.item?.quality).toBe(20);
        expect(parsed.item?.memoryStrands).toBe(82);
    });

    it("enumerates lucky numeric targets and costs in calculations, processes and optimizer candidates", () => {
        const data = {
            ...catalog,
            mods: Object.fromEntries([["IncreasedLife1", catalog.mods.IncreasedLife1!]]),
        };
        const model = new CraftingEngine(data);
        const stat = model.mod("IncreasedLife1").stats[0]!;
        const count = stat.max - stat.min + 1;
        const target = model.validateTarget({
            groups: [{ mods: ["IncreasedLife1"] }],
            stats: [{ id: stat.id, min: stat.max }],
        });
        const probability = 1 - ((count - 1) / count) ** 2;
        expect(calculateExact(model, blank(), method(), target).probability).toBeCloseTo(
            probability,
        );
        expect(calculateExact(model, blank(), method(["Jagged"]), target).probability).toBeCloseTo(
            1 / count,
        );
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: blank(),
            method: method(),
            target,
            steps: [
                {
                    id: "roll",
                    method: method(),
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [sanctified.id]: 7, [fossil("Jagged").id]: 2, [method().resonator]: 1 },
            seed: 42,
            iterations: 2000,
            maxActions: 1,
        });
        expect(calculateProcessExact(model, project)).toMatchObject({
            probability: expect.closeTo(probability),
            meanCost: expect.closeTo(8),
        });
        const simulation = new CraftingSimulation(data, project);
        for (let i = 0; i < project.iterations; i++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(probability, 1);
        expect(simulation.result()).toMatchObject({ errors: {}, meanCost: 8 });
        const optimizer = new FossilOptimizer(model, project.item, target, project.prices, 42, {
            fossils: [sanctified.id, fossil("Jagged").id],
            maxSockets: 1,
            trials: 2000,
            logic: "additive",
        });
        while (!optimizer.runBatch()) {
            /* finish bounded trials */
        }
        expect(optimizer.result()).toMatchObject({ completed: 2, failed: 0, errors: [] });
        expect(optimizer.result().byAttempts[0]!.method.ids).toEqual([sanctified.id]);
        expect(optimizer.result().byCost[0]!.method.ids).toEqual([fossil("Jagged").id]);
        expect(optimizer.result().byAttempts[0]!.probability).toBeCloseTo(probability, 1);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("accepts both resonator rarities and rejects invalid items, combinations and PoE 2", () => {
        expect(
            engine.apply(engine.createItem(baseId), method(undefined, true), seededRandom(42)).item
                .rarity,
        ).toBe("rare");
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            { ...blank(), corrupted: true },
            { ...blank(), mirrored: true },
            { ...blank(), rarity: "magic" as const },
        ])
            expect(() => engine.apply(item, method(), random)).toThrow();
        expect(() =>
            engine.apply(blank(), { ...method(), ids: [sanctified.id, sanctified.id] }, random),
        ).toThrow();
        expect(() =>
            engine.apply(
                blank(),
                { ...method(), resonator: method(["Sanctified", "Jagged"]).resonator },
                random,
            ),
        ).toThrow();
        expect(pick).not.toHaveBeenCalled();
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const model = new CraftingEngine(data);
        expect(model.availableFossils(model.createItem(Object.keys(data.bases)[0]!))).toEqual([]);
        expect(() => model.validateMethod(method())).toThrow();
    });
});
