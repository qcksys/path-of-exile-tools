import { expect, it } from "vite-plus/test";
import { AssetNotFound } from "../src/source.ts";
import { Tables } from "../src/tables.ts";
import { parseDescriptions, Translations } from "../src/translations.ts";

// PoE 1 builds before 3.30 ship .txt description files; 3.30 ships .csd files that include .csd.
it.each([
    ".txt",
    ".csd",
])("resolves includes, local overrides, signed ranges and numeric handlers from PoE 1 %s files", async (extension) => {
    const files: Record<string, string> = {
        [`Metadata/StatDescriptions/map_stat_descriptions${extension}`]: `include "Metadata/StatDescriptions/stat_descriptions${extension}"\ndescription\n1 life\n1\n# "Map life {0}"`,
        [`Metadata/StatDescriptions/stat_descriptions${extension}`]:
            'description\n1 life\n1\n# "{0:+d} to maximum Life"\ndescription\n1 duration\n1\n# "Lasts {0} seconds" milliseconds_to_seconds 1',
    };
    const reads: string[] = [];
    const source = {
        get: async (name: string) => {
            const text = files[name];
            if (text === undefined) throw new AssetNotFound(`Missing asset: ${name}`);
            reads.push(name);
            return Buffer.from(text);
        },
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
    expect(reads.sort()).toEqual(Object.keys(files).sort());
});

it("rejects malformed description arity", () => {
    expect(() => parseDescriptions('description\n2 life mana\n1\n# "Broken"')).toThrow(
        "condition count",
    );
});
