import type { getMarketData } from "~/db/queries/market.queries";
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
        foilVariation: -1,
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
    return {
        filters,
        seasons: [season],
        season,
        hasMore: filters.page === 1,
        rows: [
            {
                ...row,
                category: "armour",
                rank: 1,
                periodSales: 2,
                periodRemovals: 2,
                periodPending: 1,
            },
        ],
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
