// biome-ignore-all lint/style/useNamingConvention: Expectations use the official trade API field names.
import { expect, it } from "vite-plus/test";
import {
    collectorFilters,
    collectorMarkets,
    listCollectorItems,
} from "~/lib/collector-items.server";

const gallery = (input = {}) => listCollectorItems(collectorFilters.parse(input)).items;

it("includes every item and distinct artwork from both wiki lists", () => {
    const items = gallery();
    expect(new Set(items.map((item) => item.name)).size).toBe(136);
    const pictures = items.flatMap((item) => item.artworks.map((art) => art.icon));
    expect(new Set(pictures).size).toBe(156);
    expect(pictures).toHaveLength(156);
    const artworks = items.flatMap((item) => item.artworks);
    expect(new Set(artworks.map((art) => art.asset)).size).toBe(156);
    expect(artworks.filter((art) => art.historicalAsk)).toHaveLength(135);
    expect(items.flatMap((item) => item.artworks.flatMap((art) => art.labels))).toHaveLength(165);
    expect(gallery({ collection: "base" })).toHaveLength(14);
    expect(gallery({ collection: "demigod" })).toHaveLength(10);
    const alternates = gallery({ collection: "alternate" });
    expect(alternates).toHaveLength(134);
    expect(alternates.every((item) => item.originalListings === null)).toBe(true);
});

it("takes per-currency minimum asks from the latest priced hour and sums classified sales across hours", () => {
    const markets = collectorMarkets([
        { asset: "original", hour: 2, prices: { mirror: { min: 5 } }, likelySales: 0 },
        { asset: "alternate", hour: 1, prices: null, likelySales: 3 },
        { asset: "original", hour: 4, prices: null, likelySales: 2 },
        {
            asset: "original",
            hour: 3,
            prices: { divine: { min: 82 }, mirror: { min: 1.5 } },
            likelySales: 1,
        },
        { asset: "original", hour: 3, prices: { divine: { min: 80 } }, likelySales: 0 },
        { asset: "original", hour: 1, prices: { chaos: { min: 25 } }, likelySales: 1 },
        { asset: "listed", hour: 5, prices: { mirror: { min: 1 } }, likelySales: 0 },
    ]);
    expect(markets.get("original")).toEqual({
        ask: {
            hour: 3,
            prices: [
                { currency: "divine", amount: 80 },
                { currency: "mirror", amount: 1.5 },
            ],
        },
        likelySales30d: 4,
    });
    expect(markets.get("alternate")).toEqual({ ask: null, likelySales30d: 3 });
    expect(markets.get("listed")?.likelySales30d).toBe(0);
    expect(markets.has("unobserved")).toBe(false);
});

it("keeps every Beacon artwork together and filters by item, base and season", () => {
    const [beacon] = gallery({ q: " golden FLAME ", collection: "demigod" });
    expect(beacon.name).toBe("Demigod's Beacon");
    expect(beacon.artworks.map((art) => art.labels)).toEqual([
        ["Original"],
        ["Emberwake", "Bloodgrip", "Soulthirst"],
    ]);
    const [season] = gallery({ q: "Emberwake", collection: "demigod" });
    expect(season.artworks).toEqual([beacon.artworks[1]]);
    expect(season.originalListings).toBeNull();
    expect(gallery({ q: "Demigod's Presence", collection: "alternate" })).toEqual([]);
    expect(gallery({ q: "missing item" })).toEqual([]);
});

it("links each artwork type to Standard asking prices across origins", () => {
    const [bounty] = gallery({ q: "Demigod's Bounty" });
    const [base] = gallery({ q: "Two-Stone Ring", collection: "base" });
    for (const [href, alternate, item, rarity] of [
        [bounty.originalListings, "false", { name: "Demigod's Bounty" }, "unique"],
        [bounty.alternateListings, "true", { name: "Demigod's Bounty" }, "unique"],
        [base.alternateListings, "true", { type: "Two-Stone Ring" }, "nonunique"],
    ] as const) {
        const url = new URL(href!);
        expect(url.origin + url.pathname).toBe("https://www.pathofexile.com/trade/search/Standard");
        expect(JSON.parse(url.searchParams.get("q")!)).toEqual({
            query: {
                ...item,
                status: { option: "any" },
                filters: {
                    type_filters: { filters: { rarity: { option: rarity } } },
                    misc_filters: { filters: { alternate_art: { option: alternate } } },
                },
            },
            sort: { price: "asc" },
        });
    }
    expect(base.originalListings).toBeNull();
});
