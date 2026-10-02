import { expect, it } from "vite-plus/test";
import { Tables } from "../src/tables.ts";
import { parseDescriptions, Translations } from "../src/translations.ts";

it("resolves includes, local overrides, signed ranges and numeric handlers", async () => {
    const source = {
        get: async (name: string) =>
            Buffer.from(
                name.endsWith("map_stat_descriptions.txt")
                    ? 'include "Metadata/StatDescriptions/stat_descriptions.txt"\ndescription\n1 life\n1\n# "Map life {0}"'
                    : 'description\n1 life\n1\n# "{0:+d} to maximum Life"\ndescription\n1 duration\n1\n# "Lasts {0} seconds" milliseconds_to_seconds 1',
            ),
    };
    const translations = new Translations(
        source,
        new Tables("poe1", source, { version: 7, tables: [] }),
    );
    expect(await translations.translate("item", [{ id: "life", min: 10, max: 24 }], "life")).toBe(
        "+(10-24) to maximum Life",
    );
    expect(await translations.translate("area", [{ id: "life", min: 10, max: 24 }], "map")).toBe(
        "Map life (10-24)",
    );
    expect(
        await translations.translate(
            "item",
            [{ id: "duration", min: 1000, max: 2500 }],
            "duration",
        ),
    ).toBe("Lasts (1-2.5) seconds");
});

it("rejects malformed description arity", () => {
    expect(() => parseDescriptions('description\n2 life mana\n1\n# "Broken"')).toThrow(
        "condition count",
    );
});
