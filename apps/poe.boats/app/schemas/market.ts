import { z } from "zod";
import {
    MARKET_BASE_ATTRIBUTE_SETS,
    MARKET_BASE_CLASS_NAMES,
    MARKET_BASE_LEVELS,
    type MarketBaseAttributeSet,
} from "~/lib/market-bases";
import {
    isMarketUniqueCategory,
    MARKET_CATEGORIES,
    type MarketCategory,
    type MarketExchangeCategory,
    POE2_EXCHANGE_CATEGORIES,
    type Poe2ExchangeCategory,
} from "~/lib/market-categories";

export const marketCategorySchema = z.enum(
    Object.keys(MARKET_CATEGORIES) as [MarketCategory, ...MarketCategory[]],
);
/** The web list has no all-items page; `category: "all"` (API and MCP only) links here. */
export const MARKET_DEFAULT_CATEGORY = "currency" satisfies MarketCategory;
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
    identification: z.enum(["all", "true", "false"]).default("all"),
    /** Omitted, unique equipment categories search uncorrupted markets and others any corruption. */
    corruption: z.enum(["all", "true", "false"]).optional(),
    item: z.string().max(255).optional(),
    identified: z.enum(["true", "false"]).default("true"),
    corrupted: z.enum(["true", "false"]).default("false"),
    kind: z.string().max(32).default(""),
    value: z.string().max(255).default(""),
    /** An item page's linked-socket market (0 for under 5 links); omitted, every link count merges. */
    links: z.enum(["0", "5", "6"]).optional(),
    /** Watcher's Eye mods every valued item must have, separated by `|`. */
    mods: z.string().max(1000).default(""),
    /** Watcher's Eye mods of which valued items need at least one, separated by `|`. */
    anyMods: z.string().max(1000).default(""),
    currency: z.string().max(40).default("divine"),
    /** Crafting base filters; empty matches every base. */
    baseClass: z.enum(["", ...MARKET_BASE_CLASS_NAMES]).default(""),
    attributes: z
        .enum(["", ...(Object.keys(MARKET_BASE_ATTRIBUTE_SETS) as MarketBaseAttributeSet[])])
        .default("")
        .describe("The attributes a crafting base requires, e.g. `str-int`"),
    ilvl: z
        // Cluster Jewel bands start at 1, 50, 68, 75 and 84; equipment bands from 74.
        .enum(["", "1", "50", "68", ...MARKET_BASE_LEVELS])
        .default("")
        .describe("Crafting bases whose item level band includes this level"),
    baseLinks: z.enum(["", "1-5", "6"]).default(""),
    quality: z
        .enum(["", "25", "30"])
        .default("")
        .describe("Crafting base cohorts split at this minimum quality"),
    ...(Object.fromEntries(MARKET_RANGE_PARAMS.map((param) => [param, rangeBound])) as Record<
        MarketRangeParam,
        typeof rangeBound
    >),
});

export type MarketFilters = z.infer<typeof marketFiltersSchema>;

/** The crafting base category filters, which category navigation clears. */
export const MARKET_BASE_FILTERS = [
    "baseClass",
    "attributes",
    "ilvl",
    "baseLinks",
    "quality",
] as const satisfies (keyof MarketFilters)[];

/** The corruption a search filters by: its own choice, or its category's default. */
export function marketCorruption({
    category,
    corruption,
}: Pick<MarketFilters, "category" | "corruption">) {
    return corruption ?? (isMarketUniqueCategory(category) ? "false" : "all");
}

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

export const poe2ExchangeCategorySchema = z.enum(
    Object.keys(POE2_EXCHANGE_CATEGORIES) as [Poe2ExchangeCategory, ...Poe2ExchangeCategory[]],
);
export const marketExchangeCategorySchema = z.enum([
    ...new Set<MarketExchangeCategory>([
        ...marketCategorySchema.options,
        ...poe2ExchangeCategorySchema.options,
    ]),
] as [MarketExchangeCategory, ...MarketExchangeCategory[]]);

export const marketExchangeUnitSchema = z
    .enum(["chaos", "exalted"])
    .describe("The currency exchange prices are in: chaos for PoE 1 realms, exalted for poe2");

export const marketExchangeRowSchema = z.object({
    itemId: z.string(),
    name: z.string(),
    category: marketExchangeCategorySchema,
    price: z
        .number()
        .nullable()
        .describe(
            "Units of the exchange unit per unit from the latest completed hour's trades, or else from the newest of the last 7 UTC days that traded (`current` false); null without a path through chaos, divine, exalted or another traded item",
        ),
    via: z
        .object({ itemId: z.string(), name: z.string() })
        .nullable()
        .describe(
            "The item the price was converted through; the exchange unit itself for a direct pair",
        ),
    hour: z
        .number()
        .nullable()
        .describe(
            "The newest hour the price reflects, or without a price the newest hour the item traded in those days",
        ),
    current: z.boolean().describe("The price comes from the latest completed hour"),
    volume: z
        .number()
        .nullable()
        .describe(
            "Value traded per hour, in the exchange unit, over the last 7 UTC days, at the row's price",
        ),
    history: z
        .array(z.number().nullable())
        .describe("Price on each of the last 7 UTC days, oldest first"),
    change: z
        .number()
        .nullable()
        .describe("Change from the first to the last priced day of `history`, as a fraction"),
    pair: z
        .object({ quoteId: z.string(), name: z.string(), rate: z.number() })
        .nullable()
        .describe(
            "The pair with the most units of this item traded in those days, with units of the other item per unit at its newest rate",
        ),
});

export const marketExchangeItemInputSchema = marketFiltersSchema
    .pick({ realm: true, league: true, days: true })
    .extend({ itemId: z.string().startsWith("Metadata/Items/").max(255) });
export type MarketExchangeItemInput = z.infer<typeof marketExchangeItemInputSchema>;

export const marketBaseInputSchema = marketFiltersSchema
    .pick({ realm: true, league: true, days: true, currency: true })
    .extend({ baseId: z.string().startsWith("base:").max(128) });
export type MarketBaseInput = z.infer<typeof marketBaseInputSchema>;

/** A crafting base cohort's page, keeping the list's filters for the way back. */
export function marketBaseLink(filters: MarketFilters, baseId: string) {
    const [path, query] = marketLink(filters).split("?");
    const params = new URLSearchParams(query);
    params.set("category", path!.split("/").at(-1)!);
    return `/1/market/bases/${encodeURIComponent(baseId)}?${params}`;
}

const EXCHANGE_ID_PREFIX = "Metadata/Items/";

/** The path of an exchange item's page in a game's market. */
function exchangeItemPath(game: 1 | 2, itemId: string) {
    const item = itemId.slice(EXCHANGE_ID_PREFIX.length).split("/").map(encodeURIComponent);
    return `/${game}/market/exchange/${item.join("/")}`;
}

/** An exchange item's page, keeping the list's filters for the way back. */
export function marketExchangeLink(filters: MarketFilters, itemId: string) {
    const [path, query] = marketLink(filters).split("?");
    const params = new URLSearchParams(query);
    params.set("category", path!.split("/").at(-1)!);
    return `${exchangeItemPath(1, itemId)}?${params}`;
}

/** The exchange item ID of an exchange page's path after `/<game>/market/exchange/`. */
export function marketExchangeItemId(path: string) {
    return `${EXCHANGE_ID_PREFIX}${path}`;
}

/** The PoE 2 market lists only the currency exchange; there is no PoE 2 stash data. */
export const POE2_MARKET_DEFAULT_CATEGORY = "currency" satisfies Poe2ExchangeCategory;

export const poe2MarketFiltersSchema = marketFiltersSchema
    .pick({ league: true, q: true, days: true })
    .extend({ category: poe2ExchangeCategorySchema.or(z.literal("all")).default("all") });
export type Poe2MarketFilters = z.infer<typeof poe2MarketFiltersSchema>;

function poe2MarketParams(filters: Poe2MarketFilters) {
    return new URLSearchParams({ league: filters.league, days: filters.days, q: filters.q });
}

export function poe2MarketLink(filters: Poe2MarketFilters) {
    const category = filters.category === "all" ? POE2_MARKET_DEFAULT_CATEGORY : filters.category;
    return `/2/market/${category}?${poe2MarketParams(filters)}`;
}

/**
 * The PoE 2 market page for a `/1/market` URL with realm `poe2`, keeping its season and period
 * and searching for its item.
 */
export function poe2MarketRedirect(filters: MarketFilters) {
    const category = poe2ExchangeCategorySchema.safeParse(filters.category);
    return poe2MarketLink({
        league: filters.league,
        days: filters.days,
        q: (filters.item ?? filters.q).slice(0, 100),
        category: category.success ? category.data : "all",
    });
}

/** A PoE 2 exchange item's page, keeping the list's filters for the way back. */
export function poe2MarketExchangeLink(filters: Poe2MarketFilters, itemId: string) {
    const params = poe2MarketParams(filters);
    params.set("category", filters.category);
    return `${exchangeItemPath(2, itemId)}?${params}`;
}

/** Path parameters take precedence over the same-named search parameters. */
export function parsePoe2MarketFilters(request: Request, params: { category?: string } = {}) {
    const parsed = poe2MarketFiltersSchema.safeParse({
        ...Object.fromEntries(new URL(request.url).searchParams),
        ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)),
    });
    if (!parsed.success) throw new Response("Invalid market filters", { status: 400 });
    return parsed.data;
}

export function marketLink(
    filters: MarketFilters,
    item?: {
        itemKey: string;
        identified: boolean;
        corrupted: boolean;
        signatureKind: string;
        signatureValue: string;
        /** Null or omitted for the market merging every link count. */
        links?: number | null;
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
        identification: filters.identification,
        ...(filters.corruption ? { corruption: filters.corruption } : {}),
    });
    for (const param of MARKET_RANGE_PARAMS) {
        const bound = filters[param];
        if (bound !== undefined) params.set(param, String(bound));
    }
    for (const param of MARKET_BASE_FILTERS) if (filters[param]) params.set(param, filters[param]);
    if (item) {
        // The item path has no category segment, so the query keeps it for links back to the list.
        params.set("category", filters.category);
        params.set("identified", String(item.identified));
        params.set("corrupted", String(item.corrupted));
        params.set("kind", item.signatureKind);
        params.set("value", item.signatureValue);
        if (item.links != null) params.set("links", String(item.links));
        if (filters.mods) params.set("mods", filters.mods);
        if (filters.anyMods) params.set("anyMods", filters.anyMods);
        return `/1/market/items/${encodeURIComponent(item.itemKey)}?${params}`;
    }
    return `/1/market/${filters.category === "all" ? MARKET_DEFAULT_CATEGORY : filters.category}?${params}`;
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
