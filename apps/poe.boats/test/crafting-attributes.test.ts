import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import {
    allflameBracket,
    allflameQuote,
    attributeEquivalencies,
} from "../app/lib/crafting-allflame";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
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

const record = catalog.crafting.currencies.find(
    (entry) => entry.action === "reroll_single_attribute_modifier",
)!;
const method = { kind: "currency", id: record.id, allflame: true } as const;
const sulphur = catalog.crafting.allflame!.sulphur;
const amulet = "Metadata/Items/Amulets/Amulet1";
const force = (id: string): CraftingRandom => ({
    pick: (choices) =>
        choices.find((entry) => entry.value === id)?.value ??
        choices.find((entry) => entry.weight > 0)!.value,
    integer: (_min, max) => max,
});
const start = (base = baseId, id = "Strength1", level = 86): CraftingItem => ({
    ...engine.addStartingMod(engine.createItem(base, level), id, seededRandom(1)),
    intangibility: 100,
});
const target = engine.validateTarget({ groups: [{ mods: ["Dexterity1"] }] });
const project = (item = start(), patch = {}) =>
    craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item,
        method,
        target,
        steps: [],
        prices: { [method.id]: 2, [sulphur]: 0.001 },
        seed: 42,
        iterations: 500,
        maxActions: 2,
        ...patch,
    });

describe("Genteel attribute conversion", () => {
    it("uses all 13 extracted attribute-equivalence groups and the mandatory two-copy Allflame bracket", () => {
        const groups = attributeEquivalencies(catalog);
        expect(groups).toHaveLength(13);
        for (const row of groups) {
            expect(catalog.crafting.modEquivalencies).toContainEqual(row);
            for (const id of row.mods) {
                const choices = engine.attributeChoices({
                    ...start(),
                    mods: [engine.rollMod(id, seededRandom(1))],
                });
                expect(choices).toEqual([
                    { index: 0, ids: row.mods.filter((other) => other !== id) },
                ]);
            }
        }
        expect(allflameBracket(catalog, method)).toMatchObject({
            outcomes: { min: 2, max: 2 },
            sulphurCost: 1500,
            intangibility: { min: 1, max: 5 },
        });
        expect(allflameQuote(catalog, start(), method)?.amount).toBe(3660);
        expect(() => engine.validateMethod({ ...method, allflame: undefined })).toThrow(
            "requires Allflame",
        );
    });

    it("converts off-base attributes with newly rolled values, preserves source eligibility and consumes no strands", () => {
        const item = { ...start(), memoryStrands: 82, quality: 20 };
        const before = structuredClone(item);
        expect(engine.pool({ ...item, mods: [] }).some((entry) => entry.id === "Dexterity1")).toBe(
            false,
        );
        const result = engine.apply(item, method, force("Dexterity1"));
        expect(result.item.mods).toEqual([
            {
                id: "Dexterity1",
                values: [12],
                crafted: false,
                fractured: false,
                attributeSource: "Strength1",
            },
        ]);
        expect(result.item.memoryStrands).toBe(82);
        expect(result.item.quality).toBe(20);
        expect(result.cost).toEqual(engine.costs(method, item));
        expect(item).toEqual(before);
        expect(() =>
            engine.validateItem({
                ...result.item,
                mods: result.item.mods.map(({ attributeSource: _source, ...mod }) => mod),
            }),
        ).toThrow("not available");
        const again = engine.apply(result.item, method, force("Intelligence1")).item;
        expect(again.mods[0]!.attributeSource).toBe("Strength1");
        const returned = engine.apply(again, method, force("Strength1")).item;
        expect(returned.mods[0]!.attributeSource).toBeUndefined();
    });

    it("replaces fractures despite suffix locks and keeps the other modifiers unchanged", () => {
        const item = start();
        item.mods[0]!.fractured = true;
        const lock = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_change_suffixes"),
        )!;
        const locked = engine.apply(item, { kind: "bench", id: lock.id }, seededRandom(2)).item;
        const result = engine.apply(locked, method, force("Dexterity1")).item;
        expect(result.mods.find((entry) => entry.id === lock.mod)).toEqual(
            locked.mods.find((entry) => entry.id === lock.mod),
        );
        expect(result.mods.find((entry) => entry.id === "Dexterity1")?.fractured).toBe(false);
        expect(result.mods.some((entry) => entry.id === "Strength1")).toBe(false);
    });

    it("models an occupied replacement group as removal and selects modifiers independently of their number of free alternatives", () => {
        const item = engine.addStartingMod(start(amulet), "Dexterity1", seededRandom(2));
        const intelligence = engine.validateTarget({ groups: [{ mods: ["Intelligence1"] }] });
        expect(calculateExact(engine, item, method, intelligence).probability).toBeCloseTo(0.5, 12);
        const removed = engine.apply(item, method, force("Dexterity1")).item;
        expect(removed.mods.map((entry) => entry.id)).toEqual(["Dexterity1"]);
        const full = engine.addStartingMod(item, "Intelligence1", seededRandom(3));
        const result = engine.apply(full, method, force("Dexterity1")).item;
        expect(result.mods.map((entry) => entry.id)).toEqual(["Dexterity1", "Intelligence1"]);
    });

    it("uses exact half and three-quarter target probabilities, numeric value rolls and conditional process costs", () => {
        expect(calculateExact(engine, start(), method, target).probability).toBe(0.5);
        expect(
            calculateExact(engine, { ...start(), intangibility: 0 }, method, target).probability,
        ).toBeCloseTo(0.75, 12);
        const result = calculateProcessExact(
            engine,
            project(start(), {
                useProcess: true,
                steps: [
                    {
                        id: "convert",
                        method,
                        condition: target,
                        onSuccess: "success",
                        onFailure: "failure",
                    },
                ],
            }),
        );
        expect(result.probability).toBe(0.5);
        expect(result.spending[method.id]).toBeCloseTo(1, 12);
        expect(result.spending[sulphur]).toBeCloseTo(3660, 9);
        const numeric = engine.validateTarget({
            groups: [{ mods: ["Dexterity1"] }],
            stats: [{ id: "additional_dexterity", min: 12 }],
        });
        expect(calculateExact(engine, start(), method, numeric).probability).toBeCloseTo(0.1, 12);
        const simulation = new CraftingSimulation(
            catalog,
            project({ ...start(), intangibility: 0 }),
        );
        for (let i = 0; i < 500; i++) simulation.runTrial();
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().probability).toBeCloseTo(0.75, 1);
        expect(simulation.result().spending[method.id]).toBe(500);
    });

    it("preserves ordinary, essence and jewel source rules rather than imposing the destination's native base restriction", () => {
        const cases = [
            { base: "Metadata/Items/Belts/Belt3", id: "Strength10", level: 86 },
            { base: baseId, id: "StrengthEssence7_", level: 1 },
            { base: "Metadata/Items/Jewels/JewelStr", id: "StrengthJewel", level: 1 },
            {
                base: Object.entries(catalog.bases).find(
                    ([, base]) => base.domain === "abyss_jewel",
                )![0],
                id: "AbyssStrengthJewel1_",
                level: 1,
            },
        ];
        for (const entry of cases) {
            const item = start(entry.base, entry.id, entry.level);
            const options = engine.attributeChoices(item)[0]!.ids;
            for (const id of options) {
                const result = engine.apply(item, method, force(id)).item;
                expect(result.mods[0]).toMatchObject({ id, attributeSource: entry.id });
                expect(engine.validateItem(result)).toEqual(result);
            }
        }
    });

    it("preserves converted rolls through Divine Orbs, JSON, item text, pending choices and starting-item previews", () => {
        const item = start();
        const preview = engine.addStartingMod(item, "Dexterity1", force("Dexterity1"), "attribute");
        expect(preview.mods[0]!.attributeSource).toBe("Strength1");
        const result = engine.apply(item, method, force("Dexterity1")).item;
        const divine = engine.apply(result, currency("reroll_mod_values"), force("unused")).item;
        expect(divine.mods[0]!.attributeSource).toBe("Strength1");
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, divine))[0]!.item,
        ).toEqual(divine);
        expect(validateProject(catalog, JSON.parse(JSON.stringify(project(divine)))).item).toEqual(
            divine,
        );
        const pending = engine.prepareAllflame(
            { ...item, intangibility: 0 },
            method,
            seededRandom(1),
        ).item;
        expect(pending.allflameCopies).toHaveLength(2);
        expect(validateProject(catalog, JSON.parse(JSON.stringify(project(pending)))).item).toEqual(
            pending,
        );
    });

    it("rejects missing attributes before randomness and forged source records in both games", () => {
        const random = seededRandom(1);
        vi.spyOn(random, "pick");
        expect(() => engine.prepareAllflame(engine.createItem(baseId), method, random)).toThrow(
            "single-attribute equivalent",
        );
        expect(random.pick).not.toHaveBeenCalled();
        for (const source of ["missing", "IncreasedLife1", "Strength2", "Dexterity1"])
            expect(() =>
                engine.validateItem({
                    ...start(),
                    mods: [
                        {
                            ...engine.rollMod("Dexterity1", seededRandom(1)),
                            attributeSource: source,
                        },
                    ],
                }),
            ).toThrow();
        const forged = engine.apply(start(), method, force("Dexterity1")).item;
        forged.mods[0]!.crafted = true;
        expect(() => engine.validateItem(forged)).toThrow("attribute conversion source");
        const data = craftingCatalogSchema.parse(
            JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
        );
        const other = new CraftingEngine(data);
        expect(attributeEquivalencies(data)).toEqual([]);
        expect(() => other.validateMethod(method)).toThrow();
        expect(other.attributeChoices(start())).toEqual([]);
    });

    it("retains a beast-level source through conversion and removes unnecessary source metadata on native recombination transfers", () => {
        const item = engine.addStartingMod(
            engine.createItem(baseId, 1),
            "IncreasedLife1",
            seededRandom(1),
        );
        const beast = engine.apply(
            item,
            { kind: "beast", id: "EinharMasterCraft30", level: 86 },
            force("Strength9"),
        ).item;
        expect(beast.mods[0]!.id).toBe("Strength9");
        const result = engine.apply(
            { ...beast, intangibility: 100 },
            method,
            force("Dexterity9"),
        ).item;
        expect(result.level).toBe(1);
        expect(result.mods[0]).toMatchObject({
            id: "Dexterity9",
            attributeSource: "Strength9",
            origin: beast.mods[0]!.origin,
        });
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result))[0]!.item,
        ).toEqual(result);
        const withoutOrigin = structuredClone(result);
        delete withoutOrigin.mods[0]!.origin;
        expect(() => engine.validateItem(withoutOrigin)).toThrow("not available");
        const left = engine.apply(start(amulet), method, force("Dexterity1")).item;
        const outcomes = recombinationOutcomes(engine, left, engine.createItem(amulet));
        expect(
            outcomes.some(({ value }) => value.mods.some((entry) => entry.id === "Dexterity1")),
        ).toBe(true);
        for (const { value } of outcomes) {
            expect(value.mods.every((entry) => !entry.attributeSource)).toBe(true);
            expect(engine.validateItem(value)).toEqual(value);
        }
    });
});
