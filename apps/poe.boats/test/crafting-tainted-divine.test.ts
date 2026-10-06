import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, type CraftingRandom, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { memoryConsumption, modifierFamily } from "../app/lib/crafting-memory";
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

const method = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === "upgrade_mod_tier_hellscape")!
        .id,
};
const up: CraftingRandom = { pick: (choices) => choices[0]!.value, integer: (min) => min };
const down: CraftingRandom = {
    pick: (choices) => choices.at(-1)!.value,
    integer: (_min, max) => max,
};
const empty = (level = 86): CraftingItem => ({
    ...engine.createItem(baseId, level),
    rarity: "rare",
    corrupted: true,
    memoryStrands: 82,
    sockets: 6,
    quality: 20,
});
const prepared = (ids = ["IncreasedLife2"], level = 86) =>
    ids.reduce((item, id) => engine.addStartingMod(item, id, seededRandom(1)), empty(level));
const target = engine.validateTarget({ groups: [{ mods: ["IncreasedLife2"] }] });

describe("Tainted Divine Teardrop", () => {
    it("uses the extracted action and has no strand consumption or PoE 2 support", () => {
        expect(engine.methodName(method)).toBe("Tainted Divine Teardrop");
        expect(engine.currencySupported("upgrade_mod_tier_hellscape")).toBe(true);
        expect(memoryConsumption(catalog, empty(), method)).toBeUndefined();
        const poe2 = new CraftingEngine(
            craftingCatalogSchema.parse(
                JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
            ),
        );
        expect(poe2.currencySupported("upgrade_mod_tier_hellscape")).toBe(false);
    });

    it("moves exactly one tier, rerolls changed values and preserves unrelated state", () => {
        const item = prepared();
        const before = structuredClone(item);
        for (const [random, id, value] of [
            [up, "IncreasedLife3", 40],
            [down, "IncreasedLife1", 24],
        ] as const) {
            const result = engine.apply(item, method, random);
            expect(result.item).toEqual({
                ...item,
                mods: [{ id, values: [value], crafted: false, fractured: false }],
            });
            expect(result.cost).toEqual([
                { id: method.id, name: engine.methodName(method), amount: 1 },
            ]);
        }
        expect(item).toEqual(before);
    });

    it("keeps values on failed boundary moves and respects the extracted base and level pool", () => {
        const family = engine
            .pool(empty())
            .filter(
                (entry) =>
                    modifierFamily(entry.mod) === modifierFamily(engine.mod("IncreasedLife1")),
            )
            .sort((a, b) => b.mod.required_level - a.mod.required_level);
        const highest = prepared([family[0]!.id]);
        const lowest = prepared([family.at(-1)!.id]);
        expect(engine.apply(lowest, method, down).item).toEqual(lowest);
        expect(engine.apply(highest, method, up).item).toEqual(highest);
        const lowLevel = { ...prepared(["IncreasedLife1"], 5), sockets: 0 };
        expect(engine.apply(lowLevel, method, up).item).toEqual(lowLevel);
        const jewelBase = Object.entries(catalog.bases).find(
            ([, base]) => base.name === "Cobalt Jewel",
        )![0];
        let jewel: CraftingItem = {
            ...engine.createItem(jewelBase),
            rarity: "rare",
            corrupted: true,
        };
        jewel = engine.addStartingMod(jewel, engine.pool(jewel)[0]!.id, seededRandom(1));
        expect(engine.apply(jewel, method, up).item).toEqual(jewel);
    });

    it("rolls modifier directions independently and ignores strand tier filtering", () => {
        const item = prepared(["IncreasedLife1", "FireResist1"]);
        const both = engine.validateTarget({
            groups: [{ mods: ["IncreasedLife2"] }, { mods: ["FireResist2"] }],
        });
        expect(calculateExact(engine, item, method, both).probability).toBeCloseTo(0.25, 12);
        const result = engine.apply(item, method, up).item;
        expect(result.mods.map((entry) => entry.id)).toEqual(["IncreasedLife2", "FireResist2"]);
        expect(result.memoryStrands).toBe(82);
    });

    it("preserves fractured, crafted and prefix-locked modifiers", () => {
        const fractured = prepared();
        fractured.mods[0]!.fractured = true;
        expect(engine.apply(fractured, method, up).item).toEqual(fractured);
        const lock = engine
            .recipePool(empty(), "bench")
            .find((entry) =>
                entry.mod.stats.some(
                    (stat) => stat.id === "item_generation_cannot_change_prefixes",
                ),
            )!;
        const locked = engine.addStartingMod(prepared(), lock.id, seededRandom(2));
        expect(engine.apply(locked, method, down).item).toEqual(locked);
        const craft = engine
            .recipePool(empty(), "bench")
            .find((entry) => entry.mod.stats.some((stat) => stat.id === "base_maximum_life"))!;
        const crafted = engine.addStartingMod(empty(), craft.id, seededRandom(1));
        expect(engine.apply(crafted, method, up).item).toEqual(crafted);
    });

    it("preserves non-rollable essence modifiers and rejects invalid state before randomness", () => {
        const essence = engine
            .recipePool(empty(), "essence")
            .find((entry) => entry.mod.is_essence_only)!;
        expect(essence).toBeDefined();
        const special = engine.addStartingMod(empty(), essence.id, seededRandom(1), "essence");
        expect(engine.apply(special, method, down).item).toEqual(special);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            { ...prepared(), corrupted: false },
            { ...prepared(), mirrored: true },
            { ...empty(), rarity: "normal" as const },
        ])
            expect(() => engine.apply(item, method, random)).toThrow(
                "corrupted, unmirrored rare item",
            );
        expect(pick).not.toHaveBeenCalled();
    });

    it("retains changed tiers and rolls in JSON and item text", () => {
        const item = engine.apply(prepared(), method, up).item;
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, item))[0]!.item,
        ).toEqual(item);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method,
            target,
            prices: {},
            steps: [],
            iterations: 1000,
            maxActions: 3,
            seed: 42,
        });
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });

    it("calculates and simulates bounded retries with their actual costs", () => {
        const target = engine.validateTarget({ groups: [{ mods: ["IncreasedLife1"] }] });
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item: prepared(["IncreasedLife0"]),
            method,
            target,
            prices: { [method.id]: 4 },
            seed: 42,
            iterations: 1000,
            maxActions: 3,
            steps: [
                {
                    id: "retry",
                    method,
                    condition: target,
                    onSuccess: "success",
                    onFailure: "retry",
                },
            ],
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(0.875, 12);
        expect(exact.meanCost).toBeCloseTo(7, 12);
        expect(exact.totalActions).toBeCloseTo(1.75, 12);
        expect(exact.errors).toEqual({});
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < project.iterations; trial++) simulation.runTrial();
        const result = simulation.result();
        expect(result.errors).toEqual({});
        expect(result.probability).toBeGreaterThan(0.84);
        expect(result.probability).toBeLessThan(0.91);
        expect(result.meanCost).toBeCloseTo(7, 0);
        expect(result.meanCost).toBe((4 * result.spending[method.id]!) / 1000);
    });
});
