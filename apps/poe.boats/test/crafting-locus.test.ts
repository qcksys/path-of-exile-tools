import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { supportsLocus } from "../app/lib/crafting-corruption";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { gildedImplicitId } from "../app/lib/crafting-fossils";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { craftingCatalogSchema, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const locus = { kind: "locus" as const, id: catalog.crafting.locus!.id };
const vaal = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!.id,
};
const blank = (name = "Cobalt Jewel", level = 86) =>
    engine.createItem(
        Object.keys(catalog.bases).find((id) => catalog.bases[id]!.name === name)!,
        level,
    );
function force(outcome: string, influence?: number) {
    const random = seededRandom(42);
    const pick = vi
        .spyOn(random, "pick")
        .mockImplementationOnce(
            (choices) => choices.find((entry) => entry.value === outcome)!.value,
        );
    if (influence !== undefined)
        pick.mockImplementationOnce(
            (choices) => choices.find((entry) => entry.value === influence)!.value,
        );
    return random;
}

describe("PoE 1 jewel Vaal corruption", () => {
    it.each([
        "Cobalt Jewel",
        "Crimson Jewel",
        "Viridian Jewel",
        "Murderous Eye Jewel",
    ])("supports every modeled branch on %s", (name) => {
        const item = blank(name);
        expect(engine.corruptionKind(item)).toBe("poe1-jewel");
        for (const outcome of ["none", "unique-jewel", "implicit", "reroll-rare"]) {
            const result = engine.apply(item, vaal, force(outcome));
            expect(result.item.corrupted).toBe(true);
            expect(engine.validateItem(result.item)).toEqual(result.item);
            expect(result.cost).toEqual([{ id: vaal.id, name: "Vaal Orb", amount: 1 }]);
            if (outcome === "none" || outcome === "unique-jewel")
                expect(result.item).toEqual({ ...item, corrupted: true });
            if (outcome === "implicit") {
                expect(result.item.implicits).toHaveLength(1);
                expect(result.item.mods).toEqual([]);
                expect(result.item.rarity).toBe("normal");
            }
            if (outcome === "reroll-rare") {
                expect(result.item.rarity).toBe("rare");
                expect(result.item.mods.length).toBeGreaterThanOrEqual(3);
                expect(result.item.mods.length).toBeLessThanOrEqual(4);
                expect(engine.counts(result.item).prefixes).toBeLessThanOrEqual(2);
                expect(engine.counts(result.item).suffixes).toBeLessThanOrEqual(2);
            }
            const text = exportCraftingItemText(engine, result.item);
            expect(
                importCraftingItemText(engine, text).some(
                    (entry) => exportCraftingItemText(engine, entry.item) === text,
                ),
            ).toBe(true);
        }
    });

    it("preserves a fractured jewel affix during a rare reroll and keeps PoE 2 scaling out", () => {
        const item = engine.addStartingMod(
            { ...blank(), rarity: "magic" },
            engine.pool({ ...blank(), rarity: "magic" })[0]!.id,
            seededRandom(1),
        );
        item.mods[0]!.fractured = true;
        const before = structuredClone(item);
        const result = engine.apply(item, vaal, force("reroll-rare")).item;
        expect(result.mods).toContainEqual(item.mods[0]);
        expect(result.mods.every((entry) => entry.corruptionScale === undefined)).toBe(true);
        expect(item).toEqual(before);
        const empty = new CraftingEngine({ ...catalog, mods: {} });
        expect(empty.apply(blank(), vaal, force("implicit")).item).toEqual({
            ...blank(),
            corrupted: true,
        });
    });

    it("calculates the weighted implicit and rare-reroll categories independently", () => {
        const item = blank();
        const pool = engine.corruptedModifiers(item);
        const narrow = new CraftingEngine({
            ...catalog,
            mods: Object.fromEntries(pool.map((entry) => [entry.id, entry.mod])),
        });
        const target = narrow.validateTarget({ groups: [{ mods: [pool[0]!.id] }] });
        const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
        expect(calculateExact(narrow, item, vaal, target).probability).toBeCloseTo(
            pool[0]!.weight / total / 4,
        );
        expect(
            calculateExact(
                narrow,
                item,
                vaal,
                narrow.validateTarget({ groups: [], rarity: "rare" }),
            ).probability,
        ).toBeCloseTo(1 / 4);
    });
});

describe("PoE 1 Locus of Corruption", () => {
    it("uses the extracted room and eligibility while excluding maps, flasks and PoE 2", () => {
        expect(engine.validateMethod(locus)).toEqual(locus);
        expect(engine.methodName(locus)).toBe("Locus of Corruption");
        expect(engine.costName(locus.id)).toBe("Locus of Corruption");
        for (const [id, base] of Object.entries(catalog.bases))
            expect(supportsLocus(catalog, { baseId: id })).toBe(
                base.strongbox ? false : catalog.crafting.classes[base.item_class]!.doubleCorrupt,
            );
        const random = seededRandom(42);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            blank("Beach Map"),
            blank("Small Life Flask"),
            { ...blank(), corrupted: true },
            { ...blank(), mirrored: true },
        ])
            expect(() => engine.apply(item, locus, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
        expect(() => engine.validateMethod({ ...locus, id: "missing" })).toThrow("extracted Locus");
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(() => poe2.validateMethod(locus)).toThrow("extracted Locus");
    });

    it.each([
        "Coral Ring",
        "Two-Stone Ring",
        "Plate Vest",
        "Cobalt Jewel",
        "Murderous Eye Jewel",
    ])("adds two compatible implicits to %s and preserves text and ordinary affixes", (name) => {
        let item = { ...blank(name), rarity: "rare" as const };
        item = {
            ...engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(1)),
            rarity: "rare",
        };
        const result = engine.apply(item, locus, force("two-implicits"));
        expect(result.item.mods).toEqual(item.mods);
        expect(
            result.item.implicits.filter(
                (entry) => engine.mod(entry.id).generation_type === "corrupted",
            ),
        ).toHaveLength(2);
        expect(result.item.twiceCorrupted).toBeUndefined();
        expect(result.cost).toEqual([{ id: locus.id, name: "Locus of Corruption", amount: 1 }]);
        expect(engine.validateItem(result.item)).toEqual(result.item);
        const text = exportCraftingItemText(engine, result.item);
        expect(
            importCraftingItemText(engine, text).some(
                (entry) => exportCraftingItemText(engine, entry.item) === text,
            ),
        ).toBe(true);
        const duplicate = {
            ...result.item,
            implicits: [result.item.implicits[0], result.item.implicits[0]],
        };
        expect(() => engine.validateItem(duplicate)).toThrow("invalid corrupted implicit");
        expect(() => engine.validateItem({ ...result.item, corrupted: false })).toThrow();
    });

    it("replaces Gilded and Eldritch implicits, retains locked implicits and removes no more than two", () => {
        const ring = blank("Coral Ring");
        ring.implicits.push(engine.rollMod(gildedImplicitId, seededRandom(1)));
        const result = engine.apply(ring, locus, force("two-implicits")).item;
        expect(result.implicits).toHaveLength(2);
        expect(
            result.implicits.every((entry) => engine.mod(entry.id).generation_type === "corrupted"),
        ).toBe(true);
        let armour = engine.createItem(baseId);
        for (const generation of ["searing_exarch_implicit", "eater_of_worlds_implicit"])
            armour = engine.addStartingMod(
                armour,
                engine
                    .eldritchModifiers(armour)
                    .find((entry) => entry.mod.generation_type === generation)!.id,
                seededRandom(1),
            );
        const converted = engine.apply(armour, locus, force("two-implicits")).item;
        expect(
            converted.implicits.every(
                (entry) => engine.mod(entry.id).generation_type === "corrupted",
            ),
        ).toBe(true);
        const lockedId = Object.keys(catalog.bases).find(
            (id) =>
                supportsLocus(catalog, { baseId: id }) &&
                catalog.bases[id]!.implicits.some((mod) =>
                    engine
                        .mod(mod)
                        .stats.some((stat) => stat.id === "local_implicit_mod_cannot_be_changed"),
                ),
        )!;
        const locked = engine.createItem(lockedId);
        const preserved = engine.apply(locked, locus, force("two-implicits")).item;
        for (const entry of locked.implicits.filter((entry) =>
            engine
                .mod(entry.id)
                .stats.some((stat) => stat.id === "local_implicit_mod_cannot_be_changed"),
        ))
            expect(preserved.implicits).toContainEqual(entry);
        expect(engine.validateItem(preserved)).toEqual(preserved);
    });

    it.each([
        0, 1, 2, 3, 4, 5,
    ])("rerolls with extracted influence %i when the base supports it", (influence) => {
        const item = blank("Plate Vest");
        const result = engine.apply(item, locus, force("influenced-rare", influence)).item;
        expect(result.influences).toEqual([influence]);
        expect(result.rarity).toBe("rare");
        expect(result.mods.length).toBeGreaterThanOrEqual(4);
        expect(result.mods.length).toBeLessThanOrEqual(6);
        expect(engine.validateItem(result)).toEqual(result);
    });

    it("keeps existing influences and fractures and gives jewels no invented influence", () => {
        const influenced = { ...blank("Plate Vest"), influences: [0, 1] };
        expect(engine.apply(influenced, locus, force("influenced-rare")).item.influences).toEqual([
            0, 1,
        ]);
        const fractured = engine.addStartingMod(
            { ...blank("Plate Vest"), rarity: "rare" },
            engine.pool({ ...blank("Plate Vest"), rarity: "rare" })[0]!.id,
            seededRandom(1),
        );
        fractured.mods[0]!.fractured = true;
        const result = engine.apply(fractured, locus, force("influenced-rare")).item;
        expect(result.influences).toEqual([]);
        expect(result.mods).toContainEqual(fractured.mods[0]);
        const jewel = engine.apply(blank(), locus, force("influenced-rare")).item;
        expect(jewel.influences).toEqual([]);
        expect(jewel.mods.length).toBeLessThanOrEqual(4);
        let armour = engine.createItem(baseId);
        armour = engine.addStartingMod(
            armour,
            engine.eldritchModifiers(armour)[0]!.id,
            seededRandom(1),
        );
        const eldritch = engine.apply(armour, locus, force("influenced-rare")).item;
        expect(eldritch.influences).toEqual([]);
        expect(eldritch.implicits).toEqual(armour.implicits);
    });

    it("stops at an exhausted implicit pool without inventing modifiers", () => {
        const item = blank();
        const first = engine.corruptedModifiers(item)[0]!;
        const model = new CraftingEngine({ ...catalog, mods: { [first.id]: first.mod } });
        expect(model.apply(item, locus, force("two-implicits")).item.implicits).toHaveLength(1);
        const empty = new CraftingEngine({ ...catalog, mods: {} });
        expect(empty.apply(item, locus, force("two-implicits")).item).toEqual({
            ...item,
            corrupted: true,
        });
        const cluster = engine.createItem("Metadata/Items/Jewels/JewelPassiveTreeExpansionLarge");
        expect(engine.corruptedModifiers(cluster)).toEqual([]);
        expect(engine.apply(cluster, locus, force("two-implicits")).item.corrupted).toBe(true);
    });

    it("retains charged destroyed snapshots and treats every target as failed", () => {
        const item = blank("Coral Ring");
        expect(engine.apply(item, locus, force("white-sockets")).item).toEqual({
            ...item,
            corrupted: true,
        });
        const result = engine.apply(item, locus, force("destroy"));
        expect(result.item).toEqual({ ...item, corrupted: true, destroyed: true });
        expect(result.cost[0]!.amount).toBe(1);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(result.item);
        expect(engine.matches(result.item, engine.validateTarget({ groups: [] }))).toBe(false);
        expect(() => engine.apply(result.item, locus, seededRandom(1))).toThrow("Destroyed");
        expect(() => exportCraftingItemText(engine, result.item)).toThrow("destroyed");
        expect(() => engine.validateItem({ ...result.item, corrupted: false })).toThrow();
        expect(() =>
            engine.validateItem({ ...blank("Beach Map"), corrupted: true, destroyed: true }),
        ).toThrow();
    });

    it("enumerates two-implicit probabilities, charges failures, and restarts destroyed attempts", () => {
        const item = blank();
        const first = engine.corruptedModifiers(item)[0]!;
        const second = engine
            .corruptedModifiers(item)
            .find((entry) => !entry.mod.groups.some((group) => first.mod.groups.includes(group)))!;
        const narrow = { ...catalog, mods: { [first.id]: first.mod, [second.id]: second.mod } };
        const model = new CraftingEngine(narrow);
        const target = model.validateTarget({
            groups: [{ mods: [first.id, second.id], minimum: 2 }],
        });
        expect(calculateExact(model, item, locus, target).probability).toBeCloseTo(1 / 4);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: locus,
            target,
            steps: [{ id: "locus", method: locus, condition: target, onFailure: "restart" }],
            prices: { [locus.id]: 7 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        expect(calculateProcessExact(model, project)).toMatchObject({
            probability: expect.closeTo(7 / 16),
            meanCost: expect.closeTo(12.25),
            errors: {},
        });
        const simulation = new CraftingSimulation(narrow, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        expect(Math.abs(simulation.result().probability - 7 / 16)).toBeLessThan(0.035);
        expect(simulation.result().errors).toEqual({});
        expect(Math.abs(simulation.result().meanCost! - 12.25)).toBeLessThan(0.3);
        const survival = new CraftingSimulation(
            catalog,
            { ...project, target: model.validateTarget({ groups: [], corrupted: true }) },
            false,
        );
        for (let index = 0; index < project.iterations; index++) survival.runTrial();
        expect(Math.abs(survival.result().probability - 3 / 4)).toBeLessThan(0.035);
        expect(survival.result()).toMatchObject({ meanCost: 7, errors: {} });
    });
});
