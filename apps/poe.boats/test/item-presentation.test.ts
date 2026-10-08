import { describe, expect, it } from "vite-plus/test";
import {
    compareItemPresentations,
    findItemPresentation,
    type ItemPresentation,
    itemArtUrl,
    itemSubtitle,
    marketItemArtUrl,
} from "../app/lib/item-presentation";

const base: ItemPresentation = {
    name: "Plate Vest",
    itemClass: "Body Armour",
    art: "",
    dropLevel: 1,
    requirements: { level: 1, strength: 12, dexterity: 0, intelligence: 0 },
    implicits: [],
};

describe("item presentation", () => {
    it("resolves canonical and prefixed IDs before exact case-insensitive names", () => {
        const items = {
            plate: base,
            duplicate: { ...base, art: "plate.png" },
            orb: { ...base, name: "Chaos Orb", art: "chaos.png" },
        };
        expect(findItemPresentation(items, "poe1:orb", "Plate Vest")).toBe(items.orb);
        expect(findItemPresentation(items, undefined, "plate vest")).toBe(items.duplicate);
        expect(findItemPresentation(items, undefined, "Chaos")).toBeUndefined();
        expect(findItemPresentation(items, "unknown")).toBeUndefined();
        expect(findItemPresentation({ orb: { ...base, art: "poe2.png" } }, "orb")?.art).toBe(
            "poe2.png",
        );
    });
    it("reconstructs captured market assets without accepting arbitrary URLs or traversal", () => {
        const expected = "https://www.pathofexile.com/image/Art/2DItems/Rings/Test%20Ring.png";
        for (const path of [
            "2DItems/Rings/Test Ring",
            "Art/2DItems/Rings/Test Ring.dds",
            "2DItems/Rings/Test Ring.png",
        ])
            expect(marketItemArtUrl(path)).toBe(expected);
        for (const path of [
            null,
            "",
            "https://example.com/icon.png",
            "2DItems/../secret",
            "2DItems/Test?x=1",
        ])
            expect(marketItemArtUrl(path)).toBe("");
    });
    it("orders by type, base level and requirements before the name", () => {
        const items = [
            { ...base, name: "Alphabetical first", dropLevel: 10 },
            {
                ...base,
                name: "Higher requirement",
                requirements: { ...base.requirements!, strength: 20 },
            },
            base,
            { ...base, name: "Amulet", itemClass: "Amulet", dropLevel: 80 },
        ];
        expect(items.sort(compareItemPresentations).map((item) => item.name)).toEqual([
            "Amulet",
            "Plate Vest",
            "Higher requirement",
            "Alphabetical first",
        ]);
    });
    it("labels the base level separately from requirements without inventing drop conditions", () => {
        expect(itemSubtitle(base)).toBe("Base level 1 · 12 Str · Requires level 1");
        expect(itemSubtitle({ ...base, requirements: null })).toBe("Base level 1");
    });
    it("uses the extracted artwork path and encodes its segments", () => {
        expect(itemArtUrl("Art/2DItems/Armours/BodyArmours/BodyStr1A.dds")).toBe(
            "https://www.pathofexile.com/image/Art/2DItems/Armours/BodyArmours/BodyStr1A.png",
        );
        expect(itemArtUrl("Art/2DItems/Test Item.dds")).toContain("Test%20Item.png");
        expect(itemArtUrl("Metadata/Items/Test.dds")).toBe("");
        expect(itemArtUrl("Art/2DItems/Armours/BodyArmours/Basetypes/BodyStr01.dds", "poe2")).toBe(
            "https://cdn.poe2db.tw/image/Art/2DItems/Armours/BodyArmours/Basetypes/BodyStr01.webp",
        );
        expect(marketItemArtUrl("2DItems/Armours/BodyArmours/Basetypes/BodyStr01", "poe2")).toBe(
            itemArtUrl("Art/2DItems/Armours/BodyArmours/Basetypes/BodyStr01.dds", "poe2"),
        );
    });
});
