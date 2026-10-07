import { describe, expect, it } from "vite-plus/test";
import {
    compareItemPresentations,
    type ItemPresentation,
    itemArtUrl,
    itemSubtitle,
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
    });
});
