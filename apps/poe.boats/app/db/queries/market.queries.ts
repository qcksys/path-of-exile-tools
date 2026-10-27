import { exchangeSnapshotSchema } from "@poe-tools/market";
import {
    and,
    asc,
    desc,
    eq,
    getTableColumns,
    gte,
    inArray,
    like,
    lte,
    max,
    min,
    or,
    type SQL,
    type SQLWrapper,
    sql,
} from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashCurrencyHourly as currencyHourly } from "~/db/schema/stash.currency-hourly";
import {
    tStashUniqueHourly as market,
    type TStashUniqueHourlyS,
} from "~/db/schema/stash.unique-hourly";
import { marketCategory, marketCategoryFilter } from "~/lib/market-categories.server";
import {
    chaosRatesByHour,
    MARKET_RATE_MAX_AGE,
    marketDisplayRate,
    marketRatePairs,
    mergeMarketPrices,
} from "~/lib/market-price-merge";
import type { MarketFilters, MarketOrder } from "~/schemas/market";
import { type Span, traceQuery, traceSpan } from "~/services/tracing.server";

const PAGE_SIZE = 50;

type MarketView = "all" | "list" | "history";

export function getMarketData(db: TDatabase, input: MarketFilters, view: MarketView = "all") {
    return traceSpan("market.data", (span) => readMarketData(db, input, view, span));
}

async function readMarketData(db: TDatabase, input: MarketFilters, view: MarketView, span: Span) {
    // Group by the full index prefix so MySQL can skip between season boundaries.
    const seasons = await traceQuery(
        "market.seasons",
        db
            .select({
                league: market.league,
                firstHour: min(market.hour),
                latestHour: max(market.hour),
            })
            .from(market)
            .where(eq(market.realm, input.realm))
            .groupBy(market.realm, market.league)
            .orderBy(desc(max(market.hour))),
    );
    const filters = { ...input, league: input.league || seasons[0]?.league || "" };
    span.setAttributes({
        "market.view": view,
        "market.realm": filters.realm,
        "market.league": filters.league,
        "market.category": filters.category,
        "market.order": filters.order,
        "market.days": filters.days,
        "market.page": filters.page,
        "market.currency": filters.currency,
        "market.rarity": filters.rarity,
        "market.identification": filters.identification,
        "market.corruption": filters.corruption,
        "market.search": Boolean(filters.q),
        "market.item": Boolean(filters.item),
    });
    const season = seasons.find((entry) => entry.league === filters.league);
    const cutoff = Number(season?.latestHour ?? 0) - Number(filters.days) * 86400 + 3600;
    const scope = and(
        eq(market.realm, filters.realm),
        eq(market.league, filters.league),
        gte(market.hour, cutoff),
    );
    const search = filters.q ? `%${filters.q.replace(/[\\%_]/g, "\\$&")}%` : undefined;
    const price = sql`cast(json_unquote(json_extract(${market.prices}, ${`$.${JSON.stringify(filters.currency)}.median`})) as decimal(30, 10))`;
    const latestRowOrders: Partial<Record<MarketOrder, SQL>> = {
        "price-asc": asc(price),
        "price-desc": desc(price),
        "listings-asc": asc(market.listingCount),
        "listings-desc": desc(market.listingCount),
        "sellers-asc": asc(market.uniqueSellers),
        "sellers-desc": desc(market.uniqueSellers),
    };
    const latestRowOrder = latestRowOrders[filters.order];
    const latestRowFilters = [
        ...between(price, filters.priceMin, filters.priceMax),
        ...between(market.listingCount, filters.listingsMin, filters.listingsMax),
        ...between(market.uniqueSellers, filters.sellersMin, filters.sellersMax),
    ];
    // Ordering or filtering on the latest row's values must happen before pagination.
    const pageLatestRows = Boolean(latestRowOrder) || latestRowFilters.length > 0;
    const rarity = { normal: 0, magic: 1, rare: 2, unique: 3 };
    const grouped = db
        .select({
            itemKey: market.itemKey,
            identified: market.identified,
            corrupted: market.corrupted,
            foilVariation: market.foilVariation,
            signatureKind: market.signatureKind,
            signatureValue: market.signatureValue,
            latestHour:
                sql<number>`coalesce(max(case when ${market.listingCount} > 0 then ${market.hour} end), max(${market.hour}))`
                    .mapWith(Number)
                    .as("latest_hour"),
            periodSales: sql<number>`sum(${market.likelySales})`.mapWith(Number).as("period_sales"),
            periodRemovals: sql<number>`sum(${market.removedCount})`
                .mapWith(Number)
                .as("period_removals"),
            periodPending: sql<number>`sum(${market.pendingCount})`
                .mapWith(Number)
                .as("period_pending"),
        })
        .from(market, search ? undefined : { forceIndex: "stash_unique_market_cover_idx" })
        .where(
            and(
                scope,
                marketCategoryFilter(filters),
                filters.rarity === "all" ? undefined : eq(market.frameType, rarity[filters.rarity]),
                filters.identification === "all"
                    ? undefined
                    : eq(market.identified, filters.identification === "true"),
                filters.corruption === "all"
                    ? undefined
                    : eq(market.corrupted, filters.corruption === "true"),
                search
                    ? or(
                          like(market.name, search),
                          like(market.itemKey, search),
                          like(market.baseType, search),
                          like(market.signatureValue, search),
                      )
                    : undefined,
            ),
        )
        .groupBy(
            market.itemKey,
            market.identified,
            market.corrupted,
            market.foilVariation,
            market.signatureKind,
            market.signatureValue,
        )
        .having(({ periodSales }) =>
            and(...between(periodSales, filters.salesMin, filters.salesMax)),
        )
        .orderBy(({ periodSales, latestHour }) => [
            ...aggregateOrder(filters.order, periodSales, latestHour),
            filters.order === "name-desc" ? desc(market.itemKey) : asc(market.itemKey),
            asc(market.identified),
            asc(market.corrupted),
            asc(market.foilVariation),
            asc(market.signatureKind),
            asc(market.signatureValue),
        ])
        .$dynamic();
    if (!pageLatestRows) grouped.limit(PAGE_SIZE + 1).offset((filters.page - 1) * PAGE_SIZE);
    const page = grouped.as("page");
    const rowsQuery = db
        .select({
            ...getTableColumns(market),
            rank: sql<number>`1`,
            periodSales: page.periodSales,
            periodRemovals: page.periodRemovals,
            periodPending: page.periodPending,
        })
        .from(page)
        .innerJoin(
            market,
            and(
                eq(market.realm, filters.realm),
                eq(market.league, filters.league),
                eq(market.hour, page.latestHour),
                eq(market.itemKey, page.itemKey),
                eq(market.identified, page.identified),
                eq(market.corrupted, page.corrupted),
                eq(market.foilVariation, page.foilVariation),
                eq(market.signatureKind, page.signatureKind),
                eq(market.signatureValue, page.signatureValue),
            ),
        )
        .where(and(...latestRowFilters))
        .orderBy(
            ...(latestRowOrder
                ? [
                      ...(filters.order.startsWith("price-") ? [asc(sql`${price} is null`)] : []),
                      latestRowOrder,
                  ]
                : aggregateOrder(filters.order, page.periodSales, page.latestHour)),
            filters.order === "name-desc" ? desc(page.itemKey) : asc(page.itemKey),
            asc(page.identified),
            asc(page.corrupted),
            asc(page.foilVariation),
            asc(page.signatureKind),
            asc(page.signatureValue),
        )
        .$dynamic();
    if (pageLatestRows) rowsQuery.limit(PAGE_SIZE + 1).offset((filters.page - 1) * PAGE_SIZE);
    const rowsPromise =
        view === "history"
            ? Promise.resolve([])
            : traceQuery("market.rows", rowsQuery, {
                  "market.page_latest_rows": pageLatestRows,
                  "market.force_index": !search,
              });
    const historyPromise =
        filters.item && view !== "list"
            ? traceQuery(
                  "market.history",
                  db
                      .select()
                      .from(market)
                      .where(
                          and(
                              scope,
                              eq(market.itemKey, filters.item),
                              eq(market.identified, filters.identified === "true"),
                              eq(market.corrupted, filters.corrupted === "true"),
                              eq(market.foilVariation, filters.foil),
                              eq(market.signatureKind, filters.kind),
                              eq(market.signatureValue, filters.value),
                          ),
                      )
                      .orderBy(asc(market.hour))
                      .limit(2160),
              )
            : Promise.resolve([]);
    const variantsPromise =
        filters.item && view !== "list"
            ? traceQuery(
                  "market.variants",
                  db
                      .select({
                          itemKey: market.itemKey,
                          identified: market.identified,
                          corrupted: market.corrupted,
                          foilVariation: market.foilVariation,
                          signatureKind: market.signatureKind,
                          signatureValue: market.signatureValue,
                          periodSales: sql<number>`sum(${market.likelySales})`.mapWith(Number),
                      })
                      .from(market)
                      .where(and(scope, eq(market.itemKey, filters.item)))
                      .groupBy(
                          market.itemKey,
                          market.identified,
                          market.corrupted,
                          market.foilVariation,
                          market.signatureKind,
                          market.signatureValue,
                      )
                      .orderBy(
                          desc(sql`sum(${market.likelySales})`),
                          asc(market.corrupted),
                          asc(market.foilVariation),
                          asc(market.signatureValue),
                      )
                      .limit(100),
              )
            : Promise.resolve([]);
    const [rows, history, variants] = await Promise.all([
        rowsPromise,
        historyPromise,
        variantsPromise,
    ]);
    const rates = await historyChaosRates(db, filters, history);
    span.setAttributes({
        "market.rows": rows.length,
        "market.history_rows": history.length,
        "market.variants": variants.length,
    });
    return {
        filters,
        seasons,
        season,
        rows: rows
            .slice(0, PAGE_SIZE)
            .map((row) => ({ ...row, category: marketCategory(filters.realm, row.baseType) })),
        hasMore: rows.length > PAGE_SIZE,
        variants,
        history: history.map((row) => {
            const rate = marketDisplayRate(rates, filters.currency, row.hour);
            return {
                ...row,
                merged: mergeMarketPrices(row.prices, rate),
                mergedSales: mergeMarketPrices(row.salesPrices, rate),
            };
        }),
    };
}

function between(column: SQLWrapper, min: number | undefined, max: number | undefined) {
    return [
        ...(min === undefined ? [] : [gte(column, min)]),
        ...(max === undefined ? [] : [lte(column, max)]),
    ];
}

function aggregateOrder(order: MarketOrder, periodSales: SQLWrapper, latestHour: SQLWrapper) {
    if (order === "sales") return [desc(periodSales)];
    if (order === "sales-asc") return [asc(periodSales)];
    if (order === "newest") return [desc(latestHour)];
    if (order === "oldest") return [asc(latestHour)];
    return [];
}

async function historyChaosRates(
    db: TDatabase,
    filters: MarketFilters,
    history: TStashUniqueHourlyS[],
) {
    if (!history.length) return new Map<number, Map<string, number>>();
    const currencies = [
        ...new Set([
            filters.currency,
            ...history.flatMap((row) => [
                ...Object.keys(row.prices ?? {}),
                ...Object.keys(row.salesPrices ?? {}),
            ]),
        ]),
    ];
    const snapshots = await traceQuery(
        "market.rates",
        db
            .select({
                realm: currencyHourly.realm,
                league: currencyHourly.league,
                marketId: currencyHourly.marketId,
                hour: currencyHourly.hour,
                volumeTraded: currencyHourly.volumeTraded,
                lowestRatio: currencyHourly.lowestRatio,
                highestRatio: currencyHourly.highestRatio,
            })
            .from(currencyHourly)
            .where(
                and(
                    eq(currencyHourly.realm, filters.realm),
                    eq(currencyHourly.league, filters.league),
                    inArray(currencyHourly.marketId, marketRatePairs(currencies)),
                    gte(currencyHourly.hour, history[0]!.hour - MARKET_RATE_MAX_AGE),
                    lte(currencyHourly.hour, history.at(-1)!.hour),
                ),
            ),
        { "market.currencies": currencies.length },
    );
    return chaosRatesByHour(
        snapshots.map((row) => exchangeSnapshotSchema.parse(row)),
        currencies,
    );
}
