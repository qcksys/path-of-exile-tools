import { z } from "zod";

export const marketFiltersSchema = z.object({
    realm: z.enum(["pc", "poe2", "xbox", "sony"]).default("pc"),
    league: z.string().max(100).default(""),
    q: z.string().max(100).default(""),
    days: z.enum(["7", "30", "90"]).default("7"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
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
    });
    if (item) {
        params.set("item", item.itemKey);
        params.set("identified", String(item.identified));
        params.set("corrupted", String(item.corrupted));
        params.set("foil", String(item.foilVariation));
        params.set("kind", item.signatureKind);
        params.set("value", item.signatureValue);
    } else params.set("page", String(filters.page));
    return `/1/market?${params}`;
}
