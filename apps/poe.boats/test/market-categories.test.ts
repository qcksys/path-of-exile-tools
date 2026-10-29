import { MySqlDialect, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { expect, it } from "vite-plus/test";
import { RECIPE_BEASTS } from "~/lib/crafting-beasts";
import { bestiaryNames } from "~/lib/crafting-yellow-beasts";
import { marketBaseCategory } from "~/lib/market-categories";
import { marketCategory, marketCategoryFilter } from "~/lib/market-categories.server";
import { marketExchangeItem } from "~/lib/market-exchange.server";
import { marketFiltersSchema } from "~/schemas/market";
import poe1Categories from "../public/game-data/market-categories-poe1.json";

const SPLINTER_TAGS: Record<string, string[]> = {
    "Timeless Vaal Splinter": ["legion_splinter", "currency"],
    "Splinter of Xoph": ["breachstone_splinter", "currency"],
};

it.each([
    ["Goathide Boots", "Armours/Boots/BootsDex2", "Boots", "armour"],
    ["Leather Belt", "Belts/Belt3", "Belt", "accessories"],
    ["Spine Bow", "Weapons/TwoHandWeapons/Bows/Bow20", "Bow", "weapons"],
    ["Quicksilver Flask", "Flasks/FlaskUtility6", "UtilityFlask", "flasks"],
    ["Cobalt Jewel", "Jewels/JewelInt", "Jewel", "jewels"],
    ["Fireball", "Gems/SkillGemFireball", "Active Skill Gem", "gems"],
    ["Divine Orb", "Currency/CurrencyModValues", "StackableCurrency", "currency"],
    ["The Doctor", "DivinationCards/DivinationCardTheDoctor", "DivinationCard", "cards"],
    ["The Catalyst", "DivinationCards/DivinationCardTheCatalyst", "DivinationCard", "cards"],
    ["Gilded Divination Scarab", "Scarabs/ScarabDivinationCards3", "MapFragment", "scarabs"],
    ["Veiled Scarab", "Currency/CurrencyStackedScarab", "StackableCurrency", "currency"],
    ["Jagged Fossil", "Currency/CurrencyDelveCraftingPhysical", "StackableCurrency", "fossils"],
    [
        "Deafening Essence of Greed",
        "Currency/CurrencyEssenceGreed7",
        "StackableCurrency",
        "essences",
    ],
    ["Remnant of Corruption", "Currency/CurrencyCorruptMonolith", "StackableCurrency", "essences"],
    [
        "Primitive Chaotic Resonator",
        "Delve/DelveStackableSocketableCurrencyReroll1",
        "DelveStackableSocketableCurrency",
        "resonators",
    ],
    [
        "Fine Delirium Orb",
        "Currency/CurrencyAfflictionOrbCurrency",
        "StackableCurrency",
        "delirium",
    ],
    [
        "Abrasive Catalyst",
        "Currency/CurrencyJewelleryQualityAttack",
        "StackableCurrency",
        "catalysts",
    ],
    ["Golden Oil", "Currency/Mushrune12", "StackableCurrency", "oils"],
    ["Oil Extractor", "Currency/CurrencyExtractOil", "StackableCurrency", "oils"],
    [
        "Tattoo of the Ramako Fleetfoot",
        "Currency/AncestralTattooRamako4",
        "StackableCurrency",
        "tattoos",
    ],
    ["Loyalty Tattoo of Kaom", "Currency/AncestralTattooNgamahu6", "StackableCurrency", "tattoos"],
    [
        "Omen of Amelioration",
        "Currency/AncestralOmenOnDeathPreventExpLoss",
        "StackableCurrency",
        "omens",
    ],
    ["Perfect Pain Artist", "ItemisedCorpses/CasterDemonHigh", "ItemisedCorpse", "corpses"],
    [
        "Naval Contract",
        "Heist/QuestContracts/HeistContractQuestFaustusRepeatable",
        "HeistContract",
        "heist",
    ],
    ["Blueprint: Bunker", "Heist/HeistBlueprintControlBlocks", "HeistBlueprint", "heist"],
    ["Golden Grotesque", "Heist/HeistFinalObjective46", "HeistObjective", "heist"],
    ["Simple Lockpick", "Heist/HeistEquipmentLockpicking1", "HeistEquipmentTool", "heist"],
    ["Ancient Wombgift", "Chayula/UniqueItemFruit", "BrequelFruit", "wombgifts"],
    ["Chronicle of Atzoatl", "Incursion/ItemisedTemple", "MiscMapItem", "encounters"],
    ["Forbidden Tome", "Sanctum/SanctumKey", "ItemisedSanctum", "encounters"],
    ["Offering to the Goddess", "Labyrinth/OfferingToTheGoddess", "LabyrinthMapItem", "fragments"],
    ["Map (Tier 16)", "Maps/MapKeyTier16", "MapKey", "maps"],
    ["Nightmare Map", "Maps/MapKeyNightmareBoss", "MapKey", "maps"],
    ["Valdo Map", "Maps/MapKeyReliquary", "MapKey", "maps"],
    ["Scrying Orb", "Currency/CurrencyScryingOrb", "StackableCurrency", "maps"],
    [
        "Maven's Invitation: The Feared",
        "MapFragments/Maven/MavenMapVoid5",
        "MiscMapItem",
        "invitations",
    ],
    ["Runegraft of the Agile", "Currency/RunegraftElusive", "StackableCurrency", "runes"],
    ["Sun Rune", "Currency/KalguuranRune1", "StackableCurrency", "runes"],
    ["Vaal Enshrouding Crystal", "Currency/LegionCocoonHelmet", "StackableCurrency", "legion"],
    ["Enshrouded Helmet", "Legion/CocoonedHelmet", "CocoonedItem", "legion"],
    ["Burial Medallion", "Currency/CurrencyRefreshSaga", "StackableCurrency", "expedition"],
    ["Exotic Coinage", "Currency/CurrencyRefreshBarter", "StackableCurrency", "expedition"],
    [
        "Lesser Sun Artifact",
        "Expedition/ExpeditionVendorCurrencyFaction4_1",
        "StackableCurrency",
        "expedition",
    ],
    ["Allflame Ember of Kulemak", "MapFragments/BetrayalAllflamePack", "MapFragment", "embers"],
    ["Allflame Ember of Frogs", "NecropolisPacks/FrogsNecropolisPack", "NecropolisPack", "embers"],
    ["Merrick's Ducat", "Deepwater/DeepwaterAbyssCurrency", "StackableCurrency", "ducats"],
    ["Coral Reef Chart", "Deepwater/ChartCoralReef", "DeepwaterChart", "ducats"],
    ["Ducat of the Foul Kin", "QuestItems/Deepwater/DeepwaterQuestDucat2", "CursedDucat", "ducats"],
    ["Memory of Trauma", "Currency/FearMemoryThread", "StackableCurrency", "fragments"],
    ["Memory of Loneliness", "Currency/IgnoranceMemoryThread", "StackableCurrency", "fragments"],
    [
        "Crescent Splinter",
        "MapFragments/CurrencyMavenKeyFragment",
        "StackableCurrency",
        "fragments",
    ],
    [
        "Timeless Vaal Splinter",
        "Currency/CurrencyLegionVaalShard",
        "StackableCurrency",
        "fragments",
    ],
    ["Splinter of Xoph", "Currency/CurrencyBreachFireShard", "StackableCurrency", "fragments"],
    ["Timeless Astrolabe", "Currency/AstrolabeLegion", "StackableCurrency", "fragments"],
    [
        "Blessing of Xoph",
        "Currency/CurrencyBreachUpgradeUniqueFire",
        "StackableCurrency",
        "fragments",
    ],
    [
        "Flesh of Xesht",
        "Currency/CurrencyBreachUpgradeUniqueGeneral",
        "StackableCurrency",
        "currency",
    ],
    ["Simulacrum Splinter", "Currency/CurrencyAfflictionShard", "StackableCurrency", "fragments"],
    ["Ritual Vessel", "Currency/CurrencyRitualStone", "StackableCurrency", "fragments"],
    ["Valdo's Puzzle Box", "Currency/CurrencyValdoPuzzleBox", "StackableCurrency", "fragments"],
    ["Unknown", "Unknown/NewItem", "NewClass", "other"],
])("categorizes %s (%s) by its base item ID, class and tags", (name, id, itemClass, category) => {
    expect(
        marketBaseCategory(`Metadata/Items/${id}`, {
            name,
            // biome-ignore lint/style/useNamingConvention: Matches the extracted base item field.
            item_class: itemClass,
            tags: SPLINTER_TAGS[name],
        }),
    ).toBe(category);
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
