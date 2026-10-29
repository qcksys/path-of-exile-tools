import { MySqlDialect, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { expect, it } from "vite-plus/test";
import { RECIPE_BEASTS } from "~/lib/crafting-beasts";
import { bestiaryNames } from "~/lib/crafting-yellow-beasts";
import { marketBaseCategory } from "~/lib/market-categories";
import { marketCategory, marketCategoryFilter } from "~/lib/market-categories.server";
import { marketExchangeItem } from "~/lib/market-exchange.server";
import { marketFiltersSchema } from "~/schemas/market";
import poe1Categories from "../public/game-data/market-categories-poe1.json";

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
    ["Perfect Pain Artist", "ItemisedCorpse", "corpses"],
    ["Naval Contract", "HeistContract", "heist"],
    ["Blueprint: Bunker", "HeistBlueprint", "heist"],
    ["Golden Grotesque", "HeistObjective", "heist"],
    ["Simple Lockpick", "HeistEquipmentTool", "heist"],
    ["Ancient Wombgift", "BrequelFruit", "wombgifts"],
    ["Chronicle of Atzoatl", "MiscMapItem", "encounters"],
    ["Forbidden Tome", "ItemisedSanctum", "encounters"],
    ["Offering to the Goddess", "LabyrinthMapItem", "fragments"],
    ["Map (Tier 16)", "MapKey", "maps"],
    ["Nightmare Map", "MapKey", "maps"],
    ["Maven's Invitation: The Feared", "MapKey", "invitations"],
    ["Enshrouded Helmet", "CocoonedItem", "other"],
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

it("filters unique equipment by its base type's item class and attributes", () => {
    const table = mysqlTable("markets", {
        baseType: varchar({ length: 255 }),
        signatureKind: varchar({ length: 32 }),
    });
    const bases = (filters: Record<string, string>) =>
        new MySqlDialect().sqlToQuery(
            marketCategoryFilter(
                marketFiltersSchema.parse({ realm: "pc", ...filters }),
                table.baseType,
                table.signatureKind,
            )!,
        ).params;
    const axes = bases({ category: "weapons", baseClass: "Two Hand Axe" });
    expect(axes).toContain("Vaal Axe");
    expect(axes).not.toContain("Spine Bow");
    const robes = bases({ category: "armour", baseClass: "Body Armour", attributes: "int" });
    expect(robes).toContain("Simple Robe");
    expect(robes).not.toContain("Astral Plate");
    expect(robes).not.toContain("Goathide Boots");
    expect(bases({ category: "armour" })).toContain("Goathide Boots");
});

it("lists captured beasts, whose base type is the beast's name, under beasts", () => {
    for (const name of ["Farrul, First of the Plains", "Craicic Croaker", "Vivid Vulture"])
        expect(marketCategory("pc", name)).toBe("beasts");
    expect(marketCategory("poe2", "Farrul, First of the Plains")).toBe("other");
});

it("names no base item after a captured beast", () => {
    for (const name of [...Object.values(RECIPE_BEASTS), ...bestiaryNames])
        expect(Object.hasOwn(poe1Categories, name)).toBe(false);
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
