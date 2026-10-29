import type { Item } from "@poe-tools/api-client";
import { isBlightedMap, isMapMarketBase } from "@poe-tools/market";

/**
 * Whether to persist this item. Captures every unique, skill gem, captured beast and tier or
 * Nightmare map plus identified currency-tier items. No watchlist — the universe of interest is
 * defined by the structured mod-extractor config and downstream queries.
 *
 * Legacy numeric frames remain a fallback when rarity is absent.
 */
export const ITEM_CATEGORIES: ReadonlyArray<{ name: string; matches: (item: Item) => boolean }> = [
    { name: "unique", matches: isUniqueItem },
    {
        name: "currency",
        matches: (item) => item.identified && (item.frameType === 5 || item.rarity === "Currency"),
    },
    { name: "divination-card", matches: (item) => item.identified && item.frameType === 6 },
    { name: "gem", matches: isGemItem },
    { name: "map", matches: isMapItem },
    { name: "beast", matches: isCapturedBeast },
    { name: "heist", matches: isHeistMarketItem },
];

const BESTIARY_PROPERTIES = ["Genus", "Group", "Family"];

/**
 * A beast captured in a Bestiary Orb: its base type is the monster's name and its properties name
 * its genus, group and family. Yellow and red beasts are both rare items with a random name.
 */
export function isCapturedBeast(item: Pick<Item, "identified" | "properties">): boolean {
    return (
        item.identified &&
        BESTIARY_PROPERTIES.every((name) =>
            item.properties?.some((property) => property.name === name),
        )
    );
}

export function isUniqueItem(item: { rarity?: string | null; frameType?: number }): boolean {
    return item.rarity != null ? item.rarity === "Unique" : item.frameType === 3;
}

export function isGemItem(item: { rarity?: string | null; frameType?: number }): boolean {
    return item.rarity != null ? item.rarity === "Gem" : item.frameType === 4;
}

/** `Map (Tier N)` and Nightmare maps, apart from unique and blighted ones. */
export function isMapItem(item: {
    rarity?: string | null;
    frameType?: number;
    baseType: string;
    typeLine: string;
}): boolean {
    return !isUniqueItem(item) && isMapMarketBase(item.baseType) && !isBlightedMap(item.typeLine);
}

/** A property's first value, e.g. `83` for `Area Level` or `1/3` for `Wings Revealed`. */
export function propertyText(item: Pick<Item, "properties">, name: string) {
    return item.properties?.find((property) => property.name === name)?.values[0]?.[0];
}

export const HEIST_AREA_LEVEL = "83";
/** Blueprints trade with one wing or every wing revealed. */
export const HEIST_BLUEPRINT_WINGS = ["1/3", "1/4", "3/3", "4/4"];
/** Every blueprint shares one market, whatever its location (`Blueprint: Bunker`). */
export const HEIST_BLUEPRINT_KEY = "Blueprint";

export function isHeistContract(item: Pick<Item, "properties">) {
    return Boolean(item.properties?.some((property) => property.name.startsWith("Heist Target")));
}

export function isHeistBlueprint(item: Pick<Item, "properties">) {
    return propertyText(item, "Wings Revealed") !== undefined;
}

/**
 * Uncorrupted, non-unique Heist contracts and blueprints for area level 83 (item level 83 and
 * above): contracts only identified, blueprints identified or not (wings revealed and enchants
 * show either way) and only with one or every wing revealed.
 */
export function isHeistMarketItem(item: Item): boolean {
    if (item.corrupted || isUniqueItem(item)) return false;
    if (propertyText(item, "Area Level") !== HEIST_AREA_LEVEL) return false;
    if (isHeistContract(item)) return item.identified;
    return HEIST_BLUEPRINT_WINGS.includes(propertyText(item, "Wings Revealed") ?? "");
}

export function shouldCapture(item: Item): boolean {
    return Boolean(item.id) && ITEM_CATEGORIES.some((category) => category.matches(item));
}
