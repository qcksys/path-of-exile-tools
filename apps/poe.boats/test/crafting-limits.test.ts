import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { type CraftingItem, craftingCatalogSchema } from "../app/schemas/crafting";
import { catalog, currency, engine } from "./crafting-fixtures";

describe("implicit affix limits", () => {
    it.each([
        ["Simplex Amulet", 1, 2],
        ["Focused Amulet", 2, 1],
        ["Cogwork Ring", 2, 4],
    ] as const)("uses the extracted %s limits for rolls and validation", (name, prefixes, suffixes) => {
        const base = Object.entries(catalog.bases).find(([, entry]) => entry.name === name)![0];
        const item = { ...engine.createItem(base), rarity: "rare" as const };
        expect(engine.limits(item)).toMatchObject({ prefixes, suffixes, max: prefixes + suffixes });
        expect(() => engine.validateItem({ ...item, implicits: [] })).toThrow("implicit");
        for (let seed = 0; seed < 15; seed++) {
            const result = engine.apply(item, currency("reroll"), seededRandom(seed)).item;
            expect(engine.counts(result).prefixes).toBeLessThanOrEqual(prefixes);
            expect(engine.counts(result).suffixes).toBeLessThanOrEqual(suffixes);
            expect(result.mods.length).toBeLessThanOrEqual(prefixes + suffixes);
        }
    });

    it("keeps a protected Simplex suffix rare after scouring", () => {
        const base = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Simplex Amulet",
        )![0];
        const item = { ...engine.createItem(base), rarity: "rare" as const };
        const suffix = engine.pool(item, { side: "suffix" })[0]!;
        const withSuffix = engine.addStartingMod(item, suffix.id, seededRandom(1));
        expect(() => engine.validateItem({ ...withSuffix, rarity: "magic" })).toThrow(
            "affix limits",
        );
        const recipe = catalog.crafting.bench.find(
            (entry) =>
                entry.mod &&
                engine
                    .mod(entry.mod)
                    .stats.some((stat) => stat.id === "item_generation_cannot_change_suffixes"),
        )!;
        const locked = engine.apply(
            withSuffix,
            { kind: "bench", id: recipe.id },
            seededRandom(1),
        ).item;
        const result = engine.apply(locked, currency("convert_to_normal"), seededRandom(1)).item;
        expect(result.rarity).toBe("rare");
        expect(result.mods).toEqual(withSuffix.mods);
    });

    it("allows two magic Cogwork suffixes but no third modifier", () => {
        const base = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Cogwork Ring",
        )![0];
        const item = { ...engine.createItem(base), rarity: "magic" as const };
        const first = engine.apply(item, currency("add_mod_to_magic"), seededRandom(2)).item;
        const second = engine.apply(first, currency("add_mod_to_magic"), seededRandom(3)).item;
        expect(engine.counts(second)).toEqual({ prefixes: 0, suffixes: 2 });
        expect(engine.pool(second)).toEqual([]);
        expect(() => engine.apply(second, currency("add_mod_to_magic"), seededRandom(4))).toThrow(
            "No eligible",
        );
    });

    it("uses PoE 2 base implicit adjustments without a separate base-name list", () => {
        const data = craftingCatalogSchema.parse(
            JSON.parse(
                readFileSync(
                    new URL("../public/game-data/crafting-poe2.json", import.meta.url),
                    "utf8",
                ),
            ),
        );
        const engine = new CraftingEngine(data);
        const base = Object.entries(data.bases).find(([, entry]) =>
            entry.implicits.some((id) =>
                data.mods[id]!.stats.some(
                    (stat) => stat.id === "local_maximum_prefixes_allowed_+" && stat.min === 2,
                ),
            ),
        )![0];
        const item = { ...engine.createItem(base), rarity: "rare" as const };
        expect(engine.limits(item)).toMatchObject({ prefixes: 5, suffixes: 1, max: 6 });
        const exalt = {
            kind: "currency" as const,
            id: data.crafting.currencies.find((entry) => entry.action === "add_mod_to_rare")!.id,
        };
        let filled: CraftingItem = item;
        for (let count = 0; count < 6; count++)
            filled = engine.apply(filled, exalt, seededRandom(count)).item;
        expect(engine.counts(filled)).toEqual({ prefixes: 5, suffixes: 1 });
        expect(engine.pool(filled)).toEqual([]);
        expect(engine.matches(item, engine.validateTarget({ groups: [], openPrefixes: 5 }))).toBe(
            true,
        );
    });
});
