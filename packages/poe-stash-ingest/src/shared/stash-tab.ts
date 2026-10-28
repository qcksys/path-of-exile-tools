import type { PublicStashChange } from "@poe-tools/api-client";

/**
 * Faustus's merchant tabs arrive as `TradeStash`, every item with a `~b/o` price, and can be
 * bought without contacting the seller; every other public tab is `other`.
 */
export type ListingTab = "merchant" | "other";

export function listingTab(change: Pick<PublicStashChange, "stashType">): ListingTab {
    return change.stashType === "TradeStash" ? "merchant" : "other";
}
