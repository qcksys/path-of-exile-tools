import { describe, expect, it, vi } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { gildedImplicitId } from "../app/lib/crafting-fossils";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    CraftingSimulation,
    calculateExact,
    calculateProcessExact,
} from "../app/lib/crafting-simulation";
import { craftingProjectSchema } from "../app/schemas/crafting";
import { baseId, catalog, engine } from "./crafting-fixtures";

const vaal = {
    kind: "currency" as const,
    id: catalog.crafting.currencies.find((entry) => entry.action === "corrupt_item")!.id,
};
const base = (name: string) =>
    Object.keys(catalog.bases).find((id) => catalog.bases[id]!.name === name)!;
const blank = (name = "Plate Vest", level = 86) => engine.createItem(base(name), level);
function force(outcome: string) {
    const random = seededRandom(42);
    vi.spyOn(random, "pick").mockImplementationOnce(
        (choices) => choices.find((entry) => entry.value === outcome)!.value,
    );
    return random;
}

describe("PoE 1 equipment Vaal Orbs", () => {
    it("distinguishes extracted corruptible equipment classes from maps and jewels", () => {
        const classes = new Map<string, string>();
        let supported = 0;
        for (const [id, entry] of Object.entries(catalog.bases)) {
            const item = engine.createItem(id);
            if (engine.corruptionKind(item) !== "equipment") continue;
            expect(catalog.crafting.classes[entry.item_class]!.corrupt).toBe(true);
            expect(entry.domain).toBe("item");
            expect(entry.rarities).toContain("rare");
            supported++;
            if (!entry.corrupted) classes.set(entry.item_class, id);
        }
        expect(supported).toBeGreaterThan(1000);
        for (const id of classes.values()) {
            const item = engine.createItem(id);
            for (const branch of ["none", "white-sockets"]) {
                const result = engine.apply(item, vaal, force(branch));
                expect(result.item).toEqual({ ...item, corrupted: true });
                expect(result.cost).toEqual([{ id: vaal.id, name: "Vaal Orb", amount: 1 }]);
            }
        }
        expect(engine.corruptionKind(blank("Cobalt Jewel"))).toBe("poe1-jewel");
        const map = Object.keys(catalog.bases).find(
            (id) => catalog.bases[id]!.item_class === "Map",
        )!;
        expect(engine.corruptionKind(engine.createItem(map))).toBe("map");
    });

    it.each([
        "normal",
        "magic",
        "rare",
    ] as const)("rerolls %s equipment to six affixes with no extra count roll", (rarity) => {
        const item = { ...blank(), rarity, quality: 20, memoryStrands: 82 };
        const random = force("reroll-six");
        const result = engine.apply(item, vaal, random).item;
        expect(result).toMatchObject({
            rarity: "rare",
            corrupted: true,
            quality: 20,
            memoryStrands: 82,
        });
        expect(engine.counts(result)).toMatchObject({ prefixes: 3, suffixes: 3 });
        expect(result.mods).toHaveLength(6);
        expect(vi.mocked(random.pick).mock.calls).toHaveLength(7);
        expect(result.implicits).toEqual(item.implicits);
        expect(item.corrupted).toBe(false);
        expect(item.mods).toEqual([]);
        expect(engine.validateItem(JSON.parse(JSON.stringify(result)))).toEqual(result);
        const text = exportCraftingItemText(engine, result);
        const imported = importCraftingItemText(engine, text)[0]!.item;
        expect(exportCraftingItemText(engine, imported)).toBe(text);
        expect(imported.mods.map((entry) => entry.id)).toEqual(
            result.mods.map((entry) => entry.id),
        );
        expect(imported).toMatchObject({ corrupted: true, memoryStrands: 82, quality: 20 });
    });

    it("preserves fractures, protected prefixes, influences and their raw rolls during rerolls", () => {
        let item = engine.addStartingMod(
            { ...blank(), rarity: "rare" },
            "IncreasedLife1",
            seededRandom(1),
        );
        const suffix = engine.pool(item, { side: "suffix" })[0]!.id;
        item = engine.addStartingMod(item, suffix, seededRandom(2));
        item.mods[1]!.fractured = true;
        const lock = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                catalog.mods[entry.mod]!.stats.some(
                    (stat) => stat.id === "item_generation_cannot_change_prefixes",
                ) &&
                entry.itemClasses.includes("Body Armour"),
        )!;
        item = engine.apply(item, { kind: "bench", id: lock.id }, seededRandom(1)).item;
        const result = engine.apply(item, vaal, force("reroll-six")).item;
        expect(result.mods).toContainEqual(item.mods[0]);
        expect(result.mods).toContainEqual(item.mods[1]);
        expect(result.mods.some((entry) => entry.id === lock.mod)).toBe(false);
        expect(result.mods).toHaveLength(6);
        const influenced = { ...blank(), influences: [0, 1] };
        const pool = vi.spyOn(engine, "pool");
        const transformed = engine.apply(influenced, vaal, force("reroll-six")).item;
        expect(transformed.influences).toEqual([0, 1]);
        expect(
            pool.mock.results.some(
                (entry) =>
                    entry.type === "return" &&
                    entry.value.some((mod) => catalog.crafting.modRules[mod.id]?.influence != null),
            ),
        ).toBe(true);
        pool.mockRestore();
    });

    it("respects special-base affix limits and exhausted pools", () => {
        for (const name of ["Simplex Amulet", "Helical Ring", "Cogwork Ring", "Astrolabe Amulet"]) {
            const item = blank(name);
            const result = engine.apply(item, vaal, force("reroll-six")).item;
            expect(result.mods).toHaveLength(Math.min(6, engine.limits(result).max));
            expect(result.implicits).toEqual(item.implicits);
            expect(engine.validateItem(result)).toEqual(result);
        }
        const first = engine.pool({ ...blank(), rarity: "rare" })[0]!.id;
        const reduced = new CraftingEngine({ ...catalog, mods: { [first]: catalog.mods[first]! } });
        expect(reduced.apply(blank(), vaal, force("reroll-six")).item.mods).toHaveLength(1);
    });

    it("selects weighted implicit outcomes while preserving locked and unselected native, Gilded and Eldritch implicits", () => {
        const ring = engine.addStartingMod(blank("Coral Ring"), gildedImplicitId, seededRandom(1));
        for (const index of [0, 1]) {
            const random = force("implicit");
            vi.mocked(random.pick).mockImplementationOnce((choices) => choices[index]!.value);
            const result = engine.apply(ring, vaal, random).item;
            expect(result.implicits).toHaveLength(2);
            expect(result.implicits).toContainEqual(ring.implicits[1 - index]);
            expect(
                engine
                    .corruptedModifiers(ring)
                    .some((entry) => entry.id === result.implicits[1]!.id),
            ).toBe(true);
        }
        for (const name of ["Astrolabe Amulet", "Simplex Amulet", "Helical Ring"]) {
            const item = blank(name);
            const result = engine.apply(item, vaal, force("implicit")).item;
            expect(result.implicits).toContainEqual(item.implicits[0]);
            expect(result.implicits).toHaveLength(2);
        }
        let gloves = blank("Wool Gloves");
        for (const generation of ["searing_exarch_implicit", "eater_of_worlds_implicit"]) {
            const mod = engine
                .eldritchModifiers(gloves)
                .find((entry) => entry.mod.generation_type === generation)!;
            gloves = engine.addStartingMod(gloves, mod.id, seededRandom(1));
        }
        const corrupted = engine.apply(gloves, vaal, force("implicit")).item;
        expect(corrupted.implicits).toHaveLength(2);
        expect(
            corrupted.implicits.filter(
                (entry) => engine.mod(entry.id).generation_type === "corrupted",
            ),
        ).toHaveLength(1);
        expect(
            corrupted.implicits.filter((entry) =>
                gloves.implicits.some((old) => old.id === entry.id),
            ),
        ).toHaveLength(1);
        const reduced = new CraftingEngine({
            ...catalog,
            mods: Object.fromEntries(
                Object.entries(catalog.mods).filter(
                    ([, mod]) => mod.generation_type !== "corrupted",
                ),
            ),
        });
        expect(reduced.apply(blank("Coral Ring"), vaal, force("implicit")).item.implicits).toEqual(
            blank("Coral Ring").implicits,
        );
    });

    it("enumerates branch probabilities and preserves failed-process costs in seeded simulation", () => {
        const item = blank();
        const six = engine
            .apply(item, vaal, force("reroll-six"))
            .item.mods.map((entry) => entry.id);
        const model = new CraftingEngine({
            ...catalog,
            mods: Object.fromEntries(
                Object.entries(catalog.mods).filter(
                    ([id, mod]) => six.includes(id) || mod.generation_type === "corrupted",
                ),
            ),
        });
        const target = model.validateTarget({
            groups: [],
            rarity: "rare",
            affixCount: { min: 6, max: 6 },
            corrupted: true,
        });
        expect(calculateExact(model, item, vaal, target).probability).toBeCloseTo(0.25);
        const project = craftingProjectSchema.parse({
            format: 1,
            game: "poe1",
            patch: catalog.patch,
            item,
            method: vaal,
            target,
            steps: [{ id: "vaal", method: vaal, condition: target }],
            prices: { [vaal.id]: 3 },
            seed: 42,
            iterations: 2000,
            maxActions: 1,
        });
        expect(calculateProcessExact(model, project)).toMatchObject({
            probability: expect.closeTo(0.25),
            meanCost: expect.closeTo(3),
            errors: {},
        });
        const simulation = new CraftingSimulation(model.catalog, project, true);
        for (let index = 0; index < project.iterations; index++) simulation.runTrial();
        expect(simulation.result()).toMatchObject({
            meanCost: 3,
            errors: {},
            timeouts: 0,
            spending: { [vaal.id]: 2000 },
        });
        expect(simulation.result().probability).toBeCloseTo(0.25, 1);
        const implicit = model.corruptedModifiers(item)[0]!;
        const total = model.corruptedModifiers(item).reduce((sum, entry) => sum + entry.weight, 0);
        expect(
            calculateExact(
                model,
                item,
                vaal,
                model.validateTarget({ groups: [{ mods: [implicit.id] }] }),
            ).probability,
        ).toBeCloseTo(implicit.weight / total / 4);
    });

    it("rejects ineligible, corrupted and mirrored inputs before randomness", () => {
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        for (const item of [
            { ...blank(), corrupted: true },
            { ...blank(), mirrored: true },
        ])
            expect(() => engine.apply(item, vaal, random)).toThrow();
        expect(pick).not.toHaveBeenCalled();
        const modified = structuredClone(catalog);
        modified.crafting.classes[modified.bases[baseId]!.item_class]!.corrupt = false;
        expect(new CraftingEngine(modified).corruptionKind(blank())).toBeUndefined();
    });
});
