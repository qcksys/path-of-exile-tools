import type { getMarketData } from "~/db/queries/market.queries";
import { isModPool, modPoolValues, parseModList } from "~/lib/mod-pools";
import { marketFiltersSchema } from "~/schemas/market";

export function marketFixture(
    input: Record<string, unknown> = {},
): Awaited<ReturnType<typeof getMarketData>> {
    const filters = marketFiltersSchema.parse({ league: "Allflame", ...input });
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
        likelySales: 2,
        removedCount: 2,
        relistedCount: 0,
        pendingCount: 1,
        prices: {
            divine: { count: 5, min: 1, median: 2, max: 3 },
            chaos: { count: 4, min: 10, median: 15, max: 20 },
        },
        salesPrices: null,
        firstSeenAt: "2026-10-24T00:00:00Z",
        lastSeenAt: "2026-10-24T01:00:00Z",
        rowCreatedAt: new Date("2026-10-24T00:00:00Z"),
        rowUpdatedAt: new Date("2026-10-24T00:00:00Z"),
        rowDeletedAt: null,
    };
    const season = { league: filters.league, firstHour: row.hour, latestHour: row.hour };
    const variant = {
        name: row.name,
        identified: true,
        corrupted: false,
        signatureKind: "",
        signatureValue: "",
        signatureData: null,
    };
    const bases = filters.category === "armour-bases";
    return {
        filters,
        seasons: [season],
        season,
        hasMore: filters.page === 1,
        chaosRates: { chaos: 1, divine: 150 },
        exchange:
            filters.page === 1 && !bases
                ? [
                      {
                          itemId: "Metadata/Items/Currency/CurrencyIdentification",
                          name: "Scroll of Wisdom",
                          category: filters.category === "all" ? "currency" : filters.category,
                          chaos: 0.002,
                          volume: 500,
                          hour: row.hour,
                      },
                  ]
                : [],
        rows: bases
            ? []
            : [
                  {
                      ...row,
                      category: "armour",
                      rank: 1,
                      periodSales: 2,
                      periodRemovals: 2,
                      periodPending: 1,
                  },
              ],
        bases: bases
            ? [
                  {
                      id: "base:titan-plate:86-100:6-link",
                      baseType: "Titan Plate",
                      category: "armour-bases",
                      ilvl: { min: 86, max: 100 },
                      links: "6",
                      quality: null,
                      hour: row.hour,
                      listingCount: 12,
                      uniqueSellers: 9,
                      unknownCount: 0,
                      prices: { chaos: { count: 12, min: 40, median: 60, max: 90 } },
                  },
              ]
            : [],
        variants: filters.item
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
                      ["Haste: #% increased Movement Speed", "Precision: #% increased Accuracy"],
                      [
                          "Discipline: #% faster start of Energy Shield Recharge",
                          "Haste: #% increased Movement Speed",
                      ],
                  ].map((mods, index) => ({
                      signatureValue: mods.join(" / "),
                      mods,
                      listings: 2,
                      ask: 10 + index * 5,
                      sales: 1,
                      salePrice: 12 + index * 5,
                  })),
                  { require: parseModList(filters.mods), anyOf: parseModList(filters.anyMods) },
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
                  },
              ]
            : [],
    };
}
