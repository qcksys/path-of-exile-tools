import type { Item } from "@poe-tools/api-client";

/**
 * Whether to persist this item. Captures every unique plus
 * identified currency-tier items. No watchlist — the universe of interest is
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
];

export function isUniqueItem(item: { rarity?: string | null; frameType?: number }): boolean {
    return item.rarity != null ? item.rarity === "Unique" : item.frameType === 3;
}

export function shouldCapture(item: Item): boolean {
    return Boolean(item.id) && ITEM_CATEGORIES.some((category) => category.matches(item));
}
