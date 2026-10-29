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
    flasks: { label: "Flasks", group: "Equipment & gems", icon: "Divine Life Flask" },
    jewels: { label: "Jewels", group: "Equipment & gems", icon: "Crimson Jewel" },
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
    "armour-bases": { label: "Armour bases", group: "Crafting bases", icon: "Vaal Regalia" },
    "weapon-bases": { label: "Weapon bases", group: "Crafting bases", icon: "Imbued Wand" },
    "accessory-bases": { label: "Accessory bases", group: "Crafting bases", icon: "Onyx Amulet" },
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
};

/** Normal, magic and rare Cluster Jewels are listed by size, skill, passive count and item level. */
export const MARKET_CLUSTER_BASE_CATEGORY = "cluster-jewel-bases" satisfies MarketCategory;

export function isMarketBaseCategory(category: MarketCategory | "all") {
    return (
        category === MARKET_CLUSTER_BASE_CATEGORY ||
        Object.values(MARKET_BASE_CATEGORIES).includes(category as MarketCategory)
    );
}

/**
 * Categories whose markets split by identification: unique equipment, jewels and maps, and the
 * category-less lists. Elsewhere (stackable items, gems, crafting bases) the filter is hidden and
 * every identification state matches.
 */
const IDENTIFICATION_CATEGORIES = new Set<MarketCategory | "all">([
    "all",
    "weapons",
    "armour",
    "accessories",
    "flasks",
    "jewels",
    "tinctures",
    "relics",
    "maps",
    "other",
]);

export function marketHasIdentification(category: MarketCategory | "all") {
    return IDENTIFICATION_CATEGORIES.has(category);
}

/** Categories whose markets split by corruption: those split by identification, and skill gems. */
export function marketHasCorruption(category: MarketCategory | "all") {
    return category === "gems" || IDENTIFICATION_CATEGORIES.has(category);
}

/** The categories listing unique equipment, apart from its crafting bases. */
export function isMarketUniqueCategory(category: MarketCategory | "all") {
    return category in MARKET_BASE_CATEGORIES;
}

/** Stackable currency the trade site groups with fragments. */
const FRAGMENT_CURRENCY = /^(?:Timeless .+ Splinter|Crescent Splinter|Memory of Trauma)$/;
const EXPEDITION_CURRENCY = ["Astragali", "Exotic Coinage", "Scrap Metal", "Burial Medallion"];

export function marketBaseCategory(name: string, itemClass: string): MarketCategory {
    // Each Scrying Orb names the map it scries, and is listed per map.
    if (name === "Scrying Orb") return "maps";
    if (FRAGMENT_CURRENCY.test(name)) return "fragments";
    if (name.endsWith(" Enshrouding Crystal")) return "legion";
    if (EXPEDITION_CURRENCY.includes(name)) return "expedition";
    if (itemClass === "StackableCurrency" && /^Runegraft of | Rune$/.test(name)) return "runes";
    if (name.includes("Scarab")) return "scarabs";
    if (name.endsWith("Delirium Orb")) return "delirium";
    if (name.includes("Invitation")) return "invitations";
    if (name.endsWith("Fossil")) return "fossils";
    if (/^Delve.*SocketableCurrency$/.test(itemClass)) return "resonators";
    if (/^(?:.* Essence of |Essence of |Remnant of Corruption$)/.test(name)) return "essences";
    if (name.endsWith("Catalyst")) return "catalysts";
    if (name.endsWith(" Oil")) return "oils";
    if (/^(Tattoo of |Journey Tattoo of )/.test(name)) return "tattoos";
    if (name.startsWith("Omen of ")) return "omens";
    if (
        /^(One Hand|Two Hand|Thrusting|Claw|Dagger|Rune Dagger|Sceptre|Bow|Wand|Staff|Warstaff|FishingRod|Spear|Crossbow|Flail)/.test(
            itemClass,
        )
    )
        return "weapons";
    if (["Body Armour", "Boots", "Gloves", "Helmet", "Shield", "Focus"].includes(itemClass))
        return "armour";
    if (["Amulet", "Ring", "Belt", "Quiver", "Trinket"].includes(itemClass)) return "accessories";
    if (itemClass.endsWith("Flask")) return "flasks";
    if (itemClass.includes("Jewel")) return "jewels";
    if (itemClass.endsWith("Skill Gem")) return "gems";
    if (itemClass === "Tincture") return "tinctures";
    if (itemClass.includes("Relic")) return "relics";
    if (["Map", "Waystone"].includes(itemClass) || isMapMarketBase(name)) return "maps";
    if (
        [
            "MapFragment",
            "UniqueFragment",
            "Breachstone",
            "MapKey",
            "VaultKey",
            "LabyrinthMapItem",
        ].includes(itemClass)
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
