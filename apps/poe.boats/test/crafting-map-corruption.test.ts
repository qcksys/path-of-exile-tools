import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
    hasCraftingRequirements,
} from "../app/lib/crafting-simulation";
import { type CraftingItem, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const vaal = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!.id,
};
const twice = {
    kind: "beast" as const,
    id: catalog.crafting.beasts.find((entry) => entry.mapCorruption === "twice")!.id,
};
const blank = (suffix = "MapAtlasBeach") => engine.createItem(`Metadata/Items/Maps/${suffix}`, 86);
const outcomes = ["none", "transform", "reroll-eight", "implicit"];
function force(...selected: (string | boolean)[]) {
    const random = seededRandom(42);
    const original = random.pick;
    const pick = vi.spyOn(random, "pick").mockImplementation((choices) => {
        if (selected.length && choices.some((entry) => entry.value === selected[0])) {
            const value = selected.shift();
            return choices.find((entry) => entry.value === value)!.value;
        }
        return original(choices);
    });
    return { random, pick };
}
function prepared(rarity: CraftingItem["rarity"] = "rare") {
    let item = { ...blank(), rarity, quality: 20 };
    for (const side of rarity === "normal" ? [] : ["prefix", "suffix"])
        item = engine.addStartingMod(item, engine.pool(item, { side })[0]!.id, seededRandom(1));
    return item;
}

describe("PoE 1 map Vaal and double corruption", () => {
    it("uses extracted map records and recipe operations across every craftable map", () => {
        const maps = Object.keys(catalog.bases).filter(
            (id) => catalog.bases[id]!.item_class === "Map",
        );
        expect(maps).toHaveLength(486);
        for (const id of maps) {
            const item = engine.createItem(id);
            expect(engine.map(item)?.id).toBe(id);
            expect(engine.corruptionKind(item)).toBe("map");
        }
        const changed = structuredClone(catalog);
        const recipe = changed.crafting.beasts.find((entry) => entry.id === twice.id)!;
        recipe.id = "ChangedTwiceRecipeId";
        expect(new CraftingEngine(changed).beastOperation(recipe.id)).toBe("map-twice");
        expect(engine.beastRequiresLevel(twice.id)).toBe(false);
        recipe.gameMode = 2;
        expect(new CraftingEngine(changed).beastOperation(recipe.id)).toBeUndefined();
    });

    it.each([
        "normal",
        "magic",
        "rare",
    ] as const)("supports all four outcomes on %s maps", (rarity) => {
        const item = prepared(rarity);
        const before = structuredClone(item);
        for (const outcome of outcomes) {
            const { random } = force(outcome, false);
            const result = engine.apply(item, vaal, random);
            expect(result.item.corrupted).toBe(true);
            expect(result.item.quality).toBe(20);
            expect(result.item.level).toBe(86);
            expect(result.cost.map(({ id, amount }) => [id, amount])).toEqual([[vaal.id, 1]]);
            expect(engine.validateItem(result.item)).toEqual(result.item);
            if (outcome === "none") expect(result.item).toEqual({ ...item, corrupted: true });
            if (outcome === "implicit") {
                expect(result.item.mods).toEqual(item.mods);
                expect(result.item.rarity).toBe(rarity);
                expect(result.item.implicits).toHaveLength(1);
            }
            if (outcome === "reroll-eight") {
                expect(result.item.rarity).toBe("rare");
                expect(result.item.mods).toHaveLength(8);
                expect(engine.counts(result.item)).toEqual({ prefixes: 4, suffixes: 4 });
                expect(() => engine.validateItem({ ...result.item, corrupted: false })).toThrow(
                    "affix limits",
                );
            }
            if (outcome === "transform") {
                expect(result.item.baseId).toBe(item.baseId);
                expect(result.item.rarity).toBe("rare");
                expect(result.item.mods.length).toBeGreaterThanOrEqual(4);
                expect(result.item.mods.length).toBeLessThanOrEqual(6);
            }
        }
        expect(item).toEqual(before);
    });

    it.each([
        ["MapAtlasBeach", "MapAtlasVaalPyramid"],
        ["MapAtlasBeachShaped", "MapAtlasShore"],
        ["MapWorldsBeach", "MapWorldsDesert"],
        ["MapWorldsTrialmaster", "MapWorldsTrialmaster"],
        ["MapWorldsVaalTemple", "MapAtlasVaalTemple"],
    ])("transforms %s using the extracted upgrade or Vaal Temple outcome", (source, expected) => {
        const result = engine.apply(blank(source), vaal, force("transform", true).random).item;
        expect(result.baseId).toBe(`Metadata/Items/Maps/${expected}`);
        expect(engine.validateItem(result)).toEqual(result);
        expect(engine.map(result)?.areaLevel).toBe(
            catalog.crafting.maps.find((entry) => entry.id === result.baseId)!.areaLevel,
        );
    });

    it("preserves fractures in the eight-affix outcome and removes them during transformation", () => {
        const item = prepared();
        item.mods[0]!.fractured = true;
        const result = engine.apply(item, vaal, force("reroll-eight").random).item;
        expect(result.mods[0]).toEqual(item.mods[0]);
        expect(result.mods).toHaveLength(8);
        const transformed = engine.apply(item, vaal, force("transform", true).random).item;
        expect(transformed.mods.every((entry) => !entry.fractured)).toBe(true);
        expect(engine.validateItem(transformed)).toEqual(transformed);
    });

    it("selects every ordered pair without replacement and applies later outcomes to the earlier result", () => {
        for (const first of outcomes)
            for (const second of outcomes.filter((outcome) => outcome !== first)) {
                const choices: (string | boolean)[] = [first];
                if (first === "transform") choices.push(true);
                choices.push(second);
                if (second === "transform") choices.push(true);
                const { random, pick } = force(...choices);
                const result = engine.apply(blank(), twice, random);
                const categories = pick.mock.calls.filter(([entries]) =>
                    entries.some(
                        (entry) => entry.value === "reroll-eight" || entry.value === "transform",
                    ),
                );
                expect(categories).toHaveLength(2);
                expect(categories[0]![0]).toEqual(outcomes.map((value) => ({ value, weight: 1 })));
                expect(categories[1]![0]).toEqual(
                    outcomes
                        .filter((value) => value !== first)
                        .map((value) => ({ value, weight: 1 })),
                );
                expect(result.item.corrupted).toBe(true);
                expect(result.item.twiceCorrupted).toBeUndefined();
                expect(result.cost).toEqual([
                    { id: twice.id, name: "Beastcraft · Corrupt a Map: Twice", amount: 1 },
                ]);
                expect(result.item.implicits.length).toBe(
                    second === "implicit" || (first === "implicit" && second !== "transform")
                        ? 1
                        : 0,
                );
                if (
                    second === "reroll-eight" ||
                    (first === "reroll-eight" && second !== "transform")
                )
                    expect(result.item.mods).toHaveLength(8);
                if (second === "transform") expect(result.item.mods.length).toBeLessThanOrEqual(6);
                expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(
                    result.item,
                );
            }
    });

    it("preserves eight affixes and map tier through item text and rejects mismatched or malformed tiers", () => {
        const item = engine.apply(blank(), vaal, force("reroll-eight").random).item;
        const text = exportCraftingItemText(engine, item);
        expect(text).toContain("Map Tier: 2");
        const imported = importCraftingItemText(engine, text);
        expect(imported).toHaveLength(1);
        expect(imported[0]!.item).toEqual(item);
        expect(() =>
            importCraftingItemText(engine, text.replace("Map Tier: 2", "Map Tier: 99")),
        ).toThrow("not present");
        expect(() =>
            importCraftingItemText(engine, text.replace("Map Tier: 2", "Map Tier: 2.5")),
        ).toThrow("whole-number");
        expect(() => importCraftingItemText(engine, `${text}\nMap Tier: 2`)).toThrow(
            "whole-number",
        );
        expect(
            importCraftingItemText(engine, text.replace("Map Tier: 2\n", "")).some(
                (entry) => entry.item.baseId === item.baseId,
            ),
        ).toBe(true);
        expect(engine.matches(item, engine.validateTarget({ groups: [], openAffixes: 1 }))).toBe(
            false,
        );
    });

    it("calculates tier chances and process costs using the same outcome tree as full-pool simulations", () => {
        const narrow = new CraftingEngine({ ...catalog, mods: {} });
        const target = engine.validateTarget({ groups: [], mapTier: { min: 3, max: 3 } });
        expect(hasCraftingRequirements(target)).toBe(true);
        expect(engine.matches(engine.createItem(baseId), target)).toBe(false);
        for (const [method, probability] of [
            [vaal, 1 / 8],
            [twice, 1 / 4],
        ] as const) {
            expect(calculateExact(narrow, blank(), method, target).probability).toBeCloseTo(
                probability,
            );
            const project = craftingProjectSchema.parse({
                format: 1,
                game: "poe1",
                patch: catalog.patch,
                item: blank(),
                method,
                target,
                steps: [{ id: "corrupt-map", method, condition: target }],
                prices: { [method.id]: 7 },
                seed: 42,
                iterations: 1000,
                maxActions: 1,
            });
            expect(calculateProcessExact(narrow, project)).toMatchObject({
                probability: expect.closeTo(probability),
                meanCost: expect.closeTo(7),
                errors: {},
            });
            const simulation = new CraftingSimulation(catalog, project, true);
            for (let index = 0; index < project.iterations; index++) simulation.runTrial();
            const result = simulation.result();
            expect(Math.abs(result.probability - probability)).toBeLessThan(0.035);
            expect(result).toMatchObject({
                meanCost: 7,
                errors: {},
                timeouts: 0,
                spending: { [method.id]: 1000 },
            });
            const countProject = {
                ...project,
                target: engine.validateTarget({ groups: [], affixCount: { min: 8, max: 8 } }),
            };
            const counts = new CraftingSimulation(catalog, countProject, false);
            for (let index = 0; index < project.iterations; index++) counts.runTrial();
            expect(
                Math.abs(counts.result().probability - (method === vaal ? 1 / 4 : 5 / 12)),
            ).toBeLessThan(0.04);
            expect(counts.result().errors).toEqual({});
        }
        for (const range of [
            { min: 0, max: 1 },
            { min: 1, max: 18 },
            { min: 3, max: 2 },
        ])
            expect(() => engine.validateTarget({ groups: [], mapTier: range })).toThrow();
    });

    it("rejects corrupted, mirrored and non-map beast inputs before random selection", () => {
        const { random, pick } = force();
        for (const method of [vaal, twice])
            for (const state of [{ corrupted: true }, { mirrored: true }])
                expect(() => engine.apply({ ...blank(), ...state }, method, random)).toThrow();
        expect(() => engine.apply(engine.createItem(baseId), twice, random)).toThrow(
            "requires a map",
        );
        expect(pick).not.toHaveBeenCalled();
        const narrow = new CraftingEngine({ ...catalog, mods: {} });
        expect(narrow.apply(blank(), vaal, force("reroll-eight").random).item.mods).toEqual([]);
    });
});
