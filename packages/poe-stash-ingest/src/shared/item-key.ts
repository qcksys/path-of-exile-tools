import type { Item } from "@poe-tools/api-client";
import { gemMarketKey } from "@poe-tools/market";
import {
    HEIST_BLUEPRINT_KEY,
    isGemItem,
    isHeistBlueprint,
    isMapItem,
    isUniqueItem,
} from "#src/shared/capture.ts";
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
 * A unique's linked-socket market, as poe.ninja splits them: 5 or 6 for its largest linked group,
 * otherwise 0. Non-unique items are always 0.
 */
export function itemLinks(item: Item): number {
    if (!isUniqueItem(item)) return 0;
    const groups = new Map<number, number>();
    for (const socket of item.sockets ?? [])
        groups.set(socket.group, (groups.get(socket.group) ?? 0) + 1);
    const largest = Math.max(0, ...groups.values());
    return largest >= 5 ? largest : 0;
}

/**
 * Canonical *identity* key for a listing — the unique's market name (or
 * baseType for non-uniques). Variant axes (corruption, foil, links, structured
 * mod signature) are tracked as separate columns on the row, not stuffed
 * into this string.
 *
 *   - Identified unique → `${name}`
 *   - Unidentified      → `unid:${iconAsset}`, falling back to
 *                         `unid:${baseType}` when the icon URL can't
 *                         be decoded
 *   - Gem               → `${typeLine}`, which names a transfigured gem
 *                         (e.g. Kinetic Bolt of Fragmentation) apart from its base gem;
 *                         `Vaal Arc (Arc of Surging)` for a transfigured Vaal gem
 *   - Map               → `${baseType}` (`Map (Tier 16)`), identified or not;
 *                         identification is part of its mod signature
 *   - Heist blueprint   → `Blueprint`, whatever its location
 *   - Currency / non-unique identified → `${baseType}`
 */
export function itemKey(item: Item, iconAsset?: string | null): string {
    if (isMapItem(item)) return item.baseType;
    if (!item.identified) {
        return `unid:${iconAsset ?? item.baseType}`;
    }
    if (isUniqueItem(item) && item.name) {
        return item.name;
    }
    if (isGemItem(item))
        return gemMarketKey({ typeLine: item.typeLine, hybridName: item.hybrid?.baseTypeName });
    if (isHeistBlueprint(item)) return HEIST_BLUEPRINT_KEY;
    return item.baseType;
}
