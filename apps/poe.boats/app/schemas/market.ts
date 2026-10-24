import { z } from "zod";
import { MARKET_CATEGORIES, type MarketCategory } from "~/lib/market-categories";

export const marketCategorySchema = z.enum(
    Object.keys(MARKET_CATEGORIES) as [MarketCategory, ...MarketCategory[]],
);
export const MARKET_ORDERS = {
    sales: "Most likely sales",
    "name-asc": "Name: A–Z",
    "name-desc": "Name: Z–A",
    newest: "Recently observed",
    "price-asc": "Price: low to high",
    "price-desc": "Price: high to low",
} as const;

export const marketFiltersSchema = z.object({
    realm: z.enum(["pc", "poe2", "xbox", "sony"]).default("pc"),
    league: z.string().max(100).default(""),
    q: z.string().max(100).default(""),
    days: z.enum(["7", "30", "90"]).default("7"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    category: marketCategorySchema.or(z.literal("all")).default("all"),
    order: z
        .enum(["sales", "name-asc", "name-desc", "newest", "price-asc", "price-desc"])
        .default("sales"),
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
});

export type MarketFilters = z.infer<typeof marketFiltersSchema>;

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
        category: filters.category,
        order: filters.order,
        rarity: filters.rarity,
        identification: filters.identification,
        corruption: filters.corruption,
    });
    if (item) {
        params.set("identified", String(item.identified));
        params.set("corrupted", String(item.corrupted));
        params.set("foil", String(item.foilVariation));
        params.set("kind", item.signatureKind);
        params.set("value", item.signatureValue);
    }
    return `/1/market${item ? `/items/${encodeURIComponent(item.itemKey)}` : ""}?${params}`;
}

export function parseMarketFilters(request: Request, item?: string) {
    const parsed = marketFiltersSchema.safeParse({
        ...Object.fromEntries(new URL(request.url).searchParams),
        ...(item === undefined ? {} : { item }),
    });
    if (!parsed.success) throw new Response("Invalid market filters", { status: 400 });
    return parsed.data;
}
