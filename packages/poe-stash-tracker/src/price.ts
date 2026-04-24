import type { Item } from "@poe-tools/api-client";

const PRICE_RE = /~(?:price|b\/o)\s+(\d+(?:\.\d+)?)\s+([a-z][\w-]*)/i;

export interface ParsedPrice {
    amount: number;
    currency: string;
}

export function parsePriceText(text: string | undefined | null): ParsedPrice | null {
    if (!text) return null;
    const m = text.match(PRICE_RE);
    if (!m) return null;
    return { amount: Number(m[1]), currency: m[2]!.toLowerCase() };
}

export function extractListingPrice(item: Item, stashName: string | undefined): ParsedPrice | null {
    return (
        parsePriceText(item.note) ?? parsePriceText(item.forum_note) ?? parsePriceText(stashName)
    );
}
