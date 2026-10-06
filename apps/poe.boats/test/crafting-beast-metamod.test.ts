import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { type CraftingItem, craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const method = { kind: "beast" as const, id: "EinharMasterCraftMemoryLine1" };
const recipe = catalog.crafting.beasts.find((entry) => entry.id === method.id)!;
const suffixLock = "DexMasterItemGenerationCannotChangeSuffixes";
const multimod = "StrIntMasterItemGenerationCanHaveMultipleCraftedMods";
const blank = (rarity: CraftingItem["rarity"] = "rare", level = 86): CraftingItem => ({
    ...engine.createItem(baseId, level),
    rarity,
});
function fillSide(item: CraftingItem, side: "prefix" | "suffix") {
    let filled = item;
    for (;;) {
        const next = engine.pool(filled, { side })[0];
        if (!next) return filled;
        filled = engine.addStartingMod(filled, next.id, seededRandom(1));
    }
}
function force(id: string) {
    const random = seededRandom(42);
    vi.spyOn(random, "pick").mockImplementationOnce(
        (choices) => choices.find((entry) => entry.value === id)!.value,
    );
    return random;
}

describe("random metamod beastcraft", () => {
    it("uses five extracted metamods with equal probabilities at any item level", () => {
        expect(engine.beastOperation(method.id)).toBe("metamod");
        expect(engine.beastRequiresLevel(method.id)).toBe(false);
        expect(recipe.metamods).toHaveLength(5);
        for (const rarity of ["normal", "magic", "rare"] as const) {
            const item = { ...blank(rarity, 1), memoryStrands: 82, quality: 20, sockets: 6 };
            expect(
                engine
                    .beastMetamodPool(item, method.id)
                    .map((entry) => entry.id)
                    .sort(),
            ).toEqual([...recipe.metamods].sort());
            for (const id of recipe.metamods) {
                const target = engine.validateTarget({ groups: [{ mods: [id] }] });
                expect(calculateExact(engine, item, method, target).probability).toBeCloseTo(
                    0.2,
                    12,
                );
                const result = engine.apply(item, method, force(id));
                expect(result.item).toEqual({
                    ...item,
                    rarity: rarity === "normal" ? "magic" : rarity,
                    mods: [engine.rollMod(id, seededRandom(1))],
                });
                expect(result.item.mods[0]!.crafted).toBe(true);
                expect(result.cost).toEqual([
                    {
                        id: method.id,
                        name: `Beastcraft · ${recipe.category}: ${recipe.description}`,
                        amount: 1,
                    },
                ]);
                expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(
                    result.item,
                );
            }
        }
    });

    it.each([
        "magic",
        "rare",
    ] as const)("guarantees suffix protection on a %s item with full suffixes", (rarity) => {
        const item = fillSide(blank(rarity), "suffix");
        expect(engine.beastMetamodPool(item, method.id).map((entry) => entry.id)).toEqual([
            suffixLock,
        ]);
        const result = engine.apply(item, method, seededRandom(42)).item;
        expect(result.mods.slice(0, -1)).toEqual(item.mods);
        expect(result.mods.at(-1)!.id).toBe(suffixLock);
        expect(
            calculateExact(
                engine,
                item,
                method,
                engine.validateTarget({ groups: [{ mods: [suffixLock] }] }),
            ).probability,
        ).toBe(1);
        const text = exportCraftingItemText(engine, result);
        expect(text).toContain("Suffixes Cannot Be Changed");
        const imported = importCraftingItemText(engine, text)[0]!.item;
        expect(imported.mods.map((entry) => entry.id)).toEqual(
            result.mods.map((entry) => entry.id),
        );
        expect(imported.mods.at(-1)).toEqual(result.mods.at(-1));
        expect(engine.validateItem(JSON.parse(JSON.stringify(result)))).toEqual(result);
    });

    it("uses four suffix outcomes with full prefixes and excludes an existing multimod", () => {
        const fullPrefixes = fillSide(blank(), "prefix");
        expect(engine.beastMetamodPool(fullPrefixes, method.id)).toHaveLength(4);
        for (const entry of engine.beastMetamodPool(fullPrefixes, method.id)) {
            expect(entry.mod.generation_type).toBe("suffix");
            expect(
                calculateExact(
                    engine,
                    fullPrefixes,
                    method,
                    engine.validateTarget({ groups: [{ mods: [entry.id] }] }),
                ).probability,
            ).toBeCloseTo(0.25, 12);
        }
        const multiRecipe = catalog.crafting.bench.find((entry) => entry.mod === multimod)!;
        const multi = engine.apply(
            blank(),
            { kind: "bench", id: multiRecipe.id },
            seededRandom(1),
        ).item;
        const pool = engine.beastMetamodPool(multi, method.id);
        expect(pool).toHaveLength(4);
        expect(pool.some((entry) => entry.id === multimod)).toBe(false);
        for (const entry of pool) {
            const result = engine.apply(multi, method, force(entry.id)).item;
            expect(result.mods.filter((mod) => mod.crafted)).toHaveLength(2);
            expect(engine.craftedLimit(result)).toBe(3);
            expect(result.mods[0]).toEqual(multi.mods[0]);
        }
    });

    it("rejects ordinary crafts and repeated metamods, including alongside multimod, before randomness", () => {
        const craft = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                entry.itemClasses.includes("Body Armour") &&
                engine.mod(entry.mod).type === "IncreasedLife",
        )!;
        const life = engine.apply(blank(), { kind: "bench", id: craft.id }, seededRandom(1)).item;
        const meta = engine.apply(blank(), method, force(suffixLock)).item;
        const multi = engine.apply(blank(), method, force(multimod)).item;
        const multiLife = engine.apply(
            multi,
            { kind: "bench", id: craft.id },
            seededRandom(1),
        ).item;
        const multiMeta = engine.apply(multi, method, force(suffixLock)).item;
        for (const item of [life, meta, multiLife, multiMeta]) {
            const before = structuredClone(item);
            const random = seededRandom(1);
            const pick = vi.spyOn(random, "pick");
            expect(() => engine.apply(item, method, random)).toThrow(
                "Remove existing crafted modifiers",
            );
            expect(pick).not.toHaveBeenCalled();
            expect(item).toEqual(before);
        }
        const remove = catalog.crafting.bench.find((entry) => entry.action === 0 && !entry.mod)!;
        const cleared = engine.apply(life, { kind: "bench", id: remove.id }, seededRandom(1)).item;
        expect(engine.apply(cleared, method, seededRandom(1)).item.mods).toHaveLength(1);
    });

    it("honors class and affix restrictions, fractures, influence and protected item state", () => {
        const item = fillSide({ ...blank(), influences: [0] }, "suffix");
        expect(engine.apply(item, method, seededRandom(1)).item.influences).toEqual([0]);
        const fractured = {
            ...item,
            influences: [],
            mods: item.mods.map((entry, index) => ({ ...entry, fractured: index === 0 })),
        };
        const result = engine.apply(fractured, method, seededRandom(1)).item;
        expect(result.mods[0]).toEqual(fractured.mods[0]);
        const full = fillSide(item, "prefix");
        const incompatible = ["Jewel", "LifeFlask", "Map"].map((itemClass) => {
            const base = Object.entries(catalog.bases).find(
                ([, entry]) => entry.item_class === itemClass,
            )![0];
            return engine.createItem(base);
        });
        for (const input of [
            full,
            ...incompatible,
            { ...item, corrupted: true },
            { ...item, mirrored: true },
        ]) {
            const random = seededRandom(1);
            const pick = vi.spyOn(random, "pick");
            expect(() => engine.apply(input, method, random)).toThrow();
            expect(pick).not.toHaveBeenCalled();
        }
        const simplex = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Simplex Amulet",
        )![0];
        const singleSuffix = fillSide({ ...engine.createItem(simplex), rarity: "rare" }, "suffix");
        expect(engine.beastMetamodPool(singleSuffix, method.id).map((entry) => entry.id)).toEqual([
            suffixLock,
        ]);
    });

    it("routes by the normalized field and keeps Ruthless and PoE 2 isolated", () => {
        const changed = structuredClone(catalog);
        const beast = changed.crafting.beasts.find((entry) => entry.id === method.id)!;
        beast.id = "new-recipe-id";
        expect(new CraftingEngine(changed).beastOperation(beast.id)).toBe("metamod");
        beast.gameMode = 2;
        expect(new CraftingEngine(changed).beastOperation(beast.id)).toBeUndefined();
        changed.game = "poe2";
        expect(new CraftingEngine(changed).beastMetamodPool(blank(), beast.id)).toEqual([]);
    });

    it("preserves suffixes through Scouring and Harvest with exact and sampled complete-recipe costs", () => {
        const item = fillSide(blank(), "suffix");
        const locked = engine.apply(item, method, seededRandom(1)).item;
        const reforge = engine.apply(
            locked,
            { kind: "harvest", id: "ReforgeLife" },
            seededRandom(2),
        ).item;
        expect(reforge.mods.slice(0, 3)).toEqual(item.mods);
        expect(reforge.mods.some((entry) => entry.id === suffixLock)).toBe(false);
        const scour = currency("convert_to_normal");
        const scourCost = engine.costs(scour)[0]!.id;
        const project = craftingProjectSchema.parse({
            format: 1,
            game: catalog.game,
            patch: catalog.patch,
            item,
            method,
            target: {
                groups: item.mods.map((entry) => ({ mods: [entry.id] })),
                affixCount: { min: 3, max: 3 },
            },
            steps: [
                {
                    id: "lock",
                    method,
                    condition: { groups: [{ mods: [suffixLock] }] },
                    onSuccess: "scour",
                    onFailure: "failure",
                },
                {
                    id: "scour",
                    method: scour,
                    condition: { groups: [] },
                    onSuccess: "success",
                    onFailure: "failure",
                },
            ],
            prices: { [method.id]: 7, [scourCost]: 2 },
            seed: 42,
            iterations: 100,
            maxActions: 2,
        });
        expect(calculateProcessExact(engine, project)).toMatchObject({
            probability: 1,
            meanCost: 9,
        });
        const a = new CraftingSimulation(catalog, project, true);
        const b = new CraftingSimulation(catalog, project, true);
        for (let trial = 0; trial < 100; trial++) {
            a.runTrial();
            b.runTrial();
        }
        expect(a.result()).toEqual(b.result());
        expect(a.result()).toMatchObject({
            successes: 100,
            errors: {},
            timeouts: 0,
            meanCost: 9,
            spending: { [method.id]: 100, [scourCost]: 100 },
        });
        expect(
            a
                .result()
                .samples.every(
                    (sample) => JSON.stringify(sample.item.mods) === JSON.stringify(item.mods),
                ),
        ).toBe(true);
    });
});
