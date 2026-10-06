/** biome-ignore-all lint/style/useNamingConvention: Test fixtures retain extracted field names. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { combinedExplicitText } from "~/lib/crafting-combined-text";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { extractedGrantedPassives } from "~/lib/crafting-passives";
import { cleanModText, rolledModText, scaledModValues } from "~/lib/crafting-text";
import { craftingCatalogSchema } from "~/schemas/crafting";
import { catalog } from "./crafting-fixtures";

const catalogs = [
    catalog,
    craftingCatalogSchema.parse(
        JSON.parse(readFileSync("public/game-data/crafting-poe2.json", "utf8")),
    ),
];

describe.each(catalogs)("$game combined explicit text", (data) => {
    const engine = new CraftingEngine(data);
    const base = Object.entries(data.bases).find(
        ([, base]) => base.item_class === "Body Armour" && base.drop_level === 1,
    )![0];
    const hybrid =
        data.game === "poe1" ? "LocalBaseArmourAndLife1" : "LocalIncreasedArmourAndLife1";
    function starting() {
        const item = engine.addStartingMod(
            engine.createItem(base),
            "IncreasedLife1",
            seededRandom(1),
        );
        return engine.addStartingMod(item, hybrid, seededRandom(1));
    }

    it("preserves every translated single modifier's minimum-roll text across the extracted catalog", () => {
        const item = engine.createItem(base);
        const entries = Object.entries(data.mods).filter(
            ([id, mod]) =>
                ["prefix", "suffix"].includes(mod.generation_type) &&
                mod.domain !== "veiled" &&
                data.crafting.modDescriptions[id],
        );
        expect(entries.length).toBeGreaterThan(1000);
        for (const [id, mod] of entries) {
            const rolled = {
                id,
                values: mod.stats.map((stat) => stat.min),
                fractured: false,
                crafted: false,
            };
            item.mods = [rolled];
            const text = rolledModText(data, rolled, item);
            if (text === null) continue;
            const lines = combinedExplicitText(data, item)
                .flatMap((line) => line.text.split("\n"))
                .filter((line) => line && line !== "No displayed stats")
                .sort();
            expect(lines, id).toEqual(cleanModText(text).split("\n").filter(Boolean).sort());
        }
    });

    it("combines pure and hybrid life once while retaining the hybrid's other stat", () => {
        const item = starting();
        const before = structuredClone(item);
        const life = item.mods[0]!.values[0]! + item.mods[1]!.values[1]!;
        const lines = combinedExplicitText(data, item);
        expect(lines.map((line) => line.text)).toContain(`+${life} to maximum Life`);
        expect(lines).toHaveLength(2);
        expect(lines.find((line) => line.text.includes("Armour"))!.text).toBe(
            data.game === "poe1"
                ? `+${item.mods[1]!.values[0]} to Armour`
                : `${item.mods[1]!.values[0]}% increased Armour`,
        );
        expect(new Set(lines.map((line) => line.key)).size).toBe(lines.length);
        expect(item).toEqual(before);
        expect(engine.validateItem(item)).toEqual(item);
    });

    it("keeps fractured contributions separate from matching ordinary stats", () => {
        const item = starting();
        item.mods[0]!.fractured = true;
        const lines = combinedExplicitText(data, item);
        expect(lines).toHaveLength(3);
        expect(lines.filter((line) => line.fractured).map((line) => line.text)).toEqual([
            `+${item.mods[0]!.values[0]} to maximum Life`,
        ]);
        expect(lines.filter((line) => !line.fractured).map((line) => line.text)).toContain(
            `+${item.mods[1]!.values[1]} to maximum Life`,
        );
    });

    it("scales and rounds each modifier before summing without including implicit contributions", () => {
        const item = starting();
        item.mods[0]!.sanctification = 125;
        item.mods[1]!.corruptionScale = 150;
        item.implicits = [engine.rollMod("IncreasedLife1", seededRandom(3))];
        const values = item.mods.map((mod) => scaledModValues(data, mod, item));
        expect(combinedExplicitText(data, item).map((line) => line.text)).toContain(
            `+${values[0]![0]! + values[1]![1]!} to maximum Life`,
        );
    });

    it("does not merge revealed, veiled or untranslatable modifiers into ordinary stats", () => {
        const changed = structuredClone(data);
        const item = starting();
        if (data.game === "poe2") item.mods[1]!.desecrated = true;
        else changed.mods[hybrid]!.domain = "unveiled";
        const lines = combinedExplicitText(changed, item);
        expect(lines.map((line) => line.text)).toContain(
            cleanModText(rolledModText(changed, item.mods[1]!, item)!),
        );
        expect(lines.map((line) => line.text)).toContain(
            `+${item.mods[0]!.values[0]} to maximum Life`,
        );
        changed.mods[hybrid]!.domain = "veiled";
        expect(combinedExplicitText(changed, item).at(-1)!.text).toBe("Unrevealed prefix");
        changed.mods[hybrid]!.domain = "item";
        delete item.mods[1]!.desecrated;
        delete changed.crafting.modDescriptions[hybrid];
        expect(combinedExplicitText(changed, item).at(-1)!.text).toBe(
            cleanModText(changed.mods[hybrid]!.text!),
        );
    });

    it("renders signed totals with the extracted conditional wording and omits cancelled stats", () => {
        const changed = structuredClone(data);
        const item = starting();
        const reference = changed.crafting.modDescriptions.IncreasedLife1![0]!;
        changed.crafting.statDescriptions[reference]!.rules = [
            { conditions: ["1|#"], text: "+{0} life", handlers: [] },
            { conditions: ["#|-1"], text: "{0} lost life", handlers: ["negate", "1"] },
        ];
        item.mods[0]!.values[0] = 10;
        item.mods[1]!.values[1] = -30;
        expect(combinedExplicitText(changed, item).map((line) => line.text)).toContain(
            "20 lost life",
        );
        item.mods[1]!.values[1] = -10;
        expect(combinedExplicitText(changed, item).some((line) => line.text.includes("life"))).toBe(
            false,
        );
    });

    it("retains individual lines when an aggregate has no valid translation condition", () => {
        const changed = structuredClone(data);
        const item = starting();
        const reference = changed.crafting.modDescriptions.IncreasedLife1![0]!;
        changed.crafting.statDescriptions[reference]!.rules = [
            { conditions: ["1|100"], text: "+{0} life", handlers: [] },
        ];
        item.mods[0]!.values[0] = 60;
        item.mods[1]!.values[1] = 60;
        expect(
            combinedExplicitText(changed, item).filter((line) => line.text === "+60 life"),
        ).toHaveLength(2);
    });

    it("keeps lookup and offset-converted values separate instead of adding identifiers", () => {
        const changed = structuredClone(data);
        const item = starting();
        const reference = changed.crafting.modDescriptions.IncreasedLife1![0]!;
        changed.crafting.statDescriptions[reference]!.rules = [
            { conditions: ["#"], text: "Effect {0}", handlers: ["test_lookup", "1"] },
        ];
        changed.crafting.statLookups.test_lookup = { "1": "First", "2": "Second" };
        item.mods[0]!.values[0] = 1;
        item.mods[1]!.values[1] = 2;
        expect(
            combinedExplicitText(changed, item)
                .map((line) => line.text)
                .join("\n"),
        ).toContain("Effect First");
        expect(
            combinedExplicitText(changed, item)
                .map((line) => line.text)
                .join("\n"),
        ).toContain("Effect Second");
        changed.crafting.statDescriptions[reference]!.rules[0]!.handlers = ["add_one", "1"];
        const text = combinedExplicitText(changed, item)
            .map((line) => line.text)
            .join("\n");
        expect(text).toContain("Effect 2");
        expect(text).toContain("Effect 3");
        expect(text).not.toContain("Effect 4");
    });
});

it("preserves the allocated passive's identity instead of summing its hash", () => {
    const data = catalogs[1]!;
    const engine = new CraftingEngine(data);
    const base = Object.entries(data.bases).find(([, base]) => base.item_class === "Amulet")![0];
    const item = engine.createItem(base);
    const passive = Object.keys(extractedGrantedPassives(data))[0]!;
    item.mods = [
        { ...engine.rollMod("EssenceGrantedPassive", seededRandom(1)), grantedPassive: passive },
    ];
    expect(combinedExplicitText(data, item).map((line) => line.text)).toEqual([
        cleanModText(rolledModText(data, item.mods[0]!, item)!),
    ]);
});
