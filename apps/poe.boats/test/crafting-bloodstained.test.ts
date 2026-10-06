import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { gildedImplicitId } from "../app/lib/crafting-fossils";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { FossilOptimizer } from "../app/lib/crafting-optimizer";
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
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const fossil = (name: string) =>
    catalog.crafting.fossils.find((entry) => entry.name === `${name} Fossil`)!;
const method = (
    names = ["Bloodstained"],
    normal = false,
): Extract<CraftingMethod, { kind: "fossils" }> => ({
    kind: "fossils",
    ids: names.map((name) => fossil(name).id),
    logic: "additive",
    resonator: catalog.crafting.currencies.find(
        (entry) =>
            entry.action === (normal ? "delve_currency_upgrade" : "delve_currency_reroll") &&
            entry.id.endsWith(String(names.length)),
    )!.id,
});
const blank = (id = baseId, level = 86) => ({
    ...engine.createItem(id, level),
    rarity: "rare" as const,
});
const base = (name: string) =>
    Object.entries(catalog.bases).find(([, entry]) => entry.name === name)![0];

describe("Bloodstained Fossil and corrupted implicits", () => {
    it("uses build domains, item levels, ordered spawn and generation weights independently of fossil tags", () => {
        expect(fossil("Bloodstained").effects).toEqual(["CorruptedImplicit"]);
        for (const name of ["Plate Vest", "Coral Ring", "Driftwood Wand", "Cobalt Jewel"]) {
            for (const level of [1, 20, 86]) {
                const item = blank(base(name), level);
                const tags = new Set(engine.base(item).tags);
                const pool = engine.corruptedModifiers(item);
                expect(pool.length).toBeGreaterThan(0);
                for (const entry of pool) {
                    expect(entry.mod.domain).toBe(engine.base(item).domain);
                    expect(entry.mod.required_level).toBeLessThanOrEqual(level);
                    expect(entry.mod.maximum_level).toBeGreaterThanOrEqual(level);
                    expect(entry.weight).toBe(
                        ((entry.mod.spawn_weights.find((rule) => tags.has(rule.tag))?.weight ?? 0) *
                            (entry.mod.generation_weights.find((rule) => tags.has(rule.tag))
                                ?.weight ?? 100)) /
                            100,
                    );
                }
                expect(engine.corruptedModifiers(item)).toBe(pool);
            }
        }
        const low = engine.corruptedModifiers(blank(base("Coral Ring"), 1));
        const high = engine.corruptedModifiers(blank(base("Coral Ring"), 86));
        expect(high.length).toBeGreaterThan(low.length);
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        const model = new CraftingEngine(catalog);
        const roll = vi.spyOn(model, "rollMod");
        const result = model.apply(
            blank(),
            method(["Bloodstained", "Sanctified", "Pristine"]),
            random,
        );
        const implicit = result.item.implicits[0]!;
        const choices = pick.mock.calls.at(-1)![0];
        expect(choices).toEqual(
            model
                .corruptedModifiers(result.item)
                .map((entry) => ({ value: entry.id, weight: entry.weight })),
        );
        expect(roll.mock.calls.find(([id]) => id === implicit.id)?.[3]).toBeUndefined();
    });

    it("upgrades or rerolls before corrupting and replaces the native implicit", () => {
        for (const normal of [false, true]) {
            const item = {
                ...blank(base("Coral Ring")),
                rarity: normal ? ("normal" as const) : ("rare" as const),
            };
            const before = structuredClone(item);
            const result = engine.apply(item, method(undefined, normal), seededRandom(42));
            expect(result.item).toMatchObject({ rarity: "rare", corrupted: true });
            expect(result.item.implicits).toHaveLength(1);
            expect(engine.mod(result.item.implicits[0]!.id).generation_type).toBe("corrupted");
            expect(result.item.mods.length).toBeGreaterThanOrEqual(4);
            expect(result.cost.map((entry) => entry.id)).toEqual([
                fossil("Bloodstained").id,
                method(undefined, normal).resonator,
            ]);
            expect(item).toEqual(before);
            expect(() => engine.apply(result.item, currency("reroll"), seededRandom(42))).toThrow(
                "uncorrupted",
            );
            expect(() => engine.apply(result.item, method(), seededRandom(42))).toThrow(
                "uncorrupted",
            );
        }
    });

    it("chooses either native or Gilded implicit equally and adds Gilded after corruption in a combination", () => {
        const item = engine.addStartingMod(
            blank(base("Coral Ring")),
            gildedImplicitId,
            seededRandom(42),
        );
        const id = engine.corruptedModifiers(item)[0]!.id;
        for (const index of [0, 1]) {
            const random = seededRandom(42);
            const pick = vi
                .spyOn(random, "pick")
                .mockImplementation((choices) => choices[index]!.value);
            const result = engine.addStartingMod(item, id, random);
            expect(result.implicits).toContainEqual(item.implicits[1 - index]);
            expect(result.implicits.map((entry) => entry.id)).not.toContain(
                item.implicits[index]!.id,
            );
            expect(result.implicits.at(-1)!.id).toBe(id);
            expect(pick).toHaveBeenCalledExactlyOnceWith(
                item.implicits.map((entry) => ({ value: entry, weight: 1 })),
            );
        }
        const result = engine.apply(
            blank(base("Coral Ring")),
            method(["Gilded", "Bloodstained"]),
            seededRandom(42),
        ).item;
        expect(result.implicits).toHaveLength(2);
        expect(result.implicits.at(-1)!.id).toBe(gildedImplicitId);
        expect(engine.mod(result.implicits[0]!.id).generation_type).toBe("corrupted");
    });

    it("preserves locked implicits and their capacity, magnitude and influence rules", () => {
        for (const name of ["Astrolabe Amulet", "Helical Ring", "Simplex Amulet"]) {
            const item = blank(base(name));
            const result = engine.apply(item, method(), seededRandom(42)).item;
            expect(result.implicits).toHaveLength(2);
            expect(result.implicits).toContainEqual(item.implicits[0]);
            expect(engine.limits(result)).toEqual(engine.limits(item));
            expect(engine.effectiveInfluences(result)).toEqual(engine.effectiveInfluences(item));
            expect(() =>
                engine.validateItem({ ...result, implicits: result.implicits.slice(1) }),
            ).toThrow();
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
            ).toEqual(result);
        }
    });

    it("replaces one Eldritch implicit and preserves fossil guarantees, explicit fractures and strands", () => {
        let item: CraftingItem = blank(base("Wool Gloves"));
        item = engine.addStartingMod(
            item,
            "IncreasedAttackSpeedEldritchImplicit2",
            seededRandom(42),
        );
        item = engine.addStartingMod(
            item,
            "ChanceToSuppressSpellsEldritchImplicit2",
            seededRandom(42),
        );
        item.quality = 20;
        item.memoryStrands = 82;
        const result = engine.apply(
            item,
            method(["Bloodstained", "Hollow", "Glyphic", "Fractured"]),
            seededRandom(42),
        ).item;
        expect(result.implicits).toHaveLength(2);
        expect(
            result.implicits.filter((entry) =>
                item.implicits.some((prior) => prior.id === entry.id),
            ),
        ).toHaveLength(1);
        expect(result.mods.filter((entry) => entry.fractured)).toHaveLength(1);
        expect(result.mods.some((entry) => fossil("Hollow").forced.includes(entry.id))).toBe(true);
        expect(result).toMatchObject({ quality: 20, memoryStrands: 82, corrupted: true });
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
        ).toEqual(result);
    });

    it("rejects ineligible pools and malformed imported states before spending or randomness", () => {
        const item = blank(base("Coral Ring"));
        const id = engine
            .corruptedModifiers(item)
            .find((entry) => entry.mod.required_level > 1)!.id;
        const result = engine.addStartingMod(item, id, seededRandom(42));
        const implicit = result.implicits[0]!;
        for (const invalid of [
            { ...result, corrupted: false },
            { ...result, level: 1 },
            { ...result, implicits: [implicit, implicit] },
            { ...result, implicits: [{ ...implicit, fractured: true }] },
            { ...result, implicits: [{ ...implicit, crafted: true }] },
            { ...result, implicits: [] },
            { ...result, implicits: [{ ...implicit, values: implicit.values.map(() => 99999) }] },
        ])
            expect(() => engine.validateItem(invalid)).toThrow();
        const forbidden = Object.entries(catalog.bases).find(
            ([, entry]) =>
                entry.tags.includes("heist_equipment") && entry.rarities.includes("rare"),
        )![0];
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(blank(forbidden), method(), random)).toThrow();
        expect(() => engine.apply({ ...item, mirrored: true }, method(), random)).toThrow();
        expect(() => engine.addStartingMod(blank(base("Coral Ring"), 1), id, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const model = new CraftingEngine(data);
        expect(() => model.validateMethod(method())).toThrow();
    });

    it("shares corruption probabilities, numeric requirements and costs across calculations, processes and optimizer", () => {
        const candidates = engine.corruptedModifiers(blank()).slice(0, 2);
        const ids = ["IncreasedLife1", ...candidates.map((entry) => entry.id)];
        const data = {
            ...catalog,
            mods: Object.fromEntries(ids.map((id) => [id, catalog.mods[id]!])),
        };
        const model = new CraftingEngine(data);
        const desired = candidates[0]!;
        const target = model.validateTarget({ groups: [{ mods: [desired.id] }] });
        const probability =
            desired.weight / candidates.reduce((sum, entry) => sum + entry.weight, 0);
        expect(calculateExact(model, blank(), method(), target).probability).toBeCloseTo(
            probability,
        );
        const stat = desired.mod.stats[0]!;
        const numeric = model.validateTarget({
            groups: [],
            stats: [{ id: stat.id, min: stat.max, scope: "implicit" }],
        });
        expect(calculateExact(model, blank(), method(), numeric).probability).toBeCloseTo(
            probability / (stat.max - stat.min + 1),
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
                    id: "bloodstained",
                    method: method(),
                    condition: target,
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [fossil("Bloodstained").id]: 4, [method().resonator]: 1 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        expect(calculateProcessExact(model, project)).toMatchObject({
            probability: expect.closeTo(probability),
            meanCost: expect.closeTo(5),
        });
        const simulation = new CraftingSimulation(data, project);
        for (let i = 0; i < project.iterations; i++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(probability, 1);
        expect(simulation.result()).toMatchObject({ errors: {}, meanCost: 5 });
        const optimizer = new FossilOptimizer(model, project.item, target, project.prices, 42, {
            fossils: [fossil("Bloodstained").id],
            maxSockets: 1,
            trials: 1000,
            logic: "additive",
        });
        while (!optimizer.runBatch()) {
            /* finish the bounded search */
        }
        expect(optimizer.result()).toMatchObject({ completed: 1, failed: 0, errors: [] });
        expect(optimizer.result().byAttempts[0]!.probability).toBeCloseTo(probability, 1);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});
