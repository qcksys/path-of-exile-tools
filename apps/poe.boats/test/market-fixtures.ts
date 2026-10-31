import type { getMarketData, getMarketExchangeItem } from "~/db/queries/market.queries";
import type { MarketPriceSummary } from "~/db/schema/stash.unique-hourly";
import { isModPool, modPoolValues } from "~/lib/mod-pools";
import {
    type MarketExchangeItemInput,
    marketCorruption,
    marketFiltersSchema,
} from "~/schemas/market";

export function marketFixture(
    input: Record<string, unknown> = {},
): Awaited<ReturnType<typeof getMarketData>> {
    const parsed = marketFiltersSchema.parse({ league: "Allflame", ...input });
    const filters = { ...parsed, corruption: marketCorruption(parsed) };
    const row = {
        realm: filters.realm,
        league: filters.league,
        hour: 1_792_836_000,
        itemKey: "Abberath's Hooves",
        name: "Abberath's Hooves",
        baseType: "Goathide Boots",
        iconAsset: "2DItems/Armours/Boots/AbberathsHooves",
        identified: true,
        corrupted: false,
        frameType: 3,
        signatureKind: "",
        signatureValue: "",
        signatureData: null,
        listingCount: 5,
        uniqueSellers: 4,
        newCount: 1,
        soldAgeSeconds: 3600,
        likelySales: 2,
        removedCount: 2,
        relistedCount: 0,
        pendingCount: 1,
        prices: {
            divine: { count: 5, min: 1, median: 2, max: 3 },
            chaos: { count: 4, min: 10, median: 15, max: 20 },
        },
        salesPrices: null,
        delistedPrices: null,
        firstSeenAt: "2026-10-24T00:00:00Z",
        lastSeenAt: "2026-10-24T01:00:00Z",
        ...(filters.kind === "base"
            ? {
                  itemKey: filters.item ?? "",
                  name: null,
                  baseType: filters.item ?? "",
                  signatureKind: "base",
                  signatureValue: filters.value,
              }
            : {}),
    };
    const season = { league: filters.league, firstHour: row.hour, latestHour: row.hour };
    const variant = {
        name: row.name,
        identified: true,
        corrupted: false,
        signatureKind: "",
        signatureValue: "",
        signatureData: null,
        links: null as number | null,
        latestHour: row.hour,
        listingCount: 3,
        prices: { chaos: { count: 3, min: 6, median: 8, max: 12 } } as Record<
            string,
            MarketPriceSummary
        > | null,
    };
    const bases = filters.category === "armour-bases";
    return {
        filters,
        seasons: [season],
        season,
        hasMore: filters.page === 1,
        chaosRates: { chaos: 1, divine: 150 },
        priceRates: { chaos: 1, divine: 1 / 150 },
        exchangeUnit: "chaos",
        exchange:
            filters.page === 1 && !bases
                ? [
                      {
                          itemId: "Metadata/Items/Currency/CurrencyIdentification",
                          name: "Scroll of Wisdom",
                          category: filters.category === "all" ? "currency" : filters.category,
                          price: 0.002,
                          via: {
                              itemId: "Metadata/Items/Currency/CurrencyRerollRare",
                              name: "Chaos Orb",
                          },
                          hour: row.hour,
                          current: true,
                          volume: 1_500,
                          history: [0.0016, null, null, null, null, null, 0.002],
                          change: 0.25,
                          recentVolume: {
                              hourly: [...Array<number>(22).fill(0), 500, 1_500],
                              daily: [4_000, 0, 0, 0, 0, 0, 2_000],
                          },
                          pair: {
                              quoteId: "Metadata/Items/Currency/CurrencyRerollRare",
                              name: "Chaos Orb",
                              rate: 0.002,
                          },
                      },
                  ]
                : [],
        rows: [
            {
                ...row,
                category: "armour",
                rank: 1,
                periodSales: 2,
                periodRemovals: 2,
                periodPending: 1,
                baseDescription: null,
                recentSales: {
                    hourly: [...Array<number>(22).fill(0), 1, 0],
                    daily: [0, 0, 0, 0, 0, 1, 1],
                },
                ...(bases
                    ? {
                          category: "armour-bases" as const,
                          itemKey: "Titan Plate",
                          name: null,
                          baseType: "Titan Plate",
                          iconAsset: "2DItems/Armours/BodyArmours/TitanPlate",
                          frameType: 2,
                          signatureKind: "base",
                          signatureValue: "ilvl 86+ · 6 links",
                          baseDescription: "Body Armour · Str · Level 73",
                          listingCount: 12,
                          uniqueSellers: 9,
                          prices: { chaos: { count: 12, min: 40, median: 60, max: 90 } },
                      }
                    : {}),
            },
        ],
        baseDescription: filters.kind === "base" ? "Body Armour · Str · Level 73" : null,
        variants:
            filters.item === "Loreweave"
                ? [null, 6, 0].map((links) => ({
                      ...variant,
                      itemKey: filters.item!,
                      links,
                      periodSales: 1,
                  }))
                : filters.item === "Forbidden Flesh"
                  ? Array.from({ length: 30 }, (_, index) => ({
                        ...variant,
                        itemKey: filters.item!,
                        signatureKind: "forbidden-jewel",
                        // The first is an Inquisitor notable; the rest are on no ascendancy.
                        signatureValue: index ? `Notable ${index}` : "Pious Path",
                        periodSales: 30 - index,
                    }))
                  : filters.item
                    ? [
                          { ...variant, itemKey: filters.item, periodSales: 2 },
                          { ...variant, itemKey: filters.item, corrupted: true, periodSales: 1 },
                          {
                              ...variant,
                              itemKey: `unid:${row.iconAsset}`,
                              identified: false,
                              periodSales: 1,
                          },
                      ]
                    : [],
        modValues: isModPool(filters.kind)
            ? modPoolValues(
                  [
                      "Haste: #% increased Movement Speed",
                      "Discipline: #% faster start of Energy Shield Recharge",
                  ].map((mod, index) => ({
                      signatureValue: `3 mods: ${mod}`,
                      mod,
                      modCount: 3,
                      listings: 2,
                      ask: 10 + index * 5,
                      medianAsk: 11 + index * 5,
                      sales: 1,
                      salePrice: 12 + index * 5,
                  })),
              )
            : null,
        history: filters.item
            ? [
                  {
                      ...row,
                      merged: {
                          count: 9,
                          unconverted: 0,
                          mean: null,
                          min: 1,
                          p10: 1.1,
                          p25: 1.4,
                          median: 2,
                          p75: 2.5,
                          p90: 2.8,
                          max: 3,
                      },
                      mergedSales: null,
                      mergedDelisted: null,
                      priceRates: { chaos: 1, divine: 1 / 150 },
                  },
              ]
            : [],
        historyUnit: "chaos",
    };
}

export function marketExchangeFixture(
    input: Partial<MarketExchangeItemInput> = {},
): Awaited<ReturnType<typeof getMarketExchangeItem>> {
    const chaos = "Metadata/Items/Currency/CurrencyRerollRare";
    const divine = "Metadata/Items/Currency/CurrencyModValues";
    const wisdom = "Metadata/Items/Currency/CurrencyIdentification";
    const hour = 1_792_836_000;
    // The item page's row has no list-only recent volume.
    const { recentVolume: _, ...exchange } = marketFixture({
        league: input.league || "Allflame",
        category: "currency",
    }).exchange[0]!;
    return {
        realm: input.realm ?? "pc",
        league: input.league || "Allflame",
        seasons: [
            { league: "Allflame", firstHour: hour - 86400, latestHour: hour },
            { league: "Standard", firstHour: hour - 86400, latestHour: hour },
        ],
        latestHour: hour,
        historyStart: hour - 7 * 86400 + 3600,
        item: input.itemId === wisdom ? exchange : null,
        unit: "chaos" as const,
        divine: 150,
        priceRates: { chaos: 1, divine: 1 / 150 },
        history: {
            prices: [
                {
                    hour: hour - 3600,
                    price: 0.0016,
                    low: 0.0015,
                    high: 0.0018,
                    p25: 0.0016,
                    p75: 0.0017,
                    via: chaos,
                    units: 2_000,
                },
                {
                    hour,
                    price: 0.002,
                    low: null,
                    high: null,
                    p25: null,
                    p75: null,
                    via: chaos,
                    units: 3_000,
                },
            ],
            pairs: [
                {
                    quoteId: chaos,
                    name: "Chaos Orb",
                    hours: [
                        {
                            hour: hour - 3600,
                            rate: 0.0016,
                            low: 0.0015,
                            high: 0.0018,
                            p25: 0.0016,
                            p75: 0.0017,
                            units: 1_000,
                        },
                        {
                            hour,
                            rate: 0.002,
                            low: null,
                            high: null,
                            p25: null,
                            p75: null,
                            units: 2_000,
                        },
                    ],
                },
                {
                    quoteId: divine,
                    name: "Divine Orb",
                    hours: [
                        {
                            hour,
                            rate: 0.00001333,
                            low: null,
                            high: null,
                            p25: null,
                            p75: null,
                            units: 1_000,
                        },
                    ],
                },
            ],
        },
    };
}
