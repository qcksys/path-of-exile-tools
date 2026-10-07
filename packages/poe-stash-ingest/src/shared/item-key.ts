import type { Item } from "@poe-tools/api-client";
import { isUniqueItem } from "#src/shared/capture.ts";
import { type ModSignature, signatureValue } from "#src/shared/mod-extractors/index.ts";

export interface SignatureBreakout {
    /** Stable category, same string as `ModSignature["kind"]`. */
    kind: ModSignature["kind"];
    /**
     * Canonical, deterministic stringification of the variant — used as a
     * PK component on the remote summary table, and as the bucket key in
     * SQL GROUP BY. Variants that trade as separate markets MUST produce
     * distinct values here.
     */
    value: string;
}

/**
 * Project a `ModSignature` onto its (kind, value) pair for relational
 * indexing. The full structured payload stays in `mod_signature` JSON.
 */
export function signatureBreakout(sig: ModSignature): SignatureBreakout {
    return { kind: sig.kind, value: signatureValue(sig) };
}

/**
 * Canonical *identity* key for a listing — the unique's market name (or
 * baseType for non-uniques). Variant axes (corruption, foil, structured
 * mod signature) are tracked as separate columns on the row, not stuffed
 * into this string.
 *
 *   - Identified unique → `${name}`
 *   - Unidentified      → `unid:${iconAsset}`, falling back to
 *                         `unid:${baseType}` when the icon URL can't
 *                         be decoded
 *   - Currency / non-unique identified → `${baseType}`
 */
export function itemKey(item: Item, iconAsset?: string | null): string {
    if (!item.identified) {
        return `unid:${iconAsset ?? item.baseType}`;
    }
    if (isUniqueItem(item) && item.name) {
        return item.name;
    }
    return item.baseType;
}
