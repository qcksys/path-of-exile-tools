import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { baseItemsSchema } from "../../../packages/poe-game-data/src/model";
import {
    baseDefenceEntries,
    baseDefenceValue,
    supportsSacredOrb,
} from "../app/lib/crafting-defences";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { recombinationOutcomes } from "../app/lib/crafting-recombination";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
    validateProject,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingDefenceRangesSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const poe2Catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const poe2 = new CraftingEngine(poe2Catalog);
const sacred = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === "reroll_variable_defences")!
        .id,
};
const base = engine.createItem(baseId);
const armour = catalog.bases[baseId]!.defences.armour!;
const rolled = (item = base, boundary: "min" | "max" = "min") => ({
    ...item,
    baseDefences: Object.fromEntries(
        baseDefenceEntries(catalog, item).map(({ key, range }) => [key, range[boundary]]),
    ),
});
const target = engine.validateTarget({
    groups: [],
    baseDefences: { armour: { min: armour.max, max: armour.max } },
});
const project = craftingProjectSchema.parse({
    format: 1,
    game: "poe1",
    patch: catalog.patch,
    item: base,
    method: sacred,
    target,
    steps: [],
    prices: { [sacred.id]: 3 },
    seed: 42,
    iterations: 1000,
    maxActions: 2,
});

describe("extracted base defences and Sacred Orbs", () => {
    it("exports each selected base's canonical defence ranges from both verified packages", () => {
        for (const [current, directory] of [
            [catalog, "poe-1-data"],
            [poe2Catalog, "poe-2-data"],
        ] as const) {
            const bases = baseItemsSchema.parse(
                JSON.parse(
                    readFileSync(`../../packages/${directory}/data/base_items.json`, "utf8"),
                ),
            );
            for (const [id, entry] of Object.entries(current.bases)) {
                if (entry.strongbox) {
                    expect(bases[id]).toBeUndefined();
                    expect(Object.values(entry.defences).every((range) => range === null)).toBe(
                        true,
                    );
                    continue;
                }
                expect(entry.defences).toEqual(
                    craftingDefenceRangesSchema.parse(bases[id]!.properties),
                );
            }
        }
        expect(catalog.crafting.currencies.find((entry) => entry.id === sacred.id)).toMatchObject({
            name: "Sacred Orb",
            action: "reroll_variable_defences",
        });
        expect(poe2.currencySupported("reroll_variable_defences")).toBe(false);
    });

    it("rolls inclusive endpoints for all eligible armour bases, including hybrid defences and ward", () => {
        let count = 0;
        let ward = 0;
        let hybrid = 0;
        for (const [id, definition] of Object.entries(catalog.bases)) {
            if (!definition.rarities.includes("normal") || definition.corrupted) continue;
            const item = engine.createItem(id);
            if (!supportsSacredOrb(catalog, item)) continue;
            const entries = baseDefenceEntries(catalog, item);
            if (definition.defences.ward) ward++;
            if (entries.length > 1) hybrid++;
            for (const boundary of ["min", "max"] as const) {
                const random = seededRandom(42);
                vi.spyOn(random, "integer").mockImplementation((min, max) =>
                    boundary === "min" ? min : max,
                );
                const pick = vi.spyOn(random, "pick");
                const result = engine.apply(item, sacred, random);
                expect(result.item).toEqual(rolled(item, boundary));
                expect(result.cost).toEqual([{ id: sacred.id, name: "Sacred Orb", amount: 1 }]);
                expect(pick).not.toHaveBeenCalled();
            }
            count++;
        }
        expect(count).toBeGreaterThan(100);
        expect(ward).toBeGreaterThan(0);
        expect(hybrid).toBeGreaterThan(0);
    });

    it.each([
        "normal",
        "magic",
        "rare",
    ] as const)("preserves %s affixes, quality, strands and other item state", (rarity) => {
        let item: CraftingItem = {
            ...rolled(),
            rarity,
            quality: 30,
            memoryStrands: 82,
            sockets: 6,
        };
        if (rarity !== "normal")
            item = engine.addStartingMod(item, "IncreasedLife1", seededRandom(1));
        if (rarity === "rare") item.mods[0]!.fractured = true;
        const original = structuredClone(item);
        const output = engine.apply(item, sacred, seededRandom(5)).item;
        expect({ ...output, baseDefences: item.baseDefences }).toEqual(item);
        expect(engine.statTotals(output)).toEqual(engine.statTotals(item));
        expect(item).toEqual(original);
        const action =
            rarity === "normal"
                ? "transmute_to_rare"
                : rarity === "magic"
                  ? "upgrade_magic_to_rare"
                  : "reroll";
        expect(engine.apply(output, currency(action), seededRandom(1)).item.baseDefences).toEqual(
            output.baseDefences,
        );
    });

    it("validates raw rolls, rejects unavailable items and does not guess unspecified variable values", () => {
        expect(engine.validateItem(base).baseDefences).toBeUndefined();
        expect(baseDefenceValue(catalog, base, "armour")).toBeUndefined();
        expect(() => engine.matches(base, target)).toThrow("Set the starting Base Armour");
        for (const value of [armour.min - 1, armour.max + 1, 1.5, -1])
            expect(() =>
                engine.validateItem({ ...base, baseDefences: { armour: value } }),
            ).toThrow();
        expect(() => engine.validateItem({ ...base, baseDefences: { health: 100 } })).toThrow();
        expect(() => engine.validateItem({ ...base, baseDefences: { ward: 100 } })).toThrow(
            "extracted range",
        );
        const random = seededRandom(1);
        const integer = vi.spyOn(random, "integer");
        const pick = vi.spyOn(random, "pick");
        const weapon = Object.entries(catalog.bases).find(
            ([, entry]) => entry.item_class === "Wand",
        )![0];
        for (const item of [
            { ...base, corrupted: true },
            { ...base, mirrored: true },
            engine.createItem(weapon),
        ])
            expect(() => engine.apply(item, sacred, random)).toThrow();
        expect(integer).not.toHaveBeenCalled();
        expect(pick).not.toHaveBeenCalled();
        for (const requirement of [
            { min: -1, max: 10 },
            { min: 2, max: 1 },
            { min: 1.5, max: 2 },
        ])
            expect(() =>
                engine.validateTarget({ groups: [], baseDefences: { armour: requirement } }),
            ).toThrow();
        const fixedId = Object.entries(poe2Catalog.bases).find(
            ([, entry]) => entry.defences.armour,
        )![0];
        const fixed = poe2.createItem(fixedId);
        const value = poe2Catalog.bases[fixedId]!.defences.armour!.min;
        expect(baseDefenceValue(poe2Catalog, fixed, "armour")).toBe(value);
        expect(
            poe2.matches(
                fixed,
                poe2.validateTarget({
                    groups: [],
                    baseDefences: { armour: { min: value, max: value } },
                }),
            ),
        ).toBe(true);
        expect(() => poe2.apply(fixed, sacred, random)).toThrow();
    });

    it("round-trips annotated raw rolls independently of displayed quality and local defence modifiers", () => {
        const item = { ...rolled(), quality: 20 };
        const text = exportCraftingItemText(engine, item);
        expect(text).toContain(`Base Armour: ${armour.min}`);
        expect(importCraftingItemText(engine, text).map((entry) => entry.item)).toContainEqual(
            item,
        );
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        expect(() => importCraftingItemText(engine, `${text}\nBase Armour: ${armour.max}`)).toThrow(
            "one whole-number",
        );
        expect(() =>
            importCraftingItemText(
                engine,
                text.replace(`Base Armour: ${armour.min}`, `Base Armour: ${armour.max + 1}`),
            ),
        ).toThrow("extracted range");
        expect(() => importCraftingItemText(engine, `${text}\nBase Ward: 100`)).toThrow(
            "extracted range",
        );
        const native = `${exportCraftingItemText(engine, base)}\nArmour: 500 (augmented)`;
        const matches = importCraftingItemText(engine, native);
        expect(matches[0]!.item.baseDefences).toBeUndefined();
        expect(matches[0]!.warnings).toContain(
            "Displayed defences were not imported as raw base rolls. Set starting base defences before targeting them.",
        );
    });

    it("preserves rolls through imprint restoration and inherits the chosen recombination base's rolls", () => {
        const magic = engine.apply(rolled(), currency("transmute_to_magic"), seededRandom(1)).item;
        const imprint = engine.apply(
            magic,
            { kind: "beast", id: "EinharMasterCraft27" },
            seededRandom(1),
        ).item;
        const changed = engine.apply(imprint, sacred, {
            pick: (choices) => choices[0]!.value,
            integer: (_, max) => max,
        }).item;
        expect(changed.baseDefences).toEqual(rolled(base, "max").baseDefences);
        expect(engine.apply(changed, currency("restore_imprint"), seededRandom(1)).item).toEqual(
            magic,
        );
        const left = { ...rolled(), quality: 10 };
        const right = { ...rolled(base, "max"), quality: 20 };
        for (const outcome of recombinationOutcomes(engine, left, right))
            expect(outcome.value.baseDefences).toEqual(
                outcome.value.quality === 10 ? left.baseDefences : right.baseDefences,
            );
    });

    it("enumerates independent hybrid rolls and exact requirements using the extracted ranges", () => {
        const entry = Object.entries(catalog.bases).find(([, value]) => {
            const ranges = Object.values(value.defences).filter((range) => range !== null);
            return (
                ranges.length > 1 &&
                ranges.reduce((product, range) => product * (range.max - range.min + 1), 1) < 500
            );
        })!;
        const item = engine.createItem(entry[0]);
        const entries = baseDefenceEntries(catalog, item);
        const requirement = engine.validateTarget({
            groups: [],
            baseDefences: Object.fromEntries(
                entries.map(({ key, range }) => [key, { min: range.max, max: range.max }]),
            ),
        });
        const expected = entries.reduce((p, { range }) => p / (range.max - range.min + 1), 1);
        expect(calculateExact(engine, item, sacred, requirement).probability).toBeCloseTo(expected);
        expect(hasCraftingRequirements(requirement)).toBe(true);
        expect(
            hasCraftingRequirements(engine.validateTarget({ groups: [], baseDefences: {} })),
        ).toBe(false);
        expect(calculateExact(engine, base, sacred, target).probability).toBeCloseTo(
            1 / (armour.max - armour.min + 1),
        );
    });

    it("calculates and simulates bounded retries with numeric step conditions even without a final defence target", () => {
        const p = 1 / (armour.max - armour.min + 1);
        const input = {
            ...project,
            target: engine.validateTarget({ groups: [] }),
            useProcess: true,
            steps: [
                {
                    id: "roll",
                    method: sacred,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "roll",
                },
            ],
        };
        expect(validateProject(catalog, JSON.parse(JSON.stringify(input)))).toEqual(input);
        expect(calculateProcessExact(engine, input)).toMatchObject({
            probability: expect.closeTo(1 - (1 - p) ** 2),
            meanCost: expect.closeTo(3 * (2 - p)),
        });
        const simulation = new CraftingSimulation(catalog, input, true);
        for (let index = 0; index < 1000; index++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(1 - (1 - p) ** 2, 1);
        expect(simulation.result().errors).toEqual({});
    });
});
