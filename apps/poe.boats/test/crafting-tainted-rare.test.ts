import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { memoryConsumption } from "../app/lib/crafting-memory";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import {
    type CraftingItem,
    craftingCatalogSchema,
    craftingProjectSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const method = (action: string) => ({
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === action)!.id,
});
const chaos = method("reroll_rare_hellscape");
const exalt = method("add_mod_to_rare_hellscape");
const first: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };
const last: CraftingRandom = {
    pick: (choices) => choices.at(-1)!.value,
    integer: (_min, max) => max,
};
const empty = (): CraftingItem => ({
    ...engine.createItem(baseId),
    rarity: "rare",
    corrupted: true,
    quality: 20,
    sockets: 6,
});
function prepared(count = 4) {
    let item = empty();
    for (let index = 0; index < count; index++)
        item = engine.addStartingMod(item, engine.pool(item)[0]!.id, seededRandom(index));
    return item;
}
const targetCount = (count: number) =>
    engine.validateTarget({ groups: [], affixCount: { min: count, max: count } });
const projectFor = (item: CraftingItem, selected = exalt) =>
    craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: catalog.patch,
        item,
        method: selected,
        target: targetCount(4),
        steps: [],
        prices: { [selected.id]: 2 },
        seed: 42,
        iterations: 1000,
        maxActions: 2,
    });

describe("PoE 1 tainted rare-item currency", () => {
    it("uses extracted actions and isolates them from PoE 2", () => {
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        for (const action of ["reroll_rare_hellscape", "add_mod_to_rare_hellscape"]) {
            expect(engine.currencySupported(action)).toBe(true);
            expect(poe2.currencySupported(action)).toBe(false);
        }
        expect(engine.methodName(chaos)).toBe("Tainted Chaos Orb");
        expect(engine.methodName(exalt)).toBe("Tainted Exalted Orb");
    });

    it("reforges using the extracted pool and preserves corruption, sockets, quality and implicits", () => {
        const item = prepared(5);
        const original = structuredClone(item);
        for (const selected of [chaos, exalt]) {
            const result = engine.apply(item, selected, first);
            expect(result.item.mods).toHaveLength(selected === chaos ? 4 : 6);
            expect(result.item).toMatchObject({
                rarity: "rare",
                corrupted: true,
                sockets: 6,
                quality: 20,
                implicits: item.implicits,
            });
            expect(
                result.item.mods.every((entry) =>
                    engine.pool(empty()).some((candidate) => candidate.id === entry.id),
                ),
            ).toBe(true);
            expect(result.cost).toEqual([
                { id: selected.id, name: engine.methodName(selected), amount: 1 },
            ]);
            expect(item).toEqual(original);
        }
    });

    it("scours to the lowest rarity permitted by retained fractures", () => {
        for (const retained of [0, 1, 2]) {
            const item = prepared();
            const prefixes = item.mods.filter(
                (entry) => engine.mod(entry.id).generation_type === "prefix",
            );
            expect(prefixes.length).toBeGreaterThanOrEqual(2);
            for (const entry of prefixes.slice(0, retained)) entry.fractured = true;
            const result = engine.apply(item, chaos, last).item;
            expect(result.mods).toEqual(prefixes.slice(0, retained));
            expect(result.rarity).toBe(
                retained === 0 ? "normal" : retained === 1 ? "magic" : "rare",
            );
            expect(result.corrupted).toBe(true);
            if (retained < 2) expect(() => engine.apply(result, chaos, first)).toThrow("rare item");
        }
    });

    it("keeps a zero-modifier item rare after Tainted Exalted removal and forces addition to it", () => {
        const item = prepared(1);
        const removed = engine.apply(item, exalt, last).item;
        expect(removed.mods).toEqual([]);
        expect(removed.rarity).toBe("rare");
        expect(engine.apply(removed, exalt, last).item.mods).toHaveLength(1);
        expect(calculateExact(engine, item, exalt, targetCount(0)).probability).toBe(0.5);
        expect(calculateExact(engine, removed, exalt, targetCount(1)).probability).toBeCloseTo(
            1,
            12,
        );
    });

    it("forces removal from full equipment and jewels using their actual affix caps", () => {
        const jewelBase = Object.entries(catalog.bases).find(
            ([, base]) => base.name === "Cobalt Jewel",
        )![0];
        let jewel: CraftingItem = {
            ...engine.createItem(jewelBase),
            rarity: "rare",
            corrupted: true,
        };
        while (jewel.mods.length < 4)
            jewel = engine.addStartingMod(jewel, engine.pool(jewel)[0]!.id, seededRandom(1));
        for (const item of [prepared(6), jewel]) {
            const result = engine.apply(item, exalt, first).item;
            expect(result.mods).toEqual(item.mods.slice(1));
            expect(
                calculateExact(engine, item, exalt, targetCount(item.mods.length - 1)).probability,
            ).toBeCloseTo(1, 12);
        }
    });

    it("respects fractures and metamod locks for reforge, scour and removal", () => {
        let item = engine.addStartingMod(empty(), "IncreasedLife1", seededRandom(1));
        const lock = engine
            .recipePool(item, "bench")
            .find((entry) =>
                entry.mod.stats.some(
                    (stat) => stat.id === "item_generation_cannot_change_prefixes",
                ),
            )!;
        item = engine.addStartingMod(item, lock.id, seededRandom(2));
        const prefix = item.mods[0]!;
        const scoured = engine.apply(item, chaos, last).item;
        expect(scoured.mods).toEqual([prefix]);
        expect(scoured.rarity).toBe("magic");
        expect(engine.apply(item, chaos, first).item.mods).toContainEqual(prefix);
        expect(engine.apply(item, exalt, last).item.mods).toEqual([prefix]);
        const fractured = prepared();
        fractured.mods[0]!.fractured = true;
        expect(engine.apply(fractured, chaos, first).item.mods).toContainEqual(fractured.mods[0]);
        expect(engine.apply(fractured, exalt, last).item.mods).toContainEqual(fractured.mods[0]);
    });

    it("uses strand-restricted rolls and consumes the extracted action costs on either branch", () => {
        const item = { ...prepared(), memoryStrands: 82 };
        for (const selected of [chaos, exalt]) {
            const maximum = selected === chaos ? 60 : 16;
            expect(memoryConsumption(catalog, item, selected)?.maximum).toBe(maximum);
            const rerolled = engine.apply(item, selected, first).item;
            const source = engine.pool(empty(), { memoryStrands: 82 });
            const added =
                selected === chaos ? rerolled.mods : rerolled.mods.slice(item.mods.length);
            expect(
                added.every((entry) => source.some((candidate) => candidate.id === entry.id)),
            ).toBe(true);
            expect(rerolled.memoryStrands).toBe(82);
            expect(engine.apply(item, selected, last).item.memoryStrands).toBe(82 - maximum);
        }
    });

    it("rejects invalid and fully protected inputs before randomness", () => {
        const item = prepared();
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const selected of [chaos, exalt])
            for (const invalid of [
                { ...item, corrupted: false },
                { ...item, mirrored: true },
                { ...empty(), rarity: "normal" as const },
            ])
                expect(() => engine.apply(invalid, selected, random)).toThrow(
                    "corrupted, unmirrored rare item",
                );
        const protectedItem = prepared(1);
        protectedItem.mods[0]!.fractured = true;
        expect(() => engine.apply(protectedItem, exalt, random)).toThrow("remove outcome");
        expect(pick).not.toHaveBeenCalled();
    });

    it("retains crafted outcomes in project JSON and item text", () => {
        for (const selected of [chaos, exalt]) {
            const item = engine.apply(prepared(), selected, last).item;
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!.item,
            ).toEqual(item);
            const project = projectFor(item, selected);
            expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(
                project,
            );
        }
    });

    it("calculates and simulates a two-step Tainted Exalted process with matching costs", () => {
        const project = projectFor(prepared(6));
        project.steps = [
            {
                id: "first",
                method: exalt,
                condition: targetCount(5),
                onSuccess: "second",
                onFailure: "failure",
            },
            {
                id: "second",
                method: exalt,
                condition: targetCount(4),
                onSuccess: "success",
                onFailure: "failure",
            },
        ];
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(0.5, 12);
        expect(exact.meanCost).toBeCloseTo(4, 12);
        expect(exact.totalActions).toBeCloseTo(2, 12);
        expect(exact.errors).toEqual({});
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < project.iterations; trial++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.probability).toBeGreaterThan(0.45);
        expect(result.probability).toBeLessThan(0.55);
        expect(result.meanCost).toBe(4);
        expect(result.spending[exalt.id]).toBe(2000);
    });

    it("samples both Tainted Chaos outcomes and preserves failure costs in a second step", () => {
        const project = projectFor(prepared(), chaos);
        project.target = engine.validateTarget({ groups: [], rarity: "normal" });
        const simulation = new CraftingSimulation(catalog, project, false);
        for (let trial = 0; trial < project.iterations; trial++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            errors: {},
            meanCost: 2,
            spending: { [chaos.id]: 1000 },
        });
        expect(simulation.result().probability).toBeGreaterThan(0.45);
        expect(simulation.result().probability).toBeLessThan(0.55);
        project.steps = [
            {
                id: "chaos",
                method: chaos,
                condition: { ...project.target, rarity: undefined },
                onSuccess: "exalt",
                onFailure: "failure",
            },
            {
                id: "exalt",
                method: exalt,
                condition: targetCount(0),
                onSuccess: "success",
                onFailure: "failure",
            },
        ];
        project.prices[exalt.id] = 3;
        const process = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < project.iterations; trial++) process.runTrial();
        const result = process.result();
        expect(result.spending[chaos.id]).toBe(1000);
        expect(Object.values(result.errors).reduce((sum, count) => sum + count, 0)).toBe(
            1000 - result.spending[exalt.id]!,
        );
        expect(result.meanCost).toBe((2000 + 3 * result.spending[exalt.id]!) / 1000);
    });
});
