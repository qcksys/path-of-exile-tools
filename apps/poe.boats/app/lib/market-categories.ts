import { isMapMarketBase } from "@poe-tools/market";

/** Each category's label, navigation group, and the item whose art is its navigation icon. */
export const MARKET_CATEGORIES = {
    currency: { label: "Currency", group: "General", icon: "Chaos Orb" },
    fragments: { label: "Fragments", group: "General", icon: "Sacrifice at Midnight" },
    cards: { label: "Divination cards", group: "General", icon: "The Doctor" },
    oils: { label: "Oils", group: "General", icon: "Golden Oil" },
    incubators: { label: "Incubators", group: "General", icon: "Diviner's Incubator" },
    tattoos: { label: "Tattoos", group: "General", icon: "Tattoo of the Ramako Fleetfoot" },
    omens: { label: "Omens", group: "General", icon: "Omen of Amelioration" },
    weapons: { label: "Unique weapons", group: "Equipment & gems", icon: "Vaal Axe" },
    armour: { label: "Unique armour", group: "Equipment & gems", icon: "Astral Plate" },
    accessories: {
        label: "Unique accessories",
        group: "Equipment & gems",
        icon: "Two-Stone Ring",
    },
    flasks: { label: "Unique flasks", group: "Equipment & gems", icon: "Divine Life Flask" },
    jewels: { label: "Jewels", group: "Equipment & gems", icon: "Crimson Jewel" },
    // Listed by name, apart from other jewels; see `marketCategoryFilter`.
    forbidden: { label: "Forbidden jewels", group: "Equipment & gems", icon: "Cobalt Jewel" },
    gems: { label: "Skill gems", group: "Equipment & gems", icon: "Fireball" },
    tinctures: { label: "Tinctures", group: "Equipment & gems", icon: "Prismatic Tincture" },
    relics: { label: "Relics", group: "Equipment & gems", icon: "Urn Relic" },
    maps: { label: "Maps", group: "Atlas", icon: "Map (Tier 16)" },
    scarabs: { label: "Scarabs", group: "Atlas", icon: "Polished Bestiary Scarab" },
    delirium: { label: "Delirium orbs", group: "Atlas", icon: "Fine Delirium Orb" },
    invitations: { label: "Invitations", group: "Atlas", icon: "Maven's Invitation: The Feared" },
    memories: { label: "Memories", group: "Atlas", icon: "Einhar's Memory" },
    heist: { label: "Heist", group: "League mechanics", icon: "Blueprint: Bunker" },
    wombgifts: { label: "Wombgifts", group: "League mechanics", icon: "Ancient Wombgift" },
    legion: { label: "Legion", group: "League mechanics", icon: "Vaal Enshrouding Crystal" },
    expedition: { label: "Expedition", group: "League mechanics", icon: "Exotic Coinage" },
    embers: {
        label: "Allflame embers",
        group: "League mechanics",
        icon: "Allflame Ember of Kulemak",
    },
    ducats: { label: "Ducats & charts", group: "League mechanics", icon: "Merrick's Ducat" },
    encounters: {
        label: "Encounter items",
        group: "League mechanics",
        icon: "Chronicle of Atzoatl",
    },
    fossils: { label: "Fossils", group: "Crafting", icon: "Jagged Fossil" },
    resonators: { label: "Resonators", group: "Crafting", icon: "Primitive Chaotic Resonator" },
    essences: { label: "Essences", group: "Crafting", icon: "Deafening Essence of Greed" },
    catalysts: { label: "Catalysts", group: "Crafting", icon: "Abrasive Catalyst" },
    runes: { label: "Runes", group: "Crafting", icon: "Runegraft of the Agile" },
    beasts: { label: "Beasts", group: "Crafting", icon: "Imprinted Bestiary Orb" },
    corpses: { label: "Corpses", group: "Crafting", icon: "Perfect Pain Artist" },
    "armour-bases": { label: "Armour bases", group: "Crafting bases", icon: "Twilight Regalia" },
    "weapon-bases": { label: "Weapon bases", group: "Crafting bases", icon: "Prophecy Wand" },
    "accessory-bases": { label: "Accessory bases", group: "Crafting bases", icon: "Onyx Amulet" },
    "flask-bases": { label: "Flask bases", group: "Crafting bases", icon: "Quicksilver Flask" },
    "cluster-jewel-bases": {
        label: "Cluster jewel bases",
        group: "Crafting bases",
        icon: "Large Cluster Jewel",
    },
    other: { label: "Other items", group: "Other", icon: "Stacked Deck" },
} as const;

export type MarketCategory = keyof typeof MARKET_CATEGORIES;

/**
 * PoE 2 exchange categories, one per bulk exchange group of the trade site. Items outside every
 * group are listed under `other`.
 */
export const POE2_EXCHANGE_CATEGORIES = {
    currency: { label: "Currency", group: "General", icon: "Exalted Orb" },
    fragments: { label: "Fragments", group: "General", icon: "Timeless Karui Splinter" },
    essences: { label: "Essences", group: "Crafting", icon: "Essence of the Body" },
    runes: { label: "Runes", group: "Crafting", icon: "Desert Rune" },
    "abyssal-bones": { label: "Abyssal bones", group: "Crafting", icon: "Gnawed Jawbone" },
    vaal: { label: "Vaal", group: "Crafting", icon: "Vaal Orb" },
    verisium: { label: "Verisium", group: "Crafting", icon: "Verisium" },
    "uncut-gems": { label: "Uncut gems", group: "Gems", icon: "Uncut Skill Gem" },
    "lineage-gems": { label: "Lineage support gems", group: "Gems", icon: "Ailith's Chimes" },
    ritual: { label: "Ritual", group: "League mechanics", icon: "Omen of Light" },
    delirium: { label: "Delirium", group: "League mechanics", icon: "Simulacrum Splinter" },
    breach: { label: "Breach", group: "League mechanics", icon: "Breach Splinter" },
    expedition: { label: "Expedition", group: "League mechanics", icon: "Exotic Coinage" },
    other: { label: "Other items", group: "Other", icon: "Scroll of Wisdom" },
} as const;

export type Poe2ExchangeCategory = keyof typeof POE2_EXCHANGE_CATEGORIES;

/** A category of either game's exchange items. */
export type MarketExchangeCategory = MarketCategory | Poe2ExchangeCategory;

/** Normal, magic and rare equipment is listed by crafting base cohort, apart from its uniques. */
export const MARKET_BASE_CATEGORIES: Partial<Record<MarketCategory, MarketCategory>> = {
    weapons: "weapon-bases",
    armour: "armour-bases",
    accessories: "accessory-bases",
    flasks: "flask-bases",
};

/** Normal, magic and rare Cluster Jewels are listed by size, skill, passive count and item level. */
export const MARKET_CLUSTER_BASE_CATEGORY = "cluster-jewel-bases" satisfies MarketCategory;

/** The fields of a game data base item that decide its market category. */
export interface MarketBaseItem {
    name: string;
    // biome-ignore lint/style/useNamingConvention: Matches the extracted base item field.
    item_class: string;
    tags?: readonly string[];
}

/** Forbidden Flame and Flesh are listed under their own category, paired by notable. */
export const MARKET_FORBIDDEN_CATEGORY = "forbidden" satisfies MarketCategory;

/**
 * Categories by base item ID, after `Metadata/Items/`, following the trade site's exchange groups.
 * The first match wins.
 */
const ID_CATEGORIES: [RegExp, MarketCategory][] = [
    // Each Scrying Orb names the map it scries, and is listed per map.
    [/^Currency\/CurrencyScryingOrb$/, "maps"],
    [/^Scarabs\//, "scarabs"],
    [/^Currency\/CurrencyAfflictionOrb/, "delirium"],
    [/^Currency\/CurrencyDelveCrafting/, "fossils"],
    [/^Currency\/(?:CurrencyEssence|CurrencyCorruptMonolith$)/, "essences"],
    [/^Currency\/CurrencyJewelleryQuality/, "catalysts"],
    [/^Currency\/(?:Mushrune|CurrencyExtractOil$)/, "oils"],
    [/^Currency\/AncestralTattoo/, "tattoos"],
    [/^Currency\/AncestralOmen/, "omens"],
    [/^Currency\/(?:Runegraft|KalguuranRune)/, "runes"],
    [/^Currency\/LegionCocoon/, "legion"],
    [/^(?:Currency\/CurrencyRefresh|Expedition\/ExpeditionVendorCurrency)/, "expedition"],
    [/^MapFragments\/.*AllflamePack$/, "embers"],
    [/^Deepwater\//, "ducats"],
    [
        /^(?:Currency\/(?:\w+MemoryThread|Astrolabe\w+|CurrencyBreachUpgradeUnique(?:Fire|Cold|Lightning|Physical|Chaos)|CurrencyAfflictionShard|CurrencyRitual(?:Splinter|Stone)|CurrencyValdoPuzzleBox)|MapFragments\/CurrencyMavenKeyFragment)$/,
        "fragments",
    ],
];

/** biome-ignore-start lint/style/useNamingConvention: Keys are extracted item class names. */
const CLASS_CATEGORIES: Record<string, MarketCategory> = {
    CocoonedItem: "legion",
    NecropolisPack: "embers",
    CursedDucat: "ducats",
};
/** biome-ignore-end lint/style/useNamingConvention: Keys are extracted item class names. */

/** Splinters of Breachstones and Timeless Emblems, by their base item tag. */
const FRAGMENT_TAGS = ["breachstone_splinter", "legion_splinter"];

export function marketBaseCategory(
    id: string,
    { name, item_class: itemClass, tags = [] }: MarketBaseItem,
): MarketCategory {
    const path = id.replace(/^Metadata\/Items\//, "");
    const byId = ID_CATEGORIES.find(([pattern]) => pattern.test(path));
    if (byId) return byId[1];
    if (Object.hasOwn(CLASS_CATEGORIES, itemClass)) return CLASS_CATEGORIES[itemClass]!;
    if (tags.some((tag) => FRAGMENT_TAGS.includes(tag))) return "fragments";
    if (name.includes("Invitation")) return "invitations";
    if (/^Delve.*SocketableCurrency$/.test(itemClass)) return "resonators";
    if (
        /^(One Hand|Two Hand|Thrusting|Claw|Dagger|Rune Dagger|Sceptre|Bow|Wand|Staff|Warstaff|FishingRod|Spear|Crossbow|Flail)/.test(
            itemClass,
        )
    )
        return "weapons";
    if (itemClass === "Quiver") return "weapons";
    if (["Body Armour", "Boots", "Gloves", "Helmet", "Shield", "Focus"].includes(itemClass))
        return "armour";
    if (["Amulet", "Ring", "Belt", "Trinket"].includes(itemClass)) return "accessories";
    if (itemClass.endsWith("Flask")) return "flasks";
    if (itemClass.includes("Jewel")) return "jewels";
    if (itemClass.endsWith("Skill Gem")) return "gems";
    if (itemClass === "Tincture") return "tinctures";
    if (itemClass.includes("Relic")) return "relics";
    if (["Map", "MapKey", "Waystone"].includes(itemClass) || isMapMarketBase(name)) return "maps";
    if (
        ["MapFragment", "UniqueFragment", "Breachstone", "VaultKey", "LabyrinthMapItem"].includes(
            itemClass,
        )
    )
        return "fragments";
    if (itemClass === "DivinationCard") return "cards";
    if (itemClass.startsWith("Incubator")) return "incubators";
    if (itemClass === "MemoryLine") return "memories";
    if (name === "Imprinted Bestiary Orb" || itemClass === "CapturedMonster") return "beasts";
    if (itemClass === "ItemisedCorpse") return "corpses";
    if (itemClass.startsWith("Heist")) return "heist";
    if (itemClass === "BrequelFruit") return "wombgifts";
    if (["MiscMapItem", "ItemisedSanctum", "ExpeditionLogbook"].includes(itemClass))
        return "encounters";
    if (itemClass.includes("Currency")) return "currency";
    return "other";
}
