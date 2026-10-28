import { expect, it } from "vite-plus/test";
import { marketBaseCategory } from "~/lib/market-categories";
import { marketCategory } from "~/lib/market-categories.server";
import { marketExchangeItem } from "~/lib/market-exchange.server";

it.each([
    ["Goathide Boots", "Boots", "armour"],
    ["Leather Belt", "Belt", "accessories"],
    ["Spine Bow", "Bow", "weapons"],
    ["Quicksilver Flask", "UtilityFlask", "flasks"],
    ["Cobalt Jewel", "Jewel", "jewels"],
    ["Fireball", "Active Skill Gem", "gems"],
    ["Divine Orb", "StackableCurrency", "currency"],
    ["The Doctor", "DivinationCard", "cards"],
    ["Gilded Divination Scarab", "MapFragment", "scarabs"],
    ["Jagged Fossil", "StackableCurrency", "fossils"],
    ["Deafening Essence of Greed", "StackableCurrency", "essences"],
    ["Primitive Chaotic Resonator", "DelveStackableSocketableCurrency", "resonators"],
    ["Fine Delirium Orb", "StackableCurrency", "delirium"],
    ["Unknown", "NewClass", "other"],
])("categorizes %s using its extracted class", (name, itemClass, category) => {
    expect(marketBaseCategory(name, itemClass)).toBe(category);
});

it("uses each game's verified base catalog and retains unknown items", () => {
    expect(marketCategory("pc", "Goathide Boots")).toBe("armour");
    expect(marketCategory("sony", "Leather Belt")).toBe("accessories");
    expect(marketCategory("poe2", "Rusted Cuirass")).toBe("armour");
    expect(marketCategory("pc", "Unknown future base")).toBe("other");
});

it("identifies exchange skill gems without treating equipment as exchange items", () => {
    // PoE 2 categories follow the trade site's exchange groups, which list only lineage gems.
    expect(marketExchangeItem("poe2", "Metadata/Items/Gems/SupportGemAilithLineage")).toEqual({
        name: "Ailith's Chimes",
        category: "lineage-gems",
    });
    expect(marketExchangeItem("poe2", "Metadata/Items/Gems/SkillGemIceNova")).toEqual({
        name: "Ice Nova",
        category: "other",
    });
    expect(marketExchangeItem("poe2", "Metadata/Items/Gems/SkillGemBlasphemy")).toEqual({
        name: "Blasphemy",
        category: "other",
    });
    expect(
        marketExchangeItem("poe2", "Metadata/Items/Armours/BodyArmours/FourBodyStr1"),
    ).toBeUndefined();
});
