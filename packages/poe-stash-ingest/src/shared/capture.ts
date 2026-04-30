import type { Item } from "@poe-tools/api-client";

/**
 * Whether to persist this item. Captures every unique (frameType=3) plus
 * identified currency-tier items. No watchlist — the universe of interest is
 * defined by the structured mod-extractor config and downstream queries.
 *
 * frameType reference: 0 normal · 1 magic · 2 rare · 3 unique · 4 gem ·
 * 5 currency · 6 divination card · 8 prophecy · 9 relic · 10 (legacy).
 */
export function shouldCapture(item: Item): boolean {
    if (!item.id) return false;
    if (item.frameType === 3) return true;
    if (item.identified && (item.frameType === 5 || item.frameType === 6)) return true;
    if (item.identified && item.rarity === "Currency") return true;
    return false;
}
