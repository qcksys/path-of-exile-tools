import { z } from "zod";
import catalog from "~/data/collector-items.json";

export const collectorFilters = z.object({
    q: z.string().trim().max(100).default(""),
    collection: z.enum(["all", "alternate", "demigod", "base"]).default("all"),
});

const collectorItem = z.object({
    name: z.string(),
    baseType: z.string(),
    group: z.enum(["base", "unique", "demigod"]),
    artworks: z.array(z.object({ labels: z.array(z.string()).min(1), icon: z.url() })),
});

export const collectorResult = z.object({
    provenanceNote: z.string(),
    items: z.array(
        collectorItem.extend({
            wikiUrl: z.url(),
            alternateListings: z.url().nullable(),
            originalListings: z.url().nullable(),
        }),
    ),
});

const items = collectorItem.array().parse(catalog);
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
