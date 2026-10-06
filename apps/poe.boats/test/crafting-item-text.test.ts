import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine, seededRandom } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { rolledModText } from "../app/lib/crafting-text";
import { matchRolledMod } from "../app/lib/crafting-text-match";
import { craftingCatalogSchema } from "../app/schemas/crafting";

describe.each(["poe1", "poe2"] as const)("%s item text", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const baseId = Object.entries(catalog.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
    )![0];
    const alchemy = catalog.crafting.currencies.find(
        (entry) => entry.action === "transmute_to_rare",
    )!;

    it("round trips extracted ordinary rolls through Path of Building item text", () => {
        const original = engine.apply(
            engine.createItem(baseId),
            { kind: "currency", id: alchemy.id },
            seededRandom(3),
        ).item;
        const text = exportCraftingItemText(engine, original);
        const matches = importCraftingItemText(engine, text);
        expect(matches.length).toBeGreaterThan(0);
        expect(
            matches.some(
                ({ item }) =>
                    item.baseId === baseId &&
                    item.mods.every((mod, index) => mod.id === original.mods[index]!.id),
            ),
        ).toBe(true);
        for (const { item } of matches) expect(exportCraftingItemText(engine, item)).toBe(text);
        expect(original.mods.length).toBeGreaterThan(3);
    });

    it("recovers fixed and scaled numeric translations from the extracted rules", () => {
        const item = { ...engine.createItem(baseId), rarity: "rare" as const };
        const pool = engine.pool(item);
        for (const { id, mod } of pool) {
            for (const values of [
                mod.stats.map((stat) => stat.min),
                mod.stats.map((stat) => stat.max),
            ]) {
                const rolled = { id, values, crafted: false, fractured: false };
                const text = rolledModText(catalog, rolled, { ...item, mods: [rolled] });
                if (!text) continue;
                const result = matchRolledMod(catalog, id, text, item);
                expect(result, `${id}: ${text}`).toBeDefined();
                expect(rolledModText(catalog, result!.mod, { ...item, mods: [result!.mod] })).toBe(
                    text,
                );
            }
        }
    });

    it("matches build-wide rendered modifier values, including relational lookups", () => {
        const item = engine.createItem(baseId);
        for (const [id, mod] of Object.entries(catalog.mods)) {
            for (const fraction of [0, 0.5, 1]) {
                const rolled = {
                    id,
                    values: mod.stats.map((stat) =>
                        Math.floor(stat.min + fraction * (stat.max - stat.min)),
                    ),
                    crafted: mod.domain === "crafted",
                    fractured: false,
                };
                const text = rolledModText(catalog, rolled);
                if (!text?.trim()) continue;
                expect(
                    matchRolledMod(catalog, id, text, item, true),
                    `${id}: ${text}`,
                ).toBeDefined();
            }
        }
    });

    it("preserves implicits, crafted flags, quality and magic base names", () => {
        const ring = Object.entries(catalog.bases).find(
            ([, base]) => base.name === "Ruby Ring",
        )![0];
        let item = { ...engine.createItem(ring), rarity: "magic" as const, quality: 20 };
        if (game === "poe1") {
            const recipe = catalog.crafting.bench.find(
                (entry) =>
                    entry.itemClasses.includes("Ring") &&
                    entry.mod &&
                    engine.mod(entry.mod).stats.some((stat) => stat.id === "base_maximum_life"),
            )!;
            item = {
                ...item,
                mods: [{ ...engine.rollMod(recipe.mod!, seededRandom(1)), crafted: true }],
            };
        } else {
            const mod = engine
                .pool(item)
                .find(
                    (entry) =>
                        catalog.crafting.craftableModTypes.includes(entry.mod.type) &&
                        entry.mod.stats.some((stat) => stat.id === "base_maximum_life"),
                )!;
            item = {
                ...item,
                mods: [{ ...engine.rollMod(mod.id, seededRandom(1)), crafted: true }],
            };
        }
        const exported = exportCraftingItemText(engine, item);
        const imported = importCraftingItemText(
            engine,
            exported.replace("Ruby Ring", "Superior Test Ruby Ring of Testing"),
        );
        expect(
            imported.some(
                (match) => JSON.stringify(match.item) === JSON.stringify(engine.validateItem(item)),
            ),
        ).toBe(true);
        expect(() =>
            importCraftingItemText(
                engine,
                exported.replace(/Implicits: 1\n[^\n]+/, "Implicits: 0"),
            ),
        ).toThrow();
    });

    it("reports raw values lost to display rounding", () => {
        const item = { ...engine.createItem(baseId), rarity: "rare" as const };
        const mod = engine
            .pool(item)
            .find(
                (entry) =>
                    entry.mod.stats.length === 1 &&
                    entry.mod.stats[0]!.id === "base_life_regeneration_rate_per_minute" &&
                    entry.mod.stats[0]!.max - entry.mod.stats[0]!.min > 10,
            )!;
        const rolled = {
            id: mod.id,
            values: [mod.mod.stats[0]!.min + 5],
            crafted: false,
            fractured: false,
        };
        const text = exportCraftingItemText(engine, { ...item, mods: [rolled] });
        const result = importCraftingItemText(engine, text);
        expect(
            result.some((entry) => entry.warnings.some((warning) => warning.includes("raw roll"))),
        ).toBe(true);
        for (const { item } of result) expect(exportCraftingItemText(engine, item)).toBe(text);
    });

    it("retains revealed modifier domains without a pending reveal", () => {
        const rare = engine.apply(
            engine.createItem(baseId),
            { kind: "currency", id: alchemy.id },
            seededRandom(3),
        ).item;
        const currency = catalog.crafting.currencies.find(
            (entry) =>
                entry.action ===
                (game === "poe1" ? "replace_rare_mod_veiled" : "abyssal_bench_ticket_armour"),
        )!;
        const hidden = engine.apply(
            rare,
            { kind: "currency", id: currency.id },
            seededRandom(11),
        ).item;
        expect(() => exportCraftingItemText(engine, hidden)).toThrow("unrevealed");
        const revealed = engine.apply(
            hidden,
            { kind: "reveal", preferred: [] },
            seededRandom(15),
        ).item;
        const text = exportCraftingItemText(engine, revealed);
        expect(text).toContain(`{${engine.revealDomain()}}`);
        const imported = importCraftingItemText(engine, text);
        expect(
            imported.some(({ item }) =>
                item.mods.some((entry) =>
                    game === "poe2"
                        ? engine.isDesecrated(entry)
                        : engine.mod(entry.id).domain === engine.revealDomain(),
                ),
            ),
        ).toBe(true);
        for (const { item } of imported) expect(exportCraftingItemText(engine, item)).toBe(text);
    });

    if (game === "poe1") {
        it("retains influence and immutable item flags", () => {
            const item = { ...engine.createItem(baseId), rarity: "rare" as const, influences: [0] };
            const mod = engine
                .pool(item)
                .find((entry) => catalog.crafting.modRules[entry.id]?.influence === 0)!;
            const expected = engine.validateItem({
                ...item,
                mods: [engine.rollMod(mod.id, seededRandom(1))],
                quality: 20,
                corrupted: true,
                mirrored: true,
            });
            const matches = importCraftingItemText(
                engine,
                exportCraftingItemText(engine, expected),
            );
            expect(
                matches.some(({ item }) => JSON.stringify(item) === JSON.stringify(expected)),
            ).toBe(true);
        });
        it("recovers raw rolls behind implicit modifier magnitudes", () => {
            const base = Object.entries(catalog.bases).find(
                ([, base]) => base.name === "Simplex Amulet",
            )![0];
            const item = { ...engine.createItem(base), rarity: "rare" as const };
            const mod = engine
                .pool(item)
                .find(
                    (entry) =>
                        entry.mod.stats.length === 1 &&
                        entry.mod.stats[0]!.id === "base_maximum_life" &&
                        entry.mod.stats[0]!.min <= 20 &&
                        entry.mod.stats[0]!.max >= 20,
                )!;
            const expected = {
                ...item,
                mods: [{ id: mod.id, values: [20], crafted: false, fractured: false }],
            };
            const text = exportCraftingItemText(engine, expected);
            expect(text).toContain("+40 to maximum Life");
            expect(
                importCraftingItemText(engine, text).some(
                    ({ item }) => item.mods[0]?.id === mod.id && item.mods[0].values[0] === 20,
                ),
            ).toBe(true);
            const advanced = text.replace(
                `{modGroup:${mod.id}}+40 to maximum Life`,
                `{ Prefix Modifier "${mod.mod.name}" }\n+20(${mod.mod.stats[0]!.min}-${mod.mod.stats[0]!.max}) to maximum Life`,
            );
            expect(
                importCraftingItemText(engine, advanced).some(
                    ({ item }) => item.mods[0]?.id === mod.id && item.mods[0].values[0] === 20,
                ),
            ).toBe(true);
        });
        it("keeps a hybrid and separate prefix matches available for review", () => {
            const text = `Rarity: RARE\nTest\n${engine.base(engine.createItem(baseId)).name}\nItem Level: 86\nImplicits: 0\n+100 to Armour\n+35 to maximum Life`;
            const matches = importCraftingItemText(engine, text);
            expect(new Set(matches.map(({ item }) => item.mods.length))).toEqual(new Set([1, 2]));
        });
    }

    it("imports advanced game copy with modifier names, ranges and fractured flags", () => {
        const item = { ...engine.createItem(baseId), rarity: "rare" as const };
        const entry = engine
            .pool(item)
            .find(
                (entry) =>
                    entry.mod.stats.length === 1 && entry.mod.stats[0]!.id === "base_maximum_life",
            )!;
        const value = entry.mod.stats[0]!.min;
        const text = [
            "Item Class: Body Armours",
            "Rarity: Rare",
            "Test Armour",
            engine.base(item).name,
            "--------",
            "Armour: 100 (augmented)",
            "--------",
            "Requirements:",
            "Level: 1",
            "--------",
            "Item Level: 86",
            "--------",
            `{ Fractured Prefix Modifier "${entry.mod.name}" (Tier: 1) — Life }`,
            `+${value}(${entry.mod.stats[0]!.min}-${entry.mod.stats[0]!.max}) to maximum Life`,
            "--------",
            "Fractured Item",
        ].join("\n");
        const result = importCraftingItemText(engine, text);
        expect(
            result.some(({ item }) => item.mods[0]?.id === entry.id && item.mods[0].fractured),
        ).toBe(true);
    });

    it("rejects incomplete, unknown and over-capacity item text without losing modifiers", () => {
        expect(() => importCraftingItemText(engine, "Rarity: Unique\nUnknown")).toThrow(
            "normal, magic or rare",
        );
        const text = `Rarity: RARE\nTest\n${engine.base(engine.createItem(baseId)).name}\nItem Level: 86\nImplicits: 0\n+999999 to maximum Life`;
        expect(() => importCraftingItemText(engine, text)).toThrow("Could not resolve");
        expect(() => importCraftingItemText(engine, text.replace("Item Level: 86\n", ""))).toThrow(
            "Item Level",
        );
        expect(() =>
            importCraftingItemText(engine, `${text.replace("Test\n", "")}\nUnidentified`),
        ).toThrow("Unidentified templates cannot include explicit modifiers");
        expect(() => importCraftingItemText(engine, `${text}\nQuality: 20.5`)).toThrow(
            "whole number",
        );
        expect(() => importCraftingItemText(engine, "x".repeat(50_001))).toThrow("50,000");
        const item = { ...engine.createItem(baseId), rarity: "rare" as const };
        const groups = new Set<string>();
        const seven = engine
            .pool(item)
            .filter(({ mod }) => {
                if (mod.groups.some((group) => groups.has(group))) return false;
                for (const group of mod.groups) groups.add(group);
                return true;
            })
            .slice(0, 7);
        expect(seven).toHaveLength(7);
        const invalid = seven
            .map(
                ({ id }) =>
                    `{modGroup:${id}}${rolledModText(catalog, engine.rollMod(id, seededRandom(1)))}`,
            )
            .join("\n");
        expect(() =>
            importCraftingItemText(engine, text.replace("+999999 to maximum Life", invalid)),
        ).toThrow();
    });
});
