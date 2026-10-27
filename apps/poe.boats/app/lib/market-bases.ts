import { z } from "zod";
import type { MarketFilters, MarketOrder } from "../schemas/market";
import { MARKET_BASE_CATEGORIES, type MarketCategory } from "./market-categories";
import { marketListingPrices } from "./market-listing-prices";

/** Crafting base cohorts from this item level up are listed on the market. */
export const MARKET_BASE_MIN_LEVEL = 74;

export const marketBaseSchema = z.strictObject({
    id: z.string().min(1).max(128),
    baseType: z.string().min(1).max(255),
    category: z.enum(
        Object.values(MARKET_BASE_CATEGORIES) as [MarketCategory, ...MarketCategory[]],
    ),
    ilvl: z.strictObject({ min: z.number().int(), max: z.number().int() }),
    links: z.enum(["1-5", "6"]).nullable().describe("Linked sockets; null means any"),
    quality: z.number().int().nullable().describe("Minimum quality; null means any"),
});
export type MarketBase = z.infer<typeof marketBaseSchema>;

export const marketBasesSchema = z.strictObject({
    revision: z.string().min(1).max(100),
    bases: z.array(marketBaseSchema),
});

export const marketBaseRowSchema = marketBaseSchema.extend({
    hour: z.number(),
    listingCount: z.number(),
    uniqueSellers: z.number(),
    unknownCount: z
        .number()
        .describe("Listings on the base that could not be told apart from this cohort"),
    prices: z.record(
        z.string(),
        z.object({ count: z.number(), min: z.number(), median: z.number(), max: z.number() }),
    ),
});
export type MarketBaseRow = z.infer<typeof marketBaseRowSchema>;

function variantName(base: MarketBaseRow) {
    return `${base.baseType} ${marketBaseVariant(base)}`;
}

/** The cheapest non-outlier asking price in chaos, as the price column shows it first. */
function chaosPrice(base: MarketBaseRow, chaosRates: Record<string, number>) {
    return marketListingPrices(base.prices, chaosRates).find((price) => !price.outlier)?.chaos;
}

/**
 * One page of base rows with the market list's search, column ranges and order. Cohorts have no
 * likely-sale estimates, so the sales orders fall back to listings and sales ranges match none.
 * Prices compare in chaos and their ranges are in the display currency.
 */
export function rankMarketBases(
    rows: MarketBaseRow[],
    filters: MarketFilters,
    chaosRates: Record<string, number>,
    pageSize: number,
) {
    // Base cohorts only hold uncorrupted items.
    if (filters.corruption === "true") return { rows: [], hasMore: false };
    const query = filters.q.toLowerCase();
    const display = filters.currency === "chaos" ? 1 : chaosRates[filters.currency];
    const within = (value: number | undefined, min?: number, max?: number) =>
        (min === undefined && max === undefined) ||
        (value !== undefined && value >= (min ?? -Infinity) && value <= (max ?? Infinity));
    const priced = rows.map((row) => ({ row, chaos: chaosPrice(row, chaosRates) }));
    const matching = priced.filter(
        ({ row, chaos }) =>
            variantName(row).toLowerCase().includes(query) &&
            within(
                chaos !== undefined && display ? chaos / display : undefined,
                filters.priceMin,
                filters.priceMax,
            ) &&
            within(row.listingCount, filters.listingsMin, filters.listingsMax) &&
            within(row.uniqueSellers, filters.sellersMin, filters.sellersMax) &&
            within(0, filters.salesMin, filters.salesMax),
    );
    const byName = (a: (typeof priced)[number], b: (typeof priced)[number]) =>
        a.row.baseType.localeCompare(b.row.baseType) ||
        a.row.ilvl.min - b.row.ilvl.min ||
        (a.row.links ?? "").localeCompare(b.row.links ?? "") ||
        (a.row.quality ?? 0) - (b.row.quality ?? 0);
    const priceOrder = (a: number | undefined, b: number | undefined) =>
        a === undefined ? (b === undefined ? 0 : 1) : b === undefined ? -1 : a - b;
    const orders: Record<
        MarketOrder,
        (a: (typeof priced)[number], b: (typeof priced)[number]) => number
    > = {
        sales: (a, b) => b.row.listingCount - a.row.listingCount,
        "sales-asc": (a, b) => a.row.listingCount - b.row.listingCount,
        "listings-desc": (a, b) => b.row.listingCount - a.row.listingCount,
        "listings-asc": (a, b) => a.row.listingCount - b.row.listingCount,
        "sellers-desc": (a, b) => b.row.uniqueSellers - a.row.uniqueSellers,
        "sellers-asc": (a, b) => a.row.uniqueSellers - b.row.uniqueSellers,
        "price-asc": (a, b) => priceOrder(a.chaos, b.chaos),
        "price-desc": (a, b) =>
            a.chaos === undefined || b.chaos === undefined
                ? priceOrder(a.chaos, b.chaos)
                : b.chaos - a.chaos,
        newest: (a, b) => b.row.hour - a.row.hour,
        oldest: (a, b) => a.row.hour - b.row.hour,
        "name-asc": byName,
        "name-desc": (a, b) => byName(b, a),
    };
    const sorted = matching.sort((a, b) => orders[filters.order](a, b) || byName(a, b));
    const start = (filters.page - 1) * pageSize;
    return {
        rows: sorted.slice(start, start + pageSize).map(({ row }) => row),
        hasMore: sorted.length > start + pageSize,
    };
}

export function marketBaseVariant(base: Pick<MarketBase, "ilvl" | "links" | "quality">) {
    return [
        `ilvl ${base.ilvl.min}–${base.ilvl.max}`,
        ...(base.links ? [`${base.links === "6" ? "6" : "1–5"} links`] : []),
        ...(base.quality ? [`${base.quality}%+ quality`] : []),
    ].join(" · ");
}
