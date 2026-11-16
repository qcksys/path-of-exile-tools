import { createHash } from "node:crypto";
import type { Item } from "@poe-tools/api-client";

/**
 * Fields that differ when a stash is re-sent with the item unchanged: `inventoryId` changes on
 * about half of all re-sends, and the position and note follow the tab's layout and price.
 */
const RESENT_FIELDS = ["inventoryId", "x", "y", "note"] as const;

function stableItemDigest(item: Item) {
    const stable: Record<string, unknown> = { ...item };
    for (const field of RESENT_FIELDS) delete stable[field];
    return createHash("sha1").update(JSON.stringify(stable)).digest("base64");
}

/**
 * Memoizes `fn` for items that are the same apart from `RESENT_FIELDS`, which `fn` must not read.
 * Re-sent stashes repeat most of their items. Keeps the `capacity` most recently used results.
 */
export function memoizeByItem<T>(fn: (item: Item) => T, capacity: number): (item: Item) => T {
    const cache = new Map<string, T>();
    return (item) => {
        const key = stableItemDigest(item);
        if (cache.has(key)) {
            const value = cache.get(key) as T;
            cache.delete(key);
            cache.set(key, value);
            return value;
        }
        const value = fn(item);
        cache.set(key, value);
        if (cache.size > capacity) cache.delete(cache.keys().next().value as string);
        return value;
    };
}
