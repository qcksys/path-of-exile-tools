import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import { catalystLimit } from "../app/lib/crafting-quality";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { rolledModText, scaledModValues } from "../app/lib/crafting-text";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const omen = catalog.crafting.currencies.find((entry) =>
    entry.id.endsWith("/OmenOnDivineSanctify"),
)!;
const divine = currency("reroll_mod_values");
const method = { ...divine, omens: [omen.id] };
function prepared() {
    const base = Object.entries(catalog.bases).find(
        ([, entry]) => entry.name === "Golden Hoop",
    )![0];
    return engine.validateItem({
        ...engine.createItem(base),
        rarity: "rare",
        mods: [engine.rollMod("IncreasedLife1", seededRandom(1))],
    });
}

describe("PoE 2 Sanctification", () => {
    it.each([
        "min",
        "max",
    ] as const)("uses the extracted %s multiplier after Divine rolls, preserving fractures and implicits", (bound) => {
        const item = prepared();
        item.mods.push(engine.rollMod("ColdResist1", seededRandom(1), { fractured: true }));
        const before = structuredClone(item);
        const random = seededRandom(1);
        vi.spyOn(random, "integer").mockImplementation((min, max) => (bound === "min" ? min : max));
        const result = engine.apply(item, method, random);
        const factor = catalog.crafting.sanctification![bound];
        expect(result.item.sanctified).toBe(true);
        expect(result.item.mods[0]).toMatchObject({
            values: [catalog.mods.IncreasedLife1!.stats[0]![bound]],
            sanctification: factor,
        });
        expect(rolledModText(catalog, result.item.mods[0]!, result.item)).toBe(
            bound === "min" ? "+8 to maximum Life" : "+23 to maximum Life",
        );
        expect(result.item.mods[1]).toEqual(item.mods[1]);
        expect(result.item.implicits).toEqual(item.implicits);
        expect(item).toEqual(before);
        expect(result.cost.map((entry) => [entry.id, entry.amount])).toEqual([
            [divine.id, 1],
            [omen.id, 1],
        ]);
        expect(availableOmens(catalog, divine)).toContainEqual(omen);
    });

    it("uses one shared multiplier for hybrid stats and applies catalyst effects afterwards", () => {
        let item = prepared();
        const hybrid = engine
            .pool(item, { side: "prefix" })
            .find((entry) => entry.mod.stats.length === 2)!;
        expect(hybrid).toBeDefined();
        item = engine.addStartingMod(item, hybrid.id, seededRandom(1));
        const catalyst = catalog.crafting.catalysts.find((entry) => entry.tags.includes("life"))!;
        item.catalyst = { id: catalyst.id, quality: 20 };
        const random = seededRandom(1);
        const integer = vi.spyOn(random, "integer").mockImplementation((_min, max) => max);
        const result = engine.apply(item, method, random).item;
        expect(integer.mock.calls.filter(([min, max]) => min === 78 && max === 122)).toHaveLength(
            2,
        );
        expect(scaledModValues(catalog, result.mods[1]!, result)).toEqual(
            hybrid.mod.stats.map((stat) => Math.round(stat.max * 1.22)),
        );
        expect(rolledModText(catalog, result.mods[0]!, result)).toBe("+27 to maximum Life");
        const altered = structuredClone(catalog);
        altered.crafting.sanctification = { min: 90, max: 110 };
        expect(
            new CraftingEngine(altered).apply(prepared(), method, random).item.mods[0]!
                .sanctification,
        ).toBe(110);
    });

    it("rejects invalid states and unsupported omen combinations before drawing randomness", () => {
        const item = prepared();
        const random = seededRandom(1);
        const integer = vi.spyOn(random, "integer");
        const blessed = catalog.crafting.currencies.find((entry) =>
            entry.id.endsWith("/OmenOnDivineRerollImplicits"),
        )!.id;
        for (const input of [
            { ...item, rarity: "magic" },
            { ...item, corrupted: true },
            { ...item, mirrored: true },
        ] satisfies CraftingItem[])
            expect(() => engine.apply(input, method, random)).toThrow();
        expect(() => engine.apply(item, { ...method, omens: [omen.id, blessed] }, random)).toThrow(
            "cannot be combined",
        );
        expect(integer).not.toHaveBeenCalled();
        const result = engine.apply(item, method, seededRandom(1)).item;
        for (const craft of [divine, currency("remove_random_mod"), currency("reroll")])
            expect(() => engine.apply(result, craft, random)).toThrow("Sanctified items");
        expect(integer).not.toHaveBeenCalled();
        for (const invalid of [
            { ...result, rarity: "magic" },
            { ...result, sanctified: undefined },
            { ...result, mods: [{ ...result.mods[0], sanctification: 123 }] },
            { ...result, mods: [{ ...result.mods[0], fractured: true }] },
            {
                ...result,
                implicits: result.implicits.map((mod) => ({ ...mod, sanctification: 100 })),
            },
        ])
            expect(() => engine.validateItem(invalid)).toThrow();
        const poe1 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe1.json", "utf8")),
            ),
        );
        expect(() =>
            poe1.validateItem({
                ...poe1.createItem(Object.keys(poe1.catalog.bases)[0]!),
                sanctified: true,
            }),
        ).toThrow("PoE 2 rare");
    });

    it("round-trips out-of-range displayed values and retains exact raw rolls in JSON", () => {
        const random = seededRandom(1);
        vi.spyOn(random, "integer").mockImplementation((_min, max) => max);
        const item = engine.apply(prepared(), method, random).item;
        expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
        const text = exportCraftingItemText(engine, item);
        expect(text).toContain("Sanctified");
        expect(text).toContain("+23 to maximum Life");
        const imported = importCraftingItemText(engine, text)[0]!;
        expect(imported.item.sanctified).toBe(true);
        expect(imported.warnings.length).toBeGreaterThan(0);
        expect(exportCraftingItemText(engine, imported.item)).toBe(text);
        expect(() => importCraftingItemText(engine, text.replace("\nSanctified", ""))).toThrow();
        expect(
            engine.validateItem(JSON.parse(JSON.stringify(prepared()))).sanctified,
        ).toBeUndefined();
    });

    it("retains crafted and desecrated flags and scales the extracted Breach quality bonus", () => {
        const breach = catalog.crafting.poe2Essences.find(
            (entry) => entry.name === "Essence of the Breach",
        )!.rules[0]!.mod!;
        let item = engine.addStartingMod(prepared(), breach, seededRandom(1), "essence");
        item.mods[0]!.desecrated = true;
        const random = seededRandom(1);
        vi.spyOn(random, "integer").mockImplementation((_min, max) => max);
        item = engine.apply(item, method, random).item;
        expect(item.mods[0]!.desecrated).toBe(true);
        expect(item.mods[1]!.crafted).toBe(true);
        expect(catalystLimit(catalog, item)).toBe(44);
        expect(
            exportCraftingItemText(
                engine,
                importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!.item,
            ),
        ).toBe(exportCraftingItemText(engine, item));
    });

    it("calculates stat odds and charges Divine and omen costs in exact and sampled processes", () => {
        const item = prepared();
        const target = engine.validateTarget({
            groups: [],
            stats: [{ id: "base_maximum_life", min: 23 }],
        });
        expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(4 / 450);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            target,
            method,
            steps: [{ id: "sanctify", method, condition: target }],
            prices: { [divine.id]: 2, [omen.id]: 3 },
            seed: 42,
            iterations: 1000,
            maxActions: 1,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.meanCost).toBeCloseTo(5);
        expect(exact.totalActions).toBeCloseTo(1);
        expect(exact.errors).toEqual({});
        expect(exact.probability).toBeCloseTo(4 / 450);
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 1000; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({ meanCost: 5, totalActions: 1000, errors: {} });
        expect(simulation.result().probability).toBeCloseTo(4 / 450, 2);
        expect(simulation.result().samples.every((sample) => sample.item.sanctified)).toBe(true);
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});
