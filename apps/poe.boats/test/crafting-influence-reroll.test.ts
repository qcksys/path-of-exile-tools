import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { type CraftingItem, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const method = { kind: "harvest" as const, id: "RerollInfluenceType" };
const recipe = catalog.crafting.harvest.find((entry) => entry.id === method.id)!;
function prepared(influence = 0) {
    return engine.validateItem({
        ...engine.createItem(baseId),
        rarity: "rare",
        influences: [influence],
        mods: [],
    });
}
function bench(item: CraftingItem, stat: string) {
    const recipe = catalog.crafting.bench.find(
        (entry) =>
            entry.mod &&
            entry.itemClasses.includes(engine.base(item).item_class) &&
            catalog.mods[entry.mod]!.stats.some((value) => value.id === stat),
    )!;
    return engine.apply(item, { kind: "bench", id: recipe.id }, seededRandom(1)).item;
}

describe("Harvest influence randomisation", () => {
    it.each([
        0, 1, 2, 3, 4, 5,
    ])("changes influence %s using the other extracted influence types before reforging", (influence) => {
        const item = prepared(influence);
        item.quality = 20;
        const influenced = engine.pool(item, { influence })[0]!;
        item.mods = [engine.rollMod(influenced.id, seededRandom(1))];
        const before = structuredClone(item);
        const random = seededRandom(5);
        const pick = vi.spyOn(random, "pick");
        const result = engine.apply(item, method, random);
        expect(engine.harvestSupported(method.id)).toBe(true);
        expect(pick.mock.calls[0]![0]).toEqual(
            catalog.crafting.influences
                .filter(
                    (entry) => entry.itemClass === "Body Armour" && entry.influence !== influence,
                )
                .map((entry) => ({ value: entry.influence, weight: 1 })),
        );
        expect(result.item.influences).toHaveLength(1);
        expect(result.item.influences).not.toContain(influence);
        expect(result.item.mods.some((entry) => entry.id === influenced.id)).toBe(false);
        const empty = { ...result.item, mods: [] };
        expect(pick.mock.calls[2]![0]).toEqual(
            engine.pool(empty).map((entry) => ({ value: entry.id, weight: entry.weight })),
        );
        expect(result.item.mods.length).toBeGreaterThanOrEqual(4);
        expect(result.item.quality).toBe(20);
        expect(result.item.implicits).toEqual(item.implicits);
        expect(item).toEqual(before);
        expect(result.cost[0]!.amount).toBe(recipe.lifeforce);
    });

    it.each([
        "prefix",
        "suffix",
    ] as const)("preserves ordinary locked %ses but rejects locked influenced modifiers before randomness", (side) => {
        let item = prepared();
        item = engine.addStartingMod(
            item,
            side === "prefix" ? "IncreasedLife1" : "ColdResist1",
            seededRandom(1),
        );
        item = bench(item, `item_generation_cannot_change_${side}es`);
        const kept = item.mods.find((entry) => engine.mod(entry.id).generation_type === side)!;
        const result = engine.apply(item, method, seededRandom(3)).item;
        expect(result.mods).toContainEqual(kept);
        expect(result.influences).not.toEqual(item.influences);
        let invalid = prepared();
        const influenced = engine.pool(invalid, { influence: 0, side })[0]!;
        invalid = engine.addStartingMod(invalid, influenced.id, seededRandom(1));
        invalid = bench(invalid, `item_generation_cannot_change_${side}es`);
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(invalid, method, random)).toThrow(
            "influenced modifier is protected",
        );
        expect(pick).not.toHaveBeenCalled();
    });

    it("enforces extracted classes and rejects unverified rarity and dual-influence states", () => {
        const item = prepared();
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const input of [
            { ...item, influences: [] },
            { ...item, influences: [0, 1] },
            { ...item, rarity: "normal" },
            { ...item, rarity: "magic" },
            { ...item, corrupted: true },
            { ...item, mirrored: true },
        ] satisfies CraftingItem[])
            expect(() => engine.apply(input, method, random)).toThrow();
        const changed = structuredClone(catalog);
        changed.crafting.harvest.find((entry) => entry.id === method.id)!.influenceRerollClasses = [
            "Ring",
        ];
        expect(() => new CraftingEngine(changed).apply(item, method, random)).toThrow("item class");
        expect(() =>
            engine.apply(
                {
                    ...engine.createItem("Metadata/Items/Amulets/AmuletE1"),
                    rarity: "rare",
                    influences: [0],
                },
                method,
                random,
            ),
        ).toThrow("fixed influences");
        expect(pick).not.toHaveBeenCalled();
    });

    it("matches influence-only and dual-influence requirements alongside other conditions", () => {
        const item = prepared();
        const required = engine.validateTarget({ groups: [], influences: [0] });
        expect(engine.matches(item, required)).toBe(true);
        expect(engine.matches({ ...item, influences: [1] }, required)).toBe(false);
        expect(
            engine.matches(item, engine.validateTarget({ groups: [], influences: [0, 1] })),
        ).toBe(false);
        expect(
            engine.matches(
                { ...item, influences: [0, 1] },
                engine.validateTarget({ groups: [], influences: [0, 1] }),
            ),
        ).toBe(true);
        expect(engine.matches(item, engine.validateTarget({ ...required, rarity: "magic" }))).toBe(
            false,
        );
        for (const influences of [[0, 0], [6], [-1], [0, 1, 2, 3, 4, 5, 0]])
            expect(() => engine.validateTarget({ groups: [], influences })).toThrow();
        const changed = structuredClone(catalog);
        changed.crafting.influences = [];
        expect(() => new CraftingEngine(changed).validateTarget(required)).toThrow("unavailable");
        const result = engine.apply(item, method, seededRandom(2)).item;
        expect(
            importCraftingItemText(engine, exportCraftingItemText(engine, result)).some(
                (entry) => JSON.stringify(entry.item) === JSON.stringify(result),
            ),
        ).toBe(true);
    });

    it("calculates retries on the changed influence and accounts for lifeforce in the shared process", () => {
        let item = prepared();
        item = engine.addStartingMod(item, "IncreasedLife1", seededRandom(1));
        item = engine.addStartingMod(
            item,
            "LocalIncreasedPhysicalDamageReductionRating1",
            seededRandom(1),
        );
        item = engine.addStartingMod(item, "ColdResist1", seededRandom(1));
        item = bench(item, "item_generation_can_have_multiple_crafted_mods");
        item = bench(item, "item_generation_cannot_change_prefixes");
        item = bench(item, "item_generation_cannot_change_suffixes");
        expect(item.mods).toHaveLength(6);
        expect(item.mods.every((entry) => engine.protected(item, entry))).toBe(true);
        const target = engine.validateTarget({ groups: [], influences: [1] });
        expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(0.2);
        const cost = engine.costs(method)[0]!;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            target,
            method,
            steps: [{ id: "reroll", method, condition: target, onFailure: "reroll" }],
            useProcess: true,
            prices: { [cost.id]: 0.01 },
            seed: 42,
            iterations: 1000,
            maxActions: 2,
        });
        const exact = calculateProcessExact(engine, project);
        expect(exact.probability).toBeCloseTo(0.36);
        expect(exact.meanCost).toBeCloseTo(cost.amount * 0.018);
        expect(exact.totalActions).toBeCloseTo(1.8);
        expect(exact.errors).toEqual({});
        const simulation = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < project.iterations; trial++) simulation.runTrial();
        expect(simulation.result().probability).toBeCloseTo(0.36, 1);
        expect(simulation.result().errors).toEqual({});
        expect(simulation.result().samples.every((sample) => sample.item.mods.length === 6)).toBe(
            true,
        );
        expect(craftingProjectSchema.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
    });
});
