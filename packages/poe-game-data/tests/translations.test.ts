import { expect, it } from "vite-plus/test";
import { AssetNotFound } from "../src/source.ts";
import { Tables } from "../src/tables.ts";
import { parseDescriptions, Translations } from "../src/translations.ts";

// PoE 1 builds before 3.30 ship .txt description files; 3.30 ships .csd files that include .csd.
it.each([".txt", ".csd"])(
    "resolves includes, local overrides, signed ranges and numeric handlers from PoE 1 %s files",
    async (extension) => {
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
        expect(
            await translations.translate("item", [{ id: "life", min: 10, max: 24 }], "life"),
        ).toBe("+(10-24) to maximum Life");
        expect(
            await translations.translate("area", [{ id: "life", min: 10, max: 24 }], "map"),
        ).toBe("Map life (10-24)");
        expect(
            await translations.translate(
                "item",
                [{ id: "duration", min: 1000, max: 2500 }],
                "duration",
            ),
        ).toBe("Lasts (1-2.5) seconds");
        expect(reads.sort()).toEqual(Object.keys(files).sort());
    },
);

it("names PoE 1 3.30 fishing lures from their table and uses a placeholder for a range", async () => {
    // FishingLureTypes rows hold an unnamed i32 equal to the stat value, then the lure name.
    const names = ["Rhoa Feather Lure", "Siren Worm Bait", "Totemic Wood Lure"];
    // Strings are UTF-16 and end with zero bytes, as in tables.test.ts.
    const parts = names.map((name) => Buffer.from(`${name}\0\0\0`, "utf16le"));
    const strings = Buffer.concat(parts);
    const offsets = parts.map((_, index) =>
        parts.slice(0, index).reduce((total, part) => total + part.length, 0),
    );
    const dat = Buffer.alloc(4 + names.length * 12 + 8 + strings.length);
    dat.writeUInt32LE(names.length);
    for (const [index, offset] of offsets.entries()) {
        dat.writeInt32LE(index + 1, 4 + index * 12);
        dat.writeBigUInt64LE(BigInt(8 + offset), 4 + index * 12 + 4);
    }
    dat.fill(0xbb, 4 + names.length * 12, 4 + names.length * 12 + 8);
    strings.copy(dat, 4 + names.length * 12 + 8);
    const source = {
        get: async (name: string) => {
            if (name === "Data/FishingLureTypes.datc64") return dat;
            if (name === "Metadata/StatDescriptions/stat_descriptions.csd")
                return Buffer.from(
                    'description\n1 fishing_lure_type\n1\n# "{0}" fishing_lure_type 1',
                );
            throw new AssetNotFound(`Missing asset: ${name}`);
        },
    };
    const column = { array: false, interval: false, references: null };
    const translations = new Translations(
        source,
        new Tables("poe1", source, {
            version: 7,
            tables: [
                {
                    name: "FishingLureTypes",
                    validFor: 1,
                    columns: [
                        { name: null, type: "i32", ...column },
                        { name: "Name", type: "string", ...column },
                    ],
                },
            ],
        }),
    );
    const lure = (min: number, max: number) =>
        translations.translate("item", [{ id: "fishing_lure_type", min, max }], "FishingLureType");
    expect(await lure(2, 2)).toBe("Siren Worm Bait");
    expect(await lure(1, 3)).toBe("&lt;random Fishing Lure&gt;");
    const exported = await translations.exportDescriptions({
        FishingLureType: {
            domain: "item",
            generation_type: "prefix",
            text: "&lt;random Fishing Lure&gt;",
            stats: [{ id: "fishing_lure_type", min: 1, max: 3 }],
        },
    } as never);
    expect(exported.statLookups.fishing_lure_type).toEqual({
        1: "Rhoa Feather Lure",
        2: "Siren Worm Bait",
        3: "Totemic Wood Lure",
    });
});

it("rejects malformed description arity", () => {
    expect(() => parseDescriptions('description\n2 life mana\n1\n# "Broken"')).toThrow(
        "condition count",
    );
});
