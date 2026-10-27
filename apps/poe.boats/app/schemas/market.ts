import { z } from "zod";
import { MARKET_CATEGORIES, type MarketCategory } from "~/lib/market-categories";

export const marketCategorySchema = z.enum(
    Object.keys(MARKET_CATEGORIES) as [MarketCategory, ...MarketCategory[]],
);
export const MARKET_ORDERS = {
    sales: "Most likely sales",
    "sales-asc": "Fewest likely sales",
    "name-asc": "Name: A–Z",
    "name-desc": "Name: Z–A",
    newest: "Recently observed",
    oldest: "Least recently observed",
    "price-asc": "Price: low to high",
    "price-desc": "Price: high to low",
    "listings-desc": "Most listings",
    "listings-asc": "Fewest listings",
    "sellers-desc": "Most sellers",
    "sellers-asc": "Fewest sellers",
} as const;
export type MarketOrder = keyof typeof MARKET_ORDERS;

/** The `order` each sortable market table column applies in each direction. */
export const MARKET_SORT_COLUMNS = {
    item: { asc: "name-asc", desc: "name-desc" },
    price: { asc: "price-asc", desc: "price-desc" },
    listings: { asc: "listings-asc", desc: "listings-desc" },
    sellers: { asc: "sellers-asc", desc: "sellers-desc" },
    sales: { asc: "sales-asc", desc: "sales" },
    observed: { asc: "oldest", desc: "newest" },
} as const satisfies Record<string, Record<"asc" | "desc", MarketOrder>>;
export type MarketSortColumn = keyof typeof MARKET_SORT_COLUMNS;

/** The URL params holding each range-filtered market table column's bounds. */
export const MARKET_RANGE_COLUMNS = {
    price: ["priceMin", "priceMax"],
    listings: ["listingsMin", "listingsMax"],
    sellers: ["sellersMin", "sellersMax"],
    sales: ["salesMin", "salesMax"],
} as const;
export type MarketRangeColumn = keyof typeof MARKET_RANGE_COLUMNS;
type MarketRangeParam = (typeof MARKET_RANGE_COLUMNS)[MarketRangeColumn][number];
export const MARKET_RANGE_PARAMS = Object.values(MARKET_RANGE_COLUMNS).flat() as MarketRangeParam[];

const rangeBound = z.coerce.number().nonnegative().max(1e12).optional();

export const marketFiltersSchema = z.object({
    realm: z.enum(["pc", "poe2", "xbox", "sony"]).default("pc"),
    league: z.string().max(100).default(""),
    q: z.string().max(100).default(""),
    days: z.enum(["7", "30", "90"]).default("7"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    category: marketCategorySchema.or(z.literal("all")).default("all"),
    order: z.enum(Object.keys(MARKET_ORDERS) as [MarketOrder, ...MarketOrder[]]).default("sales"),
    rarity: z.enum(["all", "normal", "magic", "rare", "unique"]).default("all"),
    identification: z.enum(["all", "true", "false"]).default("all"),
    corruption: z.enum(["all", "true", "false"]).default("all"),
    item: z.string().max(255).optional(),
    identified: z.enum(["true", "false"]).default("true"),
    corrupted: z.enum(["true", "false"]).default("false"),
    foil: z.coerce.number().int().min(-1).default(-1),
    kind: z.string().max(32).default(""),
    value: z.string().max(255).default(""),
    currency: z.string().max(40).default("divine"),
    ...(Object.fromEntries(MARKET_RANGE_PARAMS.map((param) => [param, rangeBound])) as Record<
        MarketRangeParam,
        typeof rangeBound
    >),
});

export type MarketFilters = z.infer<typeof marketFiltersSchema>;

/**
 * One hour's asking prices across every listing currency, converted through chaos into the
 * display currency. Quantiles come from the per-currency summaries, so they are estimates when
 * more than one currency contributes. `unconverted` counts listings without an exchange rate.
 */
export const mergedMarketPriceSchema = z.object({
    count: z.number().int().positive(),
    unconverted: z.number().int().nonnegative(),
    mean: z.number().positive().nullable(),
    min: z.number().positive(),
    p10: z.number().positive(),
    p25: z.number().positive(),
    median: z.number().positive(),
    p75: z.number().positive(),
    p90: z.number().positive(),
    max: z.number().positive(),
});
export type MergedMarketPrice = z.infer<typeof mergedMarketPriceSchema>;

export function marketLink(
    filters: MarketFilters,
    item?: {
        itemKey: string;
        identified: boolean;
        corrupted: boolean;
        foilVariation: number;
        signatureKind: string;
        signatureValue: string;
    },
) {
    const params = new URLSearchParams({
        realm: filters.realm,
        league: filters.league,
        days: filters.days,
        q: filters.q,
        currency: filters.currency,
        page: String(filters.page),
        order: filters.order,
        rarity: filters.rarity,
        identification: filters.identification,
        corruption: filters.corruption,
    });
    for (const param of MARKET_RANGE_PARAMS) {
        const bound = filters[param];
        if (bound !== undefined) params.set(param, String(bound));
    }
    if (item) {
        // The item path has no category segment, so the query keeps it for links back to the list.
        params.set("category", filters.category);
        params.set("identified", String(item.identified));
        params.set("corrupted", String(item.corrupted));
        params.set("foil", String(item.foilVariation));
        params.set("kind", item.signatureKind);
        params.set("value", item.signatureValue);
        return `/1/market/items/${encodeURIComponent(item.itemKey)}?${params}`;
    }
    return `/1/market${filters.category === "all" ? "" : `/${filters.category}`}?${params}`;
}

/** Path parameters take precedence over the same-named search parameters. */
export function parseMarketFilters(
    request: Request,
    params: { item?: string; category?: string } = {},
) {
    const parsed = marketFiltersSchema.safeParse({
        ...Object.fromEntries(new URL(request.url).searchParams),
        ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)),
    });
    if (!parsed.success) throw new Response("Invalid market filters", { status: 400 });
    return parsed.data;
}
