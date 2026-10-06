import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableOmens } from "../app/lib/crafting-omens";
import { catalystLimit, retainedCatalystLimit } from "../app/lib/crafting-quality";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { rolledModText } from "../app/lib/crafting-text";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";

const catalog = craftingCatalogSchema.parse(
    JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
);
const engine = new CraftingEngine(catalog);
const essence = catalog.crafting.poe2Essences.find(
    (entry) => entry.name === "Essence of the Breach",
)!;
const mod = essence.rules[0]!.mod!;
const method = { kind: "essence" as const, id: essence.id };
const currency = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const omen = (suffix: string) =>
    catalog.crafting.currencies.find((entry) => entry.id.endsWith(`/${suffix}`))!.id;
const directional = { ...method, omens: [omen("OmenOnPerfectEssencePrefix")] };
const annul = { ...currency("remove_random_mod"), omens: [omen("OmenOnAnnulRemovePrefixes")] };
const catalyst = catalog.crafting.catalysts.find((entry) => entry.tags.includes("life"))!;

function prepared(itemClass = "Ring") {
    const base = Object.entries(catalog.bases).find(
        ([, entry]) => entry.item_class === itemClass && !entry.corrupted,
    )![0];
    return engine.validateItem({
        ...engine.createItem(base),
        rarity: "rare",
        mods: [
            engine.rollMod("IncreasedLife1", seededRandom(1)),
            engine.rollMod("ColdResist1", seededRandom(1)),
        ],
    });
}

describe("PoE 2 Essence of the Breach", () => {
    it.each([
        "Ring",
        "Amulet",
    ])("replaces a modifier on a %s using extracted restrictions and values", (itemClass) => {
        const item = prepared(itemClass);
        item.mods[1]!.fractured = true;
        const original = structuredClone(item);
        expect(engine.essenceSupported(essence.id)).toBe(true);
        expect(engine.recipePool(item, "essence").some((entry) => entry.id === mod)).toBe(true);
        expect(availableOmens(catalog, method)).toHaveLength(2);
        const result = engine.apply(item, directional, seededRandom(1));
        expect(item).toEqual(original);
        expect(result.item.mods).toContainEqual(item.mods[1]);
        expect(result.item.mods.find((entry) => entry.id === mod)).toMatchObject({
            values: catalog.mods[mod]!.stats.map((stat) => stat.max),
            crafted: true,
            fractured: false,
        });
        expect(result.item.rarity).toBe("rare");
        expect(result.item.implicits).toEqual(item.implicits);
        expect(catalystLimit(catalog, result.item)).toBe(40);
        expect(result.cost.map((entry) => [entry.id, entry.amount])).toEqual([
            [method.id, 1],
            [directional.omens[0], 1],
        ]);
        const manual = engine.addStartingMod(
            { ...item, mods: [] },
            mod,
            seededRandom(1),
            "essence",
        );
        expect(manual.mods[0]!.crafted).toBe(true);
    });

    it("rejects invalid starting states before consuming randomness", () => {
        const item = prepared();
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        const crafted = engine.apply(item, directional, seededRandom(1)).item;
        const invalid: [CraftingItem, string][] = [
            [{ ...item, rarity: "magic" }, "rare item"],
            [{ ...item, corrupted: true }, "corrupted"],
            [{ ...item, mirrored: true }, "mirrored"],
            [{ ...item, mods: [] }, "No eligible modifier"],
            [prepared("Body Armour"), "no modifier for this item class"],
            [crafted, "existing crafted modifier"],
        ];
        for (const [input, message] of invalid)
            expect(() => engine.apply(input, method, random)).toThrow(message);
        expect(pick).not.toHaveBeenCalled();
        const changed = structuredClone(catalog);
        changed.crafting.poe2Essences.find((entry) => entry.id === essence.id)!.replacement = [
            "Unknown",
        ];
        expect(() => new CraftingEngine(changed).validateMethod(method)).toThrow("outcome rule");
    });

    it("supports full items with automatic prefix removal and a compatible removal omen", () => {
        let item = prepared();
        for (const side of ["prefix", "prefix", "suffix", "suffix"])
            item = engine.addStartingMod(item, engine.pool(item, { side })[0]!.id, seededRandom(2));
        expect(item.mods).toHaveLength(6);
        const automatic = engine.apply(item, method, seededRandom(1)).item;
        const result = engine.apply(item, directional, seededRandom(1)).item;
        expect(automatic).toEqual(result);
        expect(engine.counts(result)).toEqual({ prefixes: 3, suffixes: 3 });
        expect(result.mods.some((entry) => entry.id === mod)).toBe(true);
        for (const suffix of item.mods.filter(
            (entry) => engine.mod(entry.id).generation_type === "suffix",
        ))
            expect(result.mods).toContainEqual(suffix);
    });

    it("retains increased catalyst quality through removal, later crafts and text/JSON round trips", () => {
        const enchanted = engine.apply(prepared(), directional, seededRandom(1)).item;
        const high = engine.validateItem({
            ...enchanted,
            catalyst: { id: catalyst.id, quality: 40 },
        });
        const removed = engine.apply(high, annul, seededRandom(1)).item;
        expect(removed.mods.some((entry) => entry.id === mod)).toBe(false);
        expect(removed.catalyst).toEqual(high.catalyst);
        expect(catalystLimit(catalog, removed)).toBe(20);
        expect(retainedCatalystLimit(catalog, removed)).toBe(50);
        const life = engine.addStartingMod(removed, "IncreasedLife1", seededRandom(1));
        life.mods.find((entry) => entry.id === "IncreasedLife1")!.values = [15];
        expect(rolledModText(catalog, life.mods[1]!, life)).toBe("+21 to maximum Life");
        const again = engine.apply(life, directional, seededRandom(1)).item;
        expect(again.catalyst).toEqual(high.catalyst);
        for (const item of [high, removed, life, again]) {
            expect(engine.validateItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!.item,
            ).toEqual(item);
        }
    });

    it("derives retained limits from the extracted essence and base modifiers without stacking the same bonus", () => {
        const ring = engine.createItem("Metadata/Items/Rings/FourRingBreach2");
        expect(catalystLimit(catalog, ring)).toBe(45);
        expect(retainedCatalystLimit(catalog, ring)).toBe(75);
        const high = engine.validateItem({ ...ring, catalyst: { id: catalyst.id, quality: 65 } });
        const withEssence = engine.addStartingMod(high, mod, seededRandom(1), "essence");
        expect(catalystLimit(catalog, withEssence)).toBe(65);
        expect(retainedCatalystLimit(catalog, withEssence)).toBe(75);
        expect(() =>
            engine.validateItem({ ...high, catalyst: { id: catalyst.id, quality: 76 } }),
        ).toThrow("maximum quality");
        const changed = structuredClone(catalog);
        changed.mods[mod]!.stats[0]!.min = 10;
        changed.mods[mod]!.stats[0]!.max = 10;
        expect(retainedCatalystLimit(changed, ring)).toBe(65);
        expect(
            retainedCatalystLimit(
                catalog,
                engine.createItem(
                    Object.entries(catalog.bases).find(
                        ([, base]) => base.item_class === "Jewel",
                    )![0],
                ),
            ),
        ).toBe(20);
    });

    it("calculates modeled removal odds and shares operation costs with conditional simulation", () => {
        const item = prepared();
        const target = engine.validateTarget({
            groups: [{ mods: [mod] }, { mods: ["ColdResist1"] }],
        });
        expect(calculateExact(engine, item, method, target).probability).toBe(0.5);
        expect(calculateExact(engine, item, directional, target).probability).toBe(1);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe2",
            patch: catalog.patch,
            item,
            target: { groups: [{ mods: ["ColdResist1"] }], affixCount: { min: 1, max: 1 } },
            method: directional,
            steps: [
                { id: "essence", method: directional, condition: target, onSuccess: "annul" },
                {
                    id: "annul",
                    method: annul,
                    condition: {
                        groups: [{ mods: ["ColdResist1"] }],
                        affixCount: { min: 1, max: 1 },
                    },
                },
            ],
            prices: {
                [method.id]: 18,
                [directional.omens[0]!]: 3,
                [annul.id]: 2,
                [annul.omens[0]!]: 1,
            },
            seed: 1,
            iterations: 20,
            maxActions: 2,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 24,
            totalActions: 2,
            errors: {},
        });
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 20; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            successes: 20,
            meanCost: 24,
            totalActions: 40,
            errors: {},
        });
        expect(simulation.result().samples.every((sample) => sample.item.mods.length === 1)).toBe(
            true,
        );
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});
