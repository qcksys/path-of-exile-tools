import { createHash } from "node:crypto";
import type { Item } from "@poe-tools/api-client";

/**
 * Fields that differ when a stash is re-sent with the item unchanged: `inventoryId` changes on
 * about half of all re-sends, and the position and note follow the tab's layout and price.
 */
const RESENT_FIELDS = ["inventoryId", "x", "y", "note"] as const;

const digests = new WeakMap<Item, string>();

/** A digest of the item apart from `RESENT_FIELDS`, computed once per parsed item. */
export function stableItemDigest(item: Item) {
    let digest = digests.get(item);
    if (digest === undefined) {
        const stable: Record<string, unknown> = { ...item };
        for (const field of RESENT_FIELDS) delete stable[field];
        digest = createHash("sha1").update(JSON.stringify(stable)).digest("base64");
        digests.set(item, digest);
    }
    return digest;
}

/**
 * Identifies a stored row's content: the item apart from `RESENT_FIELDS`, and every column
 * derived from it, so a row whose digest matches needs only its sighting time updated.
 */
export function rowDigest(item: Item, derived: unknown) {
    return createHash("sha1")
        .update(stableItemDigest(item))
        .update(JSON.stringify(derived))
        .digest("base64");
}

export interface ItemMemo<T> {
    (item: Item): T;
    /** Stores a result computed elsewhere for the item whose `stableItemDigest` is `key`. */
    prime(key: string, value: T): void;
}

/**
 * Memoizes `fn` for items that are the same apart from `RESENT_FIELDS`, which `fn` must not read.
 * Re-sent stashes repeat most of their items. Keeps the `capacity` most recently used results.
 */
export function memoizeByItem<T>(fn: (item: Item) => T, capacity: number): ItemMemo<T> {
    const cache = new Map<string, T>();
    const store = (key: string, value: T) => {
        cache.delete(key);
        cache.set(key, value);
        if (cache.size > capacity) cache.delete(cache.keys().next().value as string);
    };
    const memo = (item: Item) => {
        const key = stableItemDigest(item);
        if (cache.has(key)) {
            const value = cache.get(key) as T;
            store(key, value);
            return value;
        }
        const value = fn(item);
        store(key, value);
        return value;
    };
    return Object.assign(memo, { prime: store });
}
