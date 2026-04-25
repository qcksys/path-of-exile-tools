import type { Item } from "@poe-tools/api-client";

/**
 * Discriminated payload extracted from an item's mods. Stored on
 * `ps_listing.mod_signature` as JSON, and rolled up as a histogram per
 * `(league, hour, item_key, kind, value)` tuple.
 *
 * The `kind` is the structural category (one extractor per kind). The
 * concrete fields under each kind capture the *value* that distinguishes
 * one rolled-up bucket from another — e.g. for forbidden jewels the
 * allocated notable name, for Watcher's Eye the aura+stat pair.
 */
export type ModSignature =
  | { kind: "forbidden-jewel"; allocatedNotable: string }
  | { kind: "watchers-eye"; mods: Array<{ aura: string; stat: string }> }
  | { kind: "impossible-escape"; keystone: string }
  | { kind: "forbidden-shako"; skill: string; level: number };

export interface ModExtractor {
  /** Stable identifier — same string as `ModSignature["kind"]`. */
  readonly kind: ModSignature["kind"];
  /** Cheap pre-filter: does this extractor want to look at the item at all? */
  matches(item: Item): boolean;
  /** Returns a populated signature, or null if extraction failed. */
  extract(item: Item): ModSignature | null;
}
