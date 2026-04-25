import type { Item } from "@poe-tools/api-client";
import type { ModSignature } from "#src/shared/mod-extractors/types.ts";

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
  switch (sig.kind) {
    case "forbidden-jewel":
      return { kind: sig.kind, value: sig.allocatedNotable };
    case "impossible-escape":
      return { kind: sig.kind, value: sig.keystone };
    case "forbidden-shako":
      return { kind: sig.kind, value: `${sig.skill}@${sig.level}` };
    case "watchers-eye": {
      // Sort so {Anger:X, Hatred:Y} and {Hatred:Y, Anger:X} fold together.
      const value = [...sig.mods]
        .map((m) => `${m.aura}=${m.stat}`)
        .sort()
        .join(";");
      return { kind: sig.kind, value };
    }
  }
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
  if (item.frameType === 3 && item.name) {
    return item.name;
  }
  return item.baseType;
}
