import { marketObservationRange } from "@poe-tools/market";
import { collectorItems } from "@poe-tools/market/collector-items";
import { z } from "zod";
import type { TDatabase } from "~/db/client";
import { findCollectorHours } from "~/db/queries/collector-items.queries";

export const collectorFilters = z.object({
    q: z.string().trim().max(100).default(""),
    collection: z.enum(["all", "alternate", "demigod", "base"]).default("all"),
});

const collectorItem = z.object({
    name: z.string(),
    baseType: z.string(),
    group: z.enum(["base", "unique", "demigod"]),
    artworks: z.array(
        z.object({
            labels: z.array(z.string()).min(1),
            icon: z.url(),
            asset: z.string(),
            historicalAsk: z
                .object({ date: z.iso.date(), mirrors: z.number().positive() })
                .optional(),
        }),
    ),
});

const artworkMarket = z.object({
    ask: z
        .object({
            hour: z.number(),
            prices: z.array(z.object({ currency: z.string(), amount: z.number() })),
        })
        .nullable(),
    likelySales30d: z.number().int().nonnegative(),
});

export const collectorResult = z.object({
    provenanceNote: z.string(),
    latestHour: z.number(),
    marketAvailable: z.boolean(),
    items: z.array(
        collectorItem.extend({
            artworks: z.array(
                collectorItem.shape.artworks.element.extend({ market: artworkMarket.nullable() }),
            ),
            wikiUrl: z.url(),
            alternateListings: z.url().nullable(),
            originalListings: z.url().nullable(),
        }),
    ),
});

const items = collectorItem.array().parse(collectorItems);
const provenanceNote =
    "CIS Race Season Reward, SG Race Season Reward and TH Race Season Reward identify copies from the former Garena realms. Listing searches include all three origins.";

function standardListings(item: z.infer<typeof collectorItem>, alternate: boolean) {
    const isBase = item.group === "base";
    const search = {
        query: {
            status: { option: "any" },
            ...(isBase ? { type: item.baseType } : { name: item.name }),
            filters: {
                // biome-ignore lint/style/useNamingConvention: Official trade API filter names.
                type_filters: { filters: { rarity: { option: isBase ? "nonunique" : "unique" } } },
                // biome-ignore lint/style/useNamingConvention: Official trade API filter names.
                misc_filters: {
                    filters: {
                        // biome-ignore lint/style/useNamingConvention: Official trade API filter names.
                        alternate_art: { option: String(alternate) },
                    },
                },
            },
        },
        sort: { price: "asc" },
    };
    return `https://www.pathofexile.com/trade/search/Standard?q=${encodeURIComponent(JSON.stringify(search))}`;
}

export function listCollectorItems({ q, collection }: z.output<typeof collectorFilters>) {
    const search = q.toLowerCase();
    return {
        provenanceNote,
        items: items.flatMap((item) => {
            if ((collection === "demigod" || collection === "base") && item.group !== collection)
                return [];
            const matchesName = [item.name, item.baseType].some((name) =>
                name.toLowerCase().includes(search),
            );
            const artworks = item.artworks.filter(
                ({ labels }) =>
                    (collection !== "alternate" || !labels.includes("Original")) &&
                    (matchesName || labels.some((label) => label.toLowerCase().includes(search))),
            );
            if (!artworks.length) return [];
            return [
                {
                    ...item,
                    artworks,
                    wikiUrl: `https://www.poewiki.net/wiki/${encodeURIComponent(item.name.replaceAll(" ", "_"))}`,
                    alternateListings: artworks.some((art) => !art.labels.includes("Original"))
                        ? standardListings(item, true)
                        : null,
                    originalListings: artworks.some((art) => art.labels.includes("Original"))
                        ? standardListings(item, false)
                        : null,
                },
            ];
        }),
    };
}

type Hour = {
    asset: string;
    hour: number;
    prices: Record<string, { min: number }> | null;
    likelySales: number;
};

export function collectorMarkets(hours: Hour[]) {
    const markets = new Map<string, z.infer<typeof artworkMarket>>();
    for (const row of hours) {
        const market = markets.get(row.asset) ?? { ask: null, likelySales30d: 0 };
        markets.set(row.asset, market);
        market.likelySales30d += row.likelySales;
        if (market.ask && row.hour < market.ask.hour) continue;
        for (const [currency, { min }] of Object.entries(row.prices ?? {})) {
            if (!Number.isFinite(min) || min <= 0) continue;
            if (market.ask?.hour !== row.hour) market.ask = { hour: row.hour, prices: [] };
            const price = market.ask.prices.find((price) => price.currency === currency);
            if (price) price.amount = Math.min(price.amount, min);
            else market.ask.prices.push({ currency, amount: min });
        }
    }
    for (const market of markets.values())
        market.ask?.prices.sort((a, b) => a.currency.localeCompare(b.currency));
    return markets;
}

export async function loadCollectorGallery(
    db: TDatabase,
    filters: z.output<typeof collectorFilters>,
) {
    const gallery = listCollectorItems(filters);
    const { latestHour } = marketObservationRange();
    const assets = gallery.items.flatMap((item) => item.artworks.map((art) => art.asset));
    let marketAvailable = true;
    let hours: Hour[] = [];
    if (assets.length) {
        try {
            hours = await findCollectorHours(db, assets, latestHour);
        } catch (error) {
            console.warn(
                "Collector market observations unavailable",
                error instanceof Error ? error.name : "query failed",
            );
            marketAvailable = false;
        }
    }
    const markets = collectorMarkets(hours);
    return {
        ...gallery,
        latestHour,
        marketAvailable,
        items: gallery.items.map((item) => ({
            ...item,
            artworks: item.artworks.map((art) => ({
                ...art,
                market: markets.get(art.asset) ?? null,
            })),
        })),
    };
}
