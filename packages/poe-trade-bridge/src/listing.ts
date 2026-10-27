import { z } from "zod";

export const tradeSaleSchema = z.enum(["instant", "in-person"]);
export type TradeSale = z.infer<typeof tradeSaleSchema>;

export const tradeListingSchema = z.strictObject({
    id: z.string().min(1).max(128),
    indexed: z.iso.datetime({ offset: true }).nullable(),
    price: z.strictObject({
        amount: z.number().positive().finite(),
        currency: z.string().min(1).max(64),
    }),
    sale: tradeSaleSchema,
    item: z.record(z.string(), z.unknown()),
});
export type TradeListing = z.infer<typeof tradeListingSchema>;

/**
 * Item fields kept from a trade listing. Everything else, including the listing's seller account,
 * character, stash and whisper text, is dropped before a listing leaves the trade page.
 */
const ITEM_FIELDS = [
    "name",
    "typeLine",
    "baseType",
    "rarity",
    "frameType",
    "ilvl",
    "itemLevel",
    "identified",
    "corrupted",
    "duplicated",
    "fractured",
    "split",
    "synthesised",
    "sanctified",
    "influences",
    "sockets",
    "properties",
    "implicitMods",
    "explicitMods",
    "craftedMods",
    "fracturedMods",
    "enchantMods",
    "extended",
] as const;
const EXTENDED_FIELDS = ["mods", "hashes", "prefixes", "suffixes"] as const;

const fetchEntrySchema = z.object({
    id: z.string().min(1).max(128),
    listing: z.object({
        indexed: z.string().optional(),
        price: z.object({ amount: z.number(), currency: z.string().min(1).max(64) }).nullish(),
    }),
    item: z.record(z.string(), z.unknown()),
});

function pick(source: Record<string, unknown>, fields: readonly string[]) {
    return Object.fromEntries(
        fields.flatMap((field) => (field in source ? [[field, source[field]]] : [])),
    );
}

/**
 * Keep the price, listing time and item of one trade fetch result. Returns null for vanished or
 * unpriced listings, which cannot price a stage.
 */
export function scrubTradeListing(entry: unknown, sale: TradeSale): TradeListing | null {
    const parsed = fetchEntrySchema.safeParse(entry);
    if (!parsed.success) return null;
    const { id, listing, item } = parsed.data;
    if (!listing.price || !(listing.price.amount > 0) || !Number.isFinite(listing.price.amount))
        return null;
    const indexed = z.iso.datetime({ offset: true }).safeParse(listing.indexed);
    const kept: Record<string, unknown> = pick(item, ITEM_FIELDS);
    if (kept.extended && typeof kept.extended === "object")
        kept.extended = pick(kept.extended as Record<string, unknown>, EXTENDED_FIELDS);
    return {
        id,
        indexed: indexed.success ? indexed.data : null,
        price: { amount: listing.price.amount, currency: listing.price.currency },
        sale,
        item: kept,
    };
}
