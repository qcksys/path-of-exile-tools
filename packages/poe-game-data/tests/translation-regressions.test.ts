import { expect, it } from "vite-plus/test";
import { Tables } from "../src/tables.ts";
import { numericHandler, Translations } from "../src/translations.ts";

function translator(text: string, game: "poe1" | "poe2" = "poe1") {
    const paths: string[] = [];
    const source = {
        get: async (path: string) => {
            paths.push(path);
            return game === "poe2"
                ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")])
                : Buffer.from(text);
        },
    };
    return {
        paths,
        translations: new Translations(
            source,
            new Tables(game, source, { version: 8, tables: [] }),
        ),
    };
}

it.each(["poe1", "poe2"] as const)("renders all eight stats from %s descriptions", async (game) => {
    const stats = Array.from({ length: 8 }, (_, index) => ({
        id: `stat${index}`,
        min: index + 1,
        max: index + 1,
    }));
    const { paths, translations } = translator(
        stats.map((stat) => `description\n1 ${stat.id}\n1\n# "Value {0}"`).join("\n"),
        game,
    );
    expect(await translations.translate("item", stats, "eight")).toBe(
        stats.map((stat) => `Value ${stat.min}`).join("\n"),
    );
    expect(paths).toEqual([
        game === "poe1"
            ? "Metadata/StatDescriptions/stat_descriptions.txt"
            : "Data/StatDescriptions/stat_descriptions.csd",
    ]);
});

it("honors file order and selects specific rules over a wildcard", async () => {
    const { translations } = translator(
        'description\n1 value\n1\n# "old"\nno_description value\ndescription\n1 value\n3\n# "{0}% increased"\n#|-1 "{0}% reduced" negate 1\n100 "Always"',
    );
    expect(
        await translations.translate("item", [{ id: "value", min: -80, max: -60 }], "negative"),
    ).toBe("(80-60)% reduced");
    expect(
        await translations.translate("item", [{ id: "value", min: 100, max: 100 }], "exact"),
    ).toBe("Always");
});

it("preserves empty translations and rounds decimal ties to even", async () => {
    const { translations } = translator(
        'description\n1 hidden\n1\n# ""\ndescription\n1 regen\n1\n# "Regenerate {0}" divide_by_one_hundred_1dp 1',
    );
    expect(await translations.translate("item", [{ id: "hidden", min: 1, max: 1 }], "empty")).toBe(
        "",
    );
    expect(
        await translations.translate("item", [{ id: "regen", min: 125, max: 175 }], "regen"),
    ).toBe("Regenerate (1.2-1.8)");
    expect(numericHandler("multiplicative_damage_modifier", -25)).toBe(75);
});
