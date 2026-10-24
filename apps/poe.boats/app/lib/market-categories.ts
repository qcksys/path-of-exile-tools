export const MARKET_CATEGORIES = {
    currency: { label: "Currency", group: "General" },
    fragments: { label: "Fragments", group: "General" },
    cards: { label: "Divination cards", group: "General" },
    oils: { label: "Oils", group: "General" },
    incubators: { label: "Incubators", group: "General" },
    tattoos: { label: "Tattoos", group: "General" },
    omens: { label: "Omens", group: "General" },
    weapons: { label: "Weapons", group: "Equipment & gems" },
    armour: { label: "Armour", group: "Equipment & gems" },
    accessories: { label: "Accessories", group: "Equipment & gems" },
    flasks: { label: "Flasks", group: "Equipment & gems" },
    jewels: { label: "Jewels", group: "Equipment & gems" },
    gems: { label: "Skill gems", group: "Equipment & gems" },
    tinctures: { label: "Tinctures", group: "Equipment & gems" },
    relics: { label: "Relics", group: "Equipment & gems" },
    maps: { label: "Maps", group: "Atlas" },
    scarabs: { label: "Scarabs", group: "Atlas" },
    delirium: { label: "Delirium orbs", group: "Atlas" },
    invitations: { label: "Invitations", group: "Atlas" },
    memories: { label: "Memories", group: "Atlas" },
    fossils: { label: "Fossils", group: "Crafting" },
    resonators: { label: "Resonators", group: "Crafting" },
    essences: { label: "Essences", group: "Crafting" },
    catalysts: { label: "Catalysts", group: "Crafting" },
    beasts: { label: "Beasts", group: "Crafting" },
    other: { label: "Other items", group: "Other" },
} as const;

export type MarketCategory = keyof typeof MARKET_CATEGORIES;

export function marketBaseCategory(name: string, itemClass: string): MarketCategory {
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
    if (["Map", "Waystone"].includes(itemClass)) return "maps";
    if (["MapFragment", "UniqueFragment", "Breachstone", "MapKey", "VaultKey"].includes(itemClass))
        return "fragments";
    if (itemClass === "DivinationCard") return "cards";
    if (itemClass.startsWith("Incubator")) return "incubators";
    if (itemClass === "MemoryLine") return "memories";
    if (name === "Imprinted Bestiary Orb" || itemClass === "CapturedMonster") return "beasts";
    if (itemClass.includes("Currency")) return "currency";
    return "other";
}
