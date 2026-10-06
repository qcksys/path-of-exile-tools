import { describe, expect, it, vi } from "vite-plus/test";
import { seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import {
    type CraftingItem,
    type CraftingMethod,
    craftingItemSchema,
} from "../app/schemas/crafting";
import { baseId, catalog, currency, engine } from "./crafting-fixtures";

const beast = (id: string, level: number): CraftingMethod => ({ kind: "beast", id, level });
const swap = beast("EinharMasterCraft31", 86);
function singleSuffix(level: number): CraftingItem {
    const item = { ...engine.createItem(baseId, level), rarity: "rare" as const };
    return engine.addStartingMod(
        item,
        engine.pool(item, { side: "suffix" })[0]!.id,
        seededRandom(1),
    );
}

describe("level-aware beastcrafting", () => {
    it("adds at beast level, removes the opposite affix and preserves item level", () => {
        const item = singleSuffix(5);
        const before = structuredClone(item);
        const results = Array.from({ length: 12 }, (_, seed) =>
            engine.apply(item, swap, seededRandom(seed)),
        );
        expect(item).toEqual(before);
        expect(
            results.some(
                (result) => engine.mod(result.item.mods[0]!.id).required_level > item.level,
            ),
        ).toBe(true);
        for (const result of results) {
            expect(result.item.level).toBe(5);
            expect(engine.counts(result.item)).toEqual({ prefixes: 1, suffixes: 0 });
            expect(result.item.mods[0]!.origin).toEqual({
                kind: "beast",
                level: 86,
                recipe: "EinharMasterCraft31",
            });
            expect(result.cost).toEqual([
                {
                    id: "EinharMasterCraft31",
                    name: "Beastcraft · Modify Mods on an Item: Add a Prefix, Remove a Random Suffix",
                    amount: 1,
                },
            ]);
            expect(engine.validateItem(JSON.parse(JSON.stringify(result.item)))).toEqual(
                result.item,
            );
            expect(
                importCraftingItemText(engine, exportCraftingItemText(engine, result.item)).some(
                    (entry) => JSON.stringify(entry.item) === JSON.stringify(result.item),
                ),
            ).toBe(true);
        }
    });

    it("uses a lower beast level even on a high-level item", () => {
        const item = singleSuffix(86);
        for (let seed = 0; seed < 12; seed++) {
            const result = engine.apply(
                item,
                beast("EinharMasterCraft31", 5),
                seededRandom(seed),
            ).item;
            expect(engine.mod(result.mods[0]!.id).required_level).toBeLessThanOrEqual(5);
        }
        const first = engine.apply(singleSuffix(5), swap, seededRandom(1)).item;
        const reversed = engine.apply(first, beast("EinharMasterCraft30", 5), seededRandom(2)).item;
        expect(engine.counts(reversed)).toEqual({ prefixes: 0, suffixes: 1 });
        expect(engine.mod(reversed.mods[0]!.id).required_level).toBeLessThanOrEqual(5);
    });

    it("honors attack blocking before removing the crafted modifier", () => {
        const bow = Object.entries(catalog.bases).find(
            ([, entry]) => entry.item_class === "Bow" && entry.drop_level === 1,
        )![0];
        const item = { ...engine.createItem(bow, 1), rarity: "rare" as const };
        const recipe = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_roll_attack_affixes"),
        )!;
        const blocked = engine.apply(item, { kind: "bench", id: recipe.id }, seededRandom(1)).item;
        const result = engine.apply(blocked, swap, seededRandom(1)).item;
        expect(result.mods).toHaveLength(1);
        expect(engine.mod(result.mods[0]!.id).implicit_tags).not.toContain("attack");
        expect(result.mods[0]!.id).not.toBe(recipe.mod);
    });

    it("rejects protected removal sides and full addition sides without modifying the input", () => {
        const item = singleSuffix(86);
        const fractured = {
            ...item,
            mods: item.mods.map((entry) => ({ ...entry, fractured: true })),
        };
        const random = seededRandom(1);
        const pick = vi.spyOn(random, "pick");
        expect(() => engine.apply(fractured, swap, random)).toThrow("No unprotected suffix");
        expect(pick).not.toHaveBeenCalled();
        const lock = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_change_suffixes"),
        )!;
        const locked = engine.apply(item, { kind: "bench", id: lock.id }, seededRandom(1)).item;
        expect(() => engine.apply(locked, swap, seededRandom(2))).toThrow("No unprotected suffix");
        let full = item;
        for (let count = 0; count < 3; count++)
            full = engine.addStartingMod(
                full,
                engine.pool(full, { side: "prefix" })[0]!.id,
                seededRandom(count),
            );
        const before = structuredClone(full);
        expect(() => engine.apply(full, swap, seededRandom(2))).toThrow("No eligible");
        expect(full).toEqual(before);
    });

    it("adds a build-defined flask suffix and rejects incompatible flask types or levels", () => {
        const base = Object.entries(catalog.bases).find(
            ([, entry]) => entry.item_class === "LifeFlask" && entry.drop_level === 1,
        )![0];
        const item = engine.createItem(base, 1);
        const method = beast("EinharMasterCraftFlask6", 20);
        const result = engine.apply(item, method, seededRandom(1)).item;
        const recipe = catalog.crafting.beasts.find(
            (entry) => entry.id === "EinharMasterCraftFlask6",
        )!;
        expect(result.rarity).toBe("magic");
        expect(result.level).toBe(1);
        expect(result.mods[0]!.id).toBe(recipe.mod);
        expect(result.mods[0]!.crafted).toBe(false);
        expect(() => engine.apply(result, method, seededRandom(2))).toThrow("open suffix");
        expect(() =>
            engine.apply(item, beast("EinharMasterCraftFlask6", 19), seededRandom(1)),
        ).toThrow("at least 20");
        expect(() =>
            engine.apply(item, beast("EinharMasterCraftFlask7", 20), seededRandom(1)),
        ).toThrow("type");
        expect(() => engine.apply(engine.createItem(baseId), method, seededRandom(1))).toThrow(
            "requires a flask",
        );
    });

    it("validates level provenance and preserves it through Divine rolls", () => {
        const item = engine.apply(singleSuffix(5), swap, seededRandom(3)).item;
        const result = engine.apply(item, currency("reroll_mod_values"), seededRandom(4)).item;
        expect(result.mods[0]!.origin).toEqual(item.mods[0]!.origin);
        expect(craftingItemSchema.parse(result)).toEqual(result);
        const mod = result.mods[0]!;
        expect(() =>
            engine.validateItem({
                ...result,
                mods: [
                    { ...mod, origin: { kind: "beast", level: 86, recipe: "EinharMasterCraft30" } },
                ],
            }),
        ).toThrow("invalid beastcraft origin");
        expect(() =>
            engine.validateItem({
                ...result,
                mods: [{ ...mod, origin: { kind: "awakener", level: 86 } }],
            }),
        ).toThrow("Awakener origin");
        expect(() => engine.validateMethod({ kind: "beast", id: "EinharMasterCraft31" })).toThrow(
            "Choose a beast level",
        );
        const rerolled = engine.apply(item, currency("reroll"), seededRandom(5)).item;
        expect(
            rerolled.mods.every(
                (entry) => !entry.origin && engine.mod(entry.id).required_level <= 5,
            ),
        ).toBe(true);
    });
});
