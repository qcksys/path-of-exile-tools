import type { Item } from "@poe-tools/api-client";
import { isBlightedMap, isMapMarketBase } from "@poe-tools/market";

/**
 * Whether to persist this item. Captures every unique, skill gem and tier or
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
];

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

export function shouldCapture(item: Item): boolean {
    return Boolean(item.id) && ITEM_CATEGORIES.some((category) => category.matches(item));
}
