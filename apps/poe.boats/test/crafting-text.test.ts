import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { rolledModText } from "../app/lib/crafting-text";
import { craftingCatalogSchema } from "../app/schemas/crafting";

describe.each(["poe1", "poe2"])("%s extracted stat formatting", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(resolve(`public/game-data/crafting-${game}.json`), "utf8")),
    );
    const roll = (id: string, values: number[]) => ({
        id,
        values,
        fractured: false,
        crafted: false,
    });
    if (game === "poe1") {
        it("applies extracted implicit magnitude effects to scalable stats without changing raw rolls", () => {
            const engine = new CraftingEngine(catalog);
            for (const [name, expectedLife, expectedResistance] of [
                ["Simplex Amulet", 40, 40],
                ["Cogwork Ring", 20, 25],
            ] as const) {
                const base = Object.entries(catalog.bases).find(
                    ([, entry]) => entry.name === name,
                )![0];
                const item = { ...engine.createItem(base), rarity: "rare" as const };
                for (const [stat, expected] of [
                    ["base_maximum_life", expectedLife],
                    ["base_fire_damage_resistance_%", expectedResistance],
                ] as const) {
                    const mod = engine
                        .pool(item)
                        .find(
                            (entry) =>
                                entry.mod.stats.length === 1 &&
                                entry.mod.stats[0]!.id === stat &&
                                entry.mod.stats[0]!.min <= 20 &&
                                entry.mod.stats[0]!.max >= 20,
                        )!;
                    const rolled = roll(mod.id, [20]);
                    const withMod = { ...item, mods: [rolled] };
                    expect(rolledModText(catalog, rolled, withMod)).toBe(
                        stat === "base_maximum_life"
                            ? `+${expected} to maximum Life`
                            : `+${expected}% to Fire Resistance`,
                    );
                    expect(rolled.values).toEqual([20]);
                }
                const implicit = item.implicits[0]!;
                expect(rolledModText(catalog, implicit, item)).toBe(
                    rolledModText(catalog, implicit),
                );
            }
            const base = Object.entries(catalog.bases).find(
                ([, entry]) => entry.name === "Cogwork Ring",
            )![0];
            const item = { ...engine.createItem(base), rarity: "rare" as const };
            const recipe = catalog.crafting.bench.find(
                (entry) =>
                    entry.mod &&
                    engine
                        .mod(entry.mod)
                        .stats.some((stat) => stat.id === "item_generation_cannot_change_prefixes"),
            )!;
            const crafted = engine.apply(
                item,
                { kind: "bench", id: recipe.id },
                seededRandom(1),
            ).item;
            expect(rolledModText(catalog, crafted.mods[0]!, crafted)).toBe(
                "Prefixes Cannot Be Changed",
            );
        });
    }
    it("renders actual rolls using client scaling and formatting", () => {
        const entry = Object.entries(catalog.mods).find(
            ([id, mod]) =>
                catalog.crafting.modDescriptions[id] &&
                mod.stats.length === 1 &&
                mod.stats[0]!.id === "base_life_regeneration_rate_per_minute" &&
                mod.stats[0]!.min <= 90 &&
                mod.stats[0]!.max >= 90,
        )!;
        expect(entry).toBeDefined();
        expect(rolledModText(catalog, roll(entry[0], [90]))).toBe(
            game === "poe1" ? "Regenerate 1.5 Life per second" : "1.5 Life Regeneration per second",
        );
    });
    it("matches the canonical extracted display for fixed-value modifiers", () => {
        const entries = Object.entries(catalog.mods).filter(
            ([id, mod]) =>
                catalog.crafting.modDescriptions[id] &&
                mod.stats.length &&
                mod.text &&
                mod.stats.every((stat) => stat.min === stat.max),
        );
        expect(entries.length).toBeGreaterThan(20);
        for (const [id, mod] of entries.slice(0, 100))
            expect(
                rolledModText(
                    catalog,
                    roll(
                        id,
                        mod.stats.map((stat) => stat.min),
                    ),
                ),
            ).toBe(mod.text);
    });
    it("does not invent text when a rule or relational lookup is unavailable", () => {
        expect(rolledModText(catalog, roll("missing", []))).toBeNull();
    });
});
