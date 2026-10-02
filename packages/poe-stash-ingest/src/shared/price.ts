import type { Item } from "@poe-tools/api-client";

const PRICE_RE = /~(?:price|b\/o)\s+(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s+([a-z][\w-]*)/i;
const CURRENCY_ALIASES: Record<string, string> = {
    div: "divine",
    divine: "divine",
    chaos: "chaos",
    c: "chaos",
    exa: "exalted",
    exalt: "exalted",
    exalted: "exalted",
};

export interface ParsedPrice {
    amount: number;
    currency: string;
}

export function parsePriceText(text: string | undefined | null): ParsedPrice | null {
    if (!text) return null;
    const m = text.match(PRICE_RE);
    if (!m) return null;
    const amount = Number(m[1]) / Number(m[2] ?? 1);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const currency = m[3]!.toLowerCase();
    return { amount, currency: CURRENCY_ALIASES[currency] ?? currency };
}

export function extractListingPrice(item: Item, stashName: string | undefined): ParsedPrice | null {
    if (item.note?.trim()) return parsePriceText(item.note);
    if (item.forum_note?.trim()) return parsePriceText(item.forum_note);
    return parsePriceText(stashName);
}
