import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { CraftingEngine } from "../app/lib/crafting-engine";
import { exportCraftingItemText, importCraftingItemText } from "../app/lib/crafting-item-text";
import { availableCatalysts } from "../app/lib/crafting-quality";
import { cleanModText, rolledModText } from "../app/lib/crafting-text";
import { matchRolledMod } from "../app/lib/crafting-text-match";
import { craftingCatalogSchema } from "../app/schemas/crafting";

describe.each(["poe1", "poe2"] as const)("%s Path of Building ranged text", (game) => {
    const catalog = craftingCatalogSchema.parse(
        JSON.parse(readFileSync(`public/game-data/crafting-${game}.json`, "utf8")),
    );
    const engine = new CraftingEngine(catalog);
    const base = Object.entries(catalog.bases).find(
        ([, entry]) => entry.item_class === "Body Armour" && entry.drop_level === 1,
    )![0];
    const starting = { ...engine.createItem(base), rarity: "rare" as const };
    const text = (modifiers: string) =>
        `Rarity: Rare\nTest\n${catalog.bases[base]!.name}\nItem Level: 86\nImplicits: 0\n${modifiers}`;
    const ranged = (id: string, fraction: number) =>
        cleanModText(engine.mod(id).text!)
            .split("\n")
            .map((line) => `{range:${fraction}}{modGroup:${id}}${line}`)
            .join("\n");

    it.each([
        0, 0.5, 1,
    ])("imports life at range position %s with the build's bounds", (fraction) => {
        const result = importCraftingItemText(engine, text(ranged("IncreasedLife1", fraction)));
        expect(result).toHaveLength(1);
        const expected = (game === "poe1" ? [10, 17, 24] : [10, 15, 19])[fraction * 2];
        expect(result[0]!.item.mods[0]).toMatchObject({ id: "IncreasedLife1", values: [expected] });
        expect(result[0]!.warnings).toEqual([]);
        expect(exportCraftingItemText(engine, result[0]!.item)).toContain(
            `+${expected} to maximum Life`,
        );
    });

    it("resolves an unannotated tier and preserves a fractured ranged roll", () => {
        const result = importCraftingItemText(
            engine,
            text(ranged("IncreasedLife1", 0.5).replace("{modGroup:IncreasedLife1}", "{fractured}")),
        );
        expect(result.some(({ item }) => item.mods[0]?.id === "IncreasedLife1")).toBe(true);
        expect(result.every(({ item }) => item.mods[0]?.fractured)).toBe(true);
    });

    it("interpolates each damage endpoint independently and rounds half units upwards", () => {
        const id = game === "poe1" ? "LocalAddedFireDamageTwoHand1" : "LocalAddedFireDamage1";
        const weapon = Object.entries(catalog.bases).find(
            ([baseId, entry]) =>
                entry.item_class === (game === "poe1" ? "Two Hand Axe" : "One Hand Mace") &&
                entry.implicits.length === 0 &&
                engine
                    .pool({ ...engine.createItem(baseId), rarity: "rare" })
                    .some((entry) => entry.id === id),
        )![0];
        const input = text(ranged(id, 0.5)).replace(
            catalog.bases[base]!.name,
            catalog.bases[weapon]!.name,
        );
        const result = importCraftingItemText(engine, input);
        expect(result[0]!.item.mods[0]!.values).toEqual(game === "poe1" ? [4, 7] : [2, 4]);
    });

    it("uses separate line fractions for a grouped hybrid modifier", () => {
        const id =
            game === "poe1"
                ? "LocalIncreasedPhysicalDamageReductionRatingPercentAndStunRecovery1"
                : "LocalIncreasedArmourAndLife1";
        const lines = ranged(id, 0).split("\n");
        lines[1] = lines[1]!.replace("{range:0}", "{range:1}");
        const result = importCraftingItemText(engine, text(lines.join("\n")));
        expect(result[0]!.item.mods).toHaveLength(1);
        expect(result[0]!.item.mods[0]!.values).toEqual(game === "poe1" ? [6, 7] : [6, 10]);
    });

    it("retains selected internal precision even when displayed regeneration rounds it away", () => {
        const result = importCraftingItemText(engine, text(ranged("LifeRegeneration1", 0.123)));
        expect(result[0]!.item.mods[0]!.values).toEqual([67]);
        expect(result[0]!.warnings).toEqual([]);
        const decimal = importCraftingItemText(engine, text(ranged("LifeRegeneration2", 0.5)));
        expect(decimal[0]!.item.mods[0]!.values).toEqual(game === "poe1" ? [303] : [153]);
        expect(decimal[0]!.warnings).toEqual([]);
    });

    it("supports tiny scientific fractions without accepting out-of-build rolls", () => {
        const result = importCraftingItemText(engine, text(ranged("IncreasedLife1", 1e-7)));
        expect(result[0]!.item.mods[0]!.values).toEqual([10]);
        expect(() =>
            importCraftingItemText(
                engine,
                text("{range:0.5}{modGroup:IncreasedLife1}+(990-999) to maximum Life"),
            ),
        ).toThrow("Could not resolve");
    });

    it("applies catalyst scaling once to ranged and fixed raw lines", () => {
        const ring = Object.entries(catalog.bases).find(
            ([, entry]) => entry.name === "Golden Hoop",
        )![0];
        const item = { ...engine.createItem(ring), rarity: "rare" as const };
        const catalyst = availableCatalysts(catalog, item).find((entry) =>
            entry.description.includes("Life"),
        )!;
        const input = [
            "Rarity: Rare",
            "Test",
            "Golden Hoop",
            "Item Level: 86",
            `${catalyst.description}: +20%`,
            `Implicits: ${item.implicits.length}`,
            ...item.implicits.map((mod) => `{modGroup:${mod.id}}${rolledModText(catalog, mod)}`),
            ranged("IncreasedLife1", 0.5),
            "{modGroup:LifeRegeneration1}" +
                (game === "poe1"
                    ? "Regenerate 1.2 Life per second"
                    : "1.2 Life Regeneration per second"),
        ].join("\n");
        const result = importCraftingItemText(engine, input)[0]!;
        expect(result.item.catalyst).toEqual({ id: catalyst.id, quality: 20 });
        expect(result.item.mods[0]!.values).toEqual(game === "poe1" ? [17] : [15]);
        const rendered = exportCraftingItemText(engine, result.item);
        expect(rendered).toContain(game === "poe1" ? "+20 to maximum Life" : "+18 to maximum Life");
        expect(rendered).toContain("1.4");
    });

    it("inverts extracted negative and descending translations before symmetric rounding", () => {
        const id = game === "poe1" ? "IncreasedManaEnhancedModCost" : "ReducedBleedDuration1";
        const input = ranged(id, 0.625)
            .replace(/\{modGroup:[^}]+\}/g, "")
            .split("\n")
            .map((line) =>
                line
                    .replace("{range:0.625}", "")
                    .replace(
                        /[+-]?\([+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?\)/g,
                        (value) => `{range:0.625}${value}`,
                    ),
            )
            .join("\n");
        const result = matchRolledMod(catalog, id, input, starting, true);
        expect(result?.mod.values).toEqual(game === "poe1" ? [77, -7] : [-38]);
    });

    it.each([
        "",
        "NaN",
        "Infinity",
        "-0.1",
        "1.1",
        "0.5,0.8",
        "0x1",
    ])("rejects invalid fraction %j", (fraction) => {
        expect(() =>
            importCraftingItemText(engine, text(`{range:${fraction}}+(10-19) to maximum Life`)),
        ).toThrow("fraction between 0 and 1");
    });

    it("normalizes negative percentages to the extracted increased or reduced wording", () => {
        const id = game === "poe1" ? "FlaskInstantRecoveryOnLowLife1" : "ReducedBleedDuration1";
        const itemBase = Object.entries(catalog.bases).find(
            ([baseId, entry]) =>
                (game === "poe1"
                    ? entry.item_class === "LifeFlask"
                    : entry.item_class === "Body Armour") &&
                entry.implicits.length === 0 &&
                engine
                    .pool({ ...engine.createItem(baseId), rarity: "magic" })
                    .some((entry) => entry.id === id),
        )![0];
        const lines = cleanModText(engine.mod(id).text!)
            .split("\n")
            .map((line) => {
                const range = /\((\d+)-(\d+)\)% reduced/.exec(line);
                return `{modGroup:${id}}${range ? "{range:0.5}" : ""}${range ? line.replace(range[0], `(-${range[1]}--${range[2]})% increased`) : line}`;
            });
        const result = importCraftingItemText(
            engine,
            text(lines.join("\n"))
                .replace("Rarity: Rare\nTest\n", "Rarity: Magic\n")
                .replace(catalog.bases[base]!.name, catalog.bases[itemBase]!.name),
        );
        expect(result[0]!.item.mods[0]!.values).toEqual(
            game === "poe1"
                ? engine.mod(id).stats.map((stat) => (stat.min === stat.max ? stat.min : -29))
                : [-38],
        );
    });

    it.each([
        "Prefix",
        "Suffix",
    ])("rejects unknown %s blueprints before or after Item Level without dropping modifiers", (side) => {
        const blueprint = `${side}: {range:0.5}UnknownModifier`;
        for (const input of [
            text("").replace("Item Level: 86", `Crafted: true\n${blueprint}\nItem Level: 86`),
            text(blueprint),
        ])
            expect(() => importCraftingItemText(engine, input)).toThrow(
                "does not match an extracted modifier",
            );
    });

    it("rejects missing, duplicate, incomplete and unused range annotations", () => {
        for (const line of [
            "+(10-19) to maximum Life",
            "{range:0.5}{range:0.8}+(10-19) to maximum Life",
            "{range:0.5+(10-19) to maximum Life",
            "{range:0.5}+15 to maximum Life",
        ])
            expect(() => importCraftingItemText(engine, text(line))).toThrow(/range|fraction/);
    });
});
