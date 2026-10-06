import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { allflameBracket, allflameQuote } from "../app/lib/crafting-allflame";
import { eldritchTier } from "../app/lib/crafting-eldritch";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { gildedImplicitId } from "../app/lib/crafting-fossils";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    validateProject,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const ducat = catalog.crafting.currencies.find(
    (entry) => entry.action === "add_eldritch_implicit_amulet",
)!;
const method = { kind: "currency", id: ducat.id, allflame: true } as const;
const sulphur = catalog.crafting.allflame!.sulphur;
const base = Object.entries(catalog.bases).find(([, base]) => base.name === "Paua Amulet")![0];
const first: CraftingRandom = {
    pick: (choices) => choices.find((entry) => entry.weight > 0)!.value,
    integer: (min) => min,
};
const start = (level = 86): CraftingItem => ({
    ...engine.createItem(base, level),
    intangibility: 100,
});
const project = (item = start(), patch = {}) =>
    craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item,
        method,
        target: { groups: [] },
        steps: [],
        prices: { [method.id]: 3, [sulphur]: 0.001 },
        seed: 42,
        iterations: 400,
        maxActions: 1,
        ...patch,
    });

describe("Ukatoa's Allflame implicit replacement", () => {
    it("uses the extracted bracket and actual amulet levels, ordered weights and all six tiers", () => {
        expect(allflameBracket(catalog, method)).toMatchObject({
            outcomes: { min: 4, max: 4 },
            sulphurCost: 3000,
            intangibility: { min: 12, max: 16 },
        });
        expect(allflameQuote(catalog, start(), method)?.amount).toBe(7320);
        expect(engine.ukatoaModifiers(start(74))).toEqual([]);
        const pool = engine.ukatoaModifiers(start(75));
        expect(pool).toHaveLength(510);
        expect(new Set(pool.map((entry) => eldritchTier(entry.mod)))).toEqual(
            new Set([1, 2, 3, 4, 5, 6]),
        );
        expect(new Set(pool.map((entry) => entry.mod.generation_type))).toEqual(
            new Set(["searing_exarch_implicit", "eater_of_worlds_implicit"]),
        );
        for (const entry of pool) {
            const tags = engine.base(start()).tags;
            expect(entry.weight).toBe(
                entry.mod.spawn_weights.find((rule) => tags.includes(rule.tag))!.weight,
            );
            expect(entry.mod.required_level).toBe(75);
        }
        expect(engine.eldritchModifiers(start())).toEqual([]);
        expect(() => engine.validateMethod({ ...method, allflame: undefined })).toThrow(
            "requires Allflame",
        );
    });

    it("replaces one native implicit on all ordinary rarities and retains modifiers, influences and strands", () => {
        for (const rarity of ["normal", "magic", "rare"] as const) {
            const item = { ...start(), rarity, influences: [0], memoryStrands: 82 };
            const before = structuredClone(item);
            const result = engine.apply(item, method, first);
            expect(result.item).toMatchObject({
                rarity,
                influences: [0],
                memoryStrands: 82,
                corrupted: false,
                allflameCrafted: true,
                implicitCraft: {
                    currency: ducat.id,
                    level: 86,
                    removed: engine.base(item).implicits,
                },
            });
            expect(result.item.implicits).toHaveLength(1);
            expect(eldritchTier(engine.mod(result.item.implicits[0]!.id))).toBeGreaterThan(0);
            expect(result.item.mods).toEqual(item.mods);
            expect(result.cost).toEqual(engine.costs(method, item));
            expect(item).toEqual(before);
        }
        const item = engine.addStartingMod(start(), "IncreasedLife1", first);
        item.mods[0]!.fractured = true;
        expect(engine.apply(item, method, first).item.mods).toEqual(item.mods);
    });

    it("uniformly replaces a native or Gilded implicit and preserves the other", () => {
        const item = engine.addStartingMod(start(), gildedImplicitId, first);
        for (const index of [0, 1]) {
            const random: CraftingRandom = {
                ...first,
                pick: (choices) =>
                    choices.length === 2 && typeof choices[0]!.value === "object"
                        ? choices[index]!.value
                        : first.pick(choices),
            };
            const result = engine.apply(item, method, random).item;
            expect(result.implicits).toHaveLength(2);
            expect(result.implicits[0]).toEqual(item.implicits[1 - index]);
            expect(result.implicitCraft?.removed).toEqual(
                index === 0 ? engine.base(item).implicits : [],
            );
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
            ).toEqual(result);
        }
        const low = { ...item, level: 74 };
        const target = engine.validateTarget({
            groups: [{ mods: [gildedImplicitId], minimum: 1 }],
        });
        expect(calculateExact(engine, low, method, target).probability).toBeCloseTo(0.5, 12);
    });

    it("records paid implicit loss below level 75, rejects an empty input, and can remove a remaining Gilded implicit", () => {
        const item = start(74);
        const lost = engine.apply(item, method, first);
        expect(lost.item.implicits).toEqual([]);
        expect(lost.item.implicitCraft?.removed).toEqual(engine.base(item).implicits);
        expect(lost.cost).toEqual(engine.costs(method, item));
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, lost.item))[0]!.item,
        ).toEqual(lost.item);
        const random = seededRandom(1);
        vi.spyOn(random, "pick");
        expect(() => engine.prepareAllflame(lost.item, method, random)).toThrow(
            "eligible amulet implicit",
        );
        expect(random.pick).not.toHaveBeenCalled();
        const gilded = engine.addStartingMod(lost.item, gildedImplicitId, first);
        const second = engine.apply(gilded, method, first).item;
        expect(second.implicits).toEqual([]);
        expect(second.implicitCraft?.removed).toEqual(lost.item.implicitCraft?.removed);
        const target = engine.validateTarget({
            groups: [{ mods: engine.base(item).implicits, minimum: 1, negated: true }],
        });
        const result = calculateProcessExact(
            engine,
            project(item, {
                target,
                useProcess: true,
                steps: [
                    {
                        id: "ukatoa",
                        method,
                        condition: target,
                        onSuccess: "success",
                        onFailure: "failure",
                    },
                ],
            }),
        );
        expect(result.probability).toBeCloseTo(1, 12);
        expect(result.spending[method.id]).toBeCloseTo(1, 12);
    });

    it("retains four independent offers and rejects forged source, missing, duplicate and extra implicit states", () => {
        const pending = engine.prepareAllflame(
            { ...start(), intangibility: 0 },
            method,
            seededRandom(42),
        ).item;
        expect(pending.allflameCopies).toHaveLength(4);
        for (const copy of pending.allflameCopies!)
            expect(copy.intangibility).toBeGreaterThanOrEqual(12);
        expect(validateProject(catalog, JSON.parse(JSON.stringify(project(pending)))).item).toEqual(
            pending,
        );
        const chosen = engine.chooseAllflame(pending, 0);
        const text = exportCraftingItemText(engine, chosen);
        expect(importCraftingItemText(engine, text)[0]!.item).toEqual(chosen);
        expect(() => importCraftingItemText(engine, `${text}\nImplicit Craft: {}`)).toThrow(
            "Duplicate",
        );
        for (const patch of [
            { implicitCraft: undefined },
            { allflameCrafted: undefined },
            { implicitCraft: { ...chosen.implicitCraft!, currency: "missing" } },
            { implicitCraft: { ...chosen.implicitCraft!, level: 74 } },
            { implicitCraft: { ...chosen.implicitCraft!, removed: ["unknown"] } },
            {
                implicitCraft: {
                    ...chosen.implicitCraft!,
                    removed: [...engine.base(chosen).implicits, ...engine.base(chosen).implicits],
                },
            },
            { implicits: [...chosen.implicits, ...start().implicits] },
            { implicits: [...chosen.implicits, ...chosen.implicits] },
        ])
            expect(() => engine.validateItem({ ...chosen, ...patch })).toThrow();
        expect(() => engine.apply(chosen, method, first)).toThrow("no Eldritch");
        for (const item of [
            engine.createItem(baseId),
            { ...start(), corrupted: true },
            { ...start(), mirrored: true },
        ]) {
            const random = seededRandom(1);
            vi.spyOn(random, "pick");
            expect(() => engine.prepareAllflame(item, method, random)).toThrow();
            expect(random.pick).not.toHaveBeenCalled();
        }
    });

    it("keeps ordinary Eldritch currencies restricted to armour and preserves valid subsequent amulet crafts", () => {
        const item = engine.apply({ ...start(), rarity: "rare" }, method, first).item;
        for (const action of [
            "add_mod_to_rare_eldritch",
            "remove_random_mod_eldritch",
            "reroll_rare_eldritch",
            "conflict_orb",
            "add_cleansing_fire_implicit_1",
            "add_great_tangle_implicit_1",
        ]) {
            const random = seededRandom(1);
            vi.spyOn(random, "pick");
            expect(() => engine.apply(item, currency(action), random)).toThrow(/armour/);
            expect(random.pick).not.toHaveBeenCalled();
        }
        const rerolled = engine.apply(item, currency("reroll"), first).item;
        expect(rerolled.implicits).toEqual(item.implicits);
        expect(rerolled.implicitCraft).toEqual(item.implicitCraft);
        const blessed = engine.apply(item, currency("reroll_implicit_mod"), first).item;
        expect(blessed.implicitCraft).toEqual(item.implicitCraft);
        const corrupted = engine.apply(item, currency("corrupt_item"), {
            ...first,
            pick: (choices) =>
                choices.find((entry) => entry.value === "implicit")?.value ?? first.pick(choices),
        }).item;
        expect(corrupted.corrupted).toBe(true);
        expect(corrupted.implicitCraft).toEqual(item.implicitCraft);
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, corrupted))[0]!.item,
        ).toEqual(corrupted);
        const regenerated = engine.apply(item, { kind: "generate", id: "normal" }, first).item;
        expect(regenerated.implicitCraft).toBeUndefined();
        expect(regenerated.implicits.map((entry) => entry.id)).toEqual(engine.base(item).implicits);
    });

    it("discards an earlier imprint and preserves later implicit checkpoints through restoration", () => {
        const magic = engine.apply(start(), currency("transmute_to_magic"), first).item;
        const imprint = { kind: "beast", id: "EinharMasterCraft27" } as const;
        const before = engine.apply(magic, imprint, first).item;
        const crafted = engine.apply(before, method, first).item;
        expect(crafted.imprint).toBeUndefined();
        const checkpoint = engine.apply(crafted, imprint, first).item;
        expect(checkpoint.imprint?.implicitCraft).toEqual(crafted.implicitCraft);
        const rare = engine.apply(checkpoint, currency("upgrade_magic_to_rare"), first).item;
        expect(engine.apply(rare, currency("restore_imprint"), first).item).toEqual(crafted);
    });

    it("retains crafted implicit eligibility after recombination lowers the item level", () => {
        const item = engine.apply({ ...start(), rarity: "rare" }, method, first).item;
        const other = { ...start(1), rarity: "rare" as const };
        const outcomes = recombinationOutcomes(engine, item, other);
        expect(outcomes.some((entry) => entry.value.implicitCraft)).toBe(true);
        for (const { value } of outcomes) {
            expect(value.level).toBeLessThan(75);
            expect(engine.validateItem(value)).toEqual(value);
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, value))[0]!.item,
            ).toEqual(value);
        }
    });

    it("uses extracted weighted probabilities and target-aware multi-copy sampling", () => {
        const item = start();
        const pool = engine.ukatoaModifiers(item);
        const eater = pool
            .filter((entry) => entry.mod.generation_type === "eater_of_worlds_implicit")
            .slice(0, 80);
        const p =
            eater.reduce((sum, entry) => sum + entry.weight, 0) /
            pool.reduce((sum, entry) => sum + entry.weight, 0);
        const target = engine.validateTarget({
            groups: [{ mods: eater.map((entry) => entry.id), minimum: 1 }],
        });
        const exact = calculateExact(engine, item, method, target, 10000);
        expect(exact.probability).toBeCloseTo(p, 12);
        const simulation = new CraftingSimulation(
            catalog,
            project({ ...item, intangibility: 0 }, { target }),
        );
        for (let i = 0; i < 400; i++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().probability).toBeCloseTo(1 - (1 - p) ** 4, 1);
        expect(simulation.result().spending[method.id]).toBe(400);
        expect(simulation.result().spending[sulphur]).toBe(7320 * 400);
    });

    it("applies attack/caster blockers to new rolls without invalidating retained implicits, and isolates PoE 2", () => {
        const crafted = engine.apply(start(), method, first).item;
        const blocker = Object.entries(catalog.mods).find(([, mod]) =>
            mod.stats.some((stat) => stat.id === "item_generation_cannot_roll_attack_affixes"),
        )![0];
        const blocked = engine.addStartingMod(crafted, blocker, first);
        expect(
            engine
                .ukatoaModifiers(blocked)
                .every((entry) => !entry.mod.implicit_tags.includes("attack")),
        ).toBe(true);
        expect(engine.validateItem(blocked)).toEqual(blocked);
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        const id = Object.entries(poe2.catalog.bases).find(
            ([, base]) => base.item_class === "Amulet",
        )![0];
        const other = poe2.createItem(id);
        expect(poe2.ukatoaModifiers(other)).toEqual([]);
        expect(() => poe2.validateMethod(method)).toThrow();
        expect(() => poe2.validateItem({ ...other, implicitCraft: crafted.implicitCraft })).toThrow(
            "Ukatoa",
        );
    });
});
