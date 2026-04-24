import type { Item } from "@poe-tools/api-client";

/**
 * Canonical market key for a listing.
 *
 * For identified uniques, `name` is the market identity; corruption and
 * foil status are part of the key because they trade as separate items.
 *
 * For unidentified uniques, `baseType` is too coarse (e.g. Cobalt Jewel
 * spans Forbidden Flesh, That Which Was Taken, Uber Cortex, …). The icon
 * asset path discriminates the specific unique, so we prefer it and fall
 * back to baseType only when the icon URL can't be decoded.
 */
export function itemKey(item: Item, iconAsset?: string | null): string {
    if (!item.identified) {
        return `unid:${iconAsset ?? item.baseType}`;
    }
    const parts = [item.name];
    if (item.corrupted) parts.push("corrupted");
    if (item.foilVariation !== undefined) parts.push(`foil:${item.foilVariation}`);
    return parts.join("|");
}
