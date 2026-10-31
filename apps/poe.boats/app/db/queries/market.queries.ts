import {
    exchangeCurrencyId,
    exchangeSnapshotSchema,
    gemVariantValues,
    mapVariantValues,
    marketBaseEntry,
    marketBaseVariantValues,
    marketLeagueTracked,
    marketObservationRange,
    TRANSFIGURED_GEMS,
    VAAL_GEMS,
} from "@poe-tools/market";
import {
    and,
    asc,
    desc,
    eq,
    gt,
    gte,
    inArray,
    like,
    lte,
    max,
    min,
    ne,
    notInArray,
    or,
    type SQL,
    type SQLWrapper,
    sql,
    sum,
} from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { stashGame } from "~/db/helpers/stash-game";
import { tStashCurrencyDaily } from "~/db/schema/stash.currency-daily";
import { tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import { tStashCurrencyMarket } from "~/db/schema/stash.currency-market";
import { tStashHourCoverage } from "~/db/schema/stash.hour-coverage";
import { tStashMarketDaily } from "~/db/schema/stash.market-daily";
import { type TStashUniqueHourlyS, tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";
import { marketBaseDescription } from "~/lib/market-bases";
import { marketCategory, marketCategoryFilter } from "~/lib/market-categories.server";
import {
    MARKET_EXCHANGE_DAYS,
    MARKET_EXCHANGE_RECENT_HOURS,
    type MarketExchangeRow,
    marketExchangeHistory,
    marketExchangeNoRecentVolume,
    marketExchangePriceRates,
    marketExchangeRecentVolume,
    marketExchangeRows,
    marketExchangeUnit,
    marketExchangeUnitId,
    marketPriceCurrencyIds,
} from "~/lib/market-exchange";
import { marketExchangeItem } from "~/lib/market-exchange.server";
import { marketSettings } from "~/lib/market-kinds";
import { MARKET_PRICE_CURRENCIES } from "~/lib/market-price-currencies";
import {
    chaosRatesByHour,
    marketDisplayRate,
    marketGame,
    marketPriceRates,
    mergeMarketPrices,
    mergeMarketRows,
} from "~/lib/market-price-merge";
import { isModPool, MOD_POOL_KINDS, modPoolMod, modPoolValues } from "~/lib/mod-pools";
import {
    type MarketExchangeItemInput,
    type MarketFilters,
    type MarketOrder,
    marketCorruption,
    marketIdentification,
    type Poe2MarketFilters,
} from "~/schemas/market";
import { type Span, traceQuery, traceSpan } from "~/services/tracing.server";
import { marketRateSnapshots } from "./market-rates.queries";
import { endedStashLeagues } from "./stash-league.queries";
import { utcDay } from "./stash-rollups.queries";

const PAGE_SIZE = 50;
/** Forbidden jewels list every notable on one page, so each class and ascendancy is complete. */
const FORBIDDEN_PAGE_SIZE = 1000;
const CHAOS = exchangeCurrencyId("chaos")!;
const DIVINE = exchangeCurrencyId("divine")!;
const EXALTED = exchangeCurrencyId("exalted")!;

/** The realm's game's stash tables. */
function marketTables(realm: string) {
    const game = stashGame(realm);
    return {
        market: tStashUniqueHourly[game],
        daily: tStashMarketDaily[game],
        currencyHourly: tStashCurrencyHourly[game],
        currencyDaily: tStashCurrencyDaily[game],
        currencyMarket: tStashCurrencyMarket[game],
        hourCoverage: tStashHourCoverage[game],
    };
}
type MarketTable = ReturnType<typeof marketTables>["market"];
type DailyTable = ReturnType<typeof marketTables>["daily"];

/** Gem level and quality band filters list only the gem markets in the bands they allow. */
function gemFilter(daily: DailyTable, filters: MarketFilters) {
    const values = gemVariantValues(filters);
    if (!values) return undefined;
    return values.length
        ? and(eq(daily.signatureKind, "gem"), inArray(daily.signatureValue, values))
        : sql`false`;
}

/** Map mod count, quantity, delirium and influence filters list only the map markets they allow. */
function mapFilter(daily: DailyTable, filters: MarketFilters) {
    const values = mapVariantValues(filters);
    if (!values) return undefined;
    return values.length
        ? and(eq(daily.signatureKind, "map"), inArray(daily.signatureValue, values))
        : sql`false`;
}

/** Item level, link and quality filters list only the crafting base markets they allow. */
function baseFilter(daily: DailyTable, filters: MarketFilters) {
    const values = marketBaseVariantValues(filters);
    if (!values) return undefined;
    return values.length ? inArray(daily.signatureValue, values) : sql`false`;
}

/** The transfigured and Vaal filters list only gem markets, among `gems` or the rest. */
function gemListFilter(
    daily: DailyTable,
    state: MarketFilters["gemVaal"],
    gems: readonly string[],
) {
    if (state === "all") return undefined;
    return and(
        eq(daily.signatureKind, "gem"),
        state === "true" ? inArray(daily.itemKey, [...gems]) : notInArray(daily.itemKey, [...gems]),
    );
}

/** Without a `links` filter, an item page merges every link count, as the market list does. */
function linksMatch(market: MarketTable, filters: MarketFilters) {
    return filters.links === undefined ? undefined : eq(market.links, Number(filters.links));
}

/** Markets track merchant tabs only; rows stored before ingest dropped the rest stay unread. */
function merchantTab(table: MarketTable | DailyTable) {
    return eq(table.tab, "merchant");
}

/**
 * Merges one hour's rows of a market, which spans link counts unless the filters pick one, so the
 * result has none.
 */
function mergeMarket(rows: TStashUniqueHourlyS[]) {
    const {
        links: _links,
        tab: _tab,
        priceChaos: _priceChaos,
        priceDivine: _priceDivine,
        allTabsPriceChaos: _allTabsPriceChaos,
        allTabsPriceDivine: _allTabsPriceDivine,
        ...row
    } = mergeMarketRows(rows);
    return row;
}

type MarketRowKey = Pick<
    TStashUniqueHourlyS,
    "itemKey" | "identified" | "corrupted" | "signatureKind" | "signatureValue"
>;

function marketRowKey(row: MarketRowKey, hour: number) {
    return JSON.stringify([
        hour,
        row.itemKey,
        Boolean(row.identified),
        Boolean(row.corrupted),
        row.signatureKind,
        row.signatureValue,
    ]);
}

/** One row per hour. */
function mergeByHour(rows: TStashUniqueHourlyS[]) {
    const hours = Map.groupBy(rows, (row) => row.hour);
    return [...hours.values()].map(mergeMarket).sort((a, b) => a.hour - b.hour);
}

/** Each listed market's latest-hour row, in list order. */
async function marketLatestRows<
    Market extends MarketRowKey & {
        latestHour: number;
        periodSales: number;
        periodRemovals: number;
        periodPending: number;
    },
>(db: TDatabase, filters: MarketFilters, markets: Market[]) {
    if (!markets.length) return [];
    const { market } = marketTables(filters.realm);
    const rows = await traceQuery(
        "market.latest_rows",
        db
            .select()
            .from(market)
            .where(
                and(
                    eq(market.realm, filters.realm),
                    eq(market.league, filters.league),
                    merchantTab(market),
                    or(
                        ...markets.map((entry) =>
                            and(
                                eq(market.hour, entry.latestHour),
                                eq(market.itemKey, entry.itemKey),
                                eq(market.identified, entry.identified),
                                eq(market.corrupted, entry.corrupted),
                                eq(market.signatureKind, entry.signatureKind),
                                eq(market.signatureValue, entry.signatureValue),
                            ),
                        ),
                    ),
                ),
            ),
    );
    const byMarket = Map.groupBy(rows, (row) => marketRowKey(row, row.hour));
    return markets.flatMap((entry) => {
        const group = byMarket.get(marketRowKey(entry, entry.latestHour));
        if (!group) return [];
        return [
            {
                ...mergeMarket(group),
                rank: 1,
                periodSales: entry.periodSales,
                periodRemovals: entry.periodRemovals,
                periodPending: entry.periodPending,
            },
        ];
    });
}

/** Hours and UTC days of likely sales the market list charts. */
const RECENT_SALE_HOURS = 24;
const RECENT_SALE_DAYS = 7;

export type MarketRecentSales = { hourly: number[]; daily: number[] };

/**
 * Likely sales of each listed market in each of the latest 24 hours and 7 UTC days to
 * `latestHour`, oldest first, keyed by `marketRowKey(row, 0)`.
 */
async function marketRecentSales(
    db: TDatabase,
    filters: MarketFilters,
    markets: MarketRowKey[],
    latestHour: number,
) {
    const sales = new Map<string, MarketRecentSales>();
    if (!markets.length) return sales;
    const { market, daily } = marketTables(filters.realm);
    const itemKeys = [...new Set(markets.map((row) => row.itemKey))];
    const firstHour = latestHour - (RECENT_SALE_HOURS - 1) * 3600;
    const firstDay = utcDay(latestHour) - (RECENT_SALE_DAYS - 1) * 86400;
    const [hours, days] = await Promise.all([
        traceQuery(
            "market.recent_sales_hourly",
            db
                .select({
                    hour: market.hour,
                    itemKey: market.itemKey,
                    identified: market.identified,
                    corrupted: market.corrupted,
                    signatureKind: market.signatureKind,
                    signatureValue: market.signatureValue,
                    sales: sql<number>`sum(${market.likelySales})`.mapWith(Number),
                })
                // The view finds the page's markets by (realm, league, item key), then their hours.
                .from(market)
                .where(
                    and(
                        eq(market.realm, filters.realm),
                        eq(market.league, filters.league),
                        inArray(market.itemKey, itemKeys),
                        gte(market.hour, firstHour),
                        lte(market.hour, latestHour),
                        merchantTab(market),
                    ),
                )
                .groupBy(
                    market.hour,
                    market.itemKey,
                    market.identified,
                    market.corrupted,
                    market.signatureKind,
                    market.signatureValue,
                ),
        ),
        traceQuery(
            "market.recent_sales_daily",
            db
                .select({
                    day: daily.day,
                    itemKey: daily.itemKey,
                    identified: daily.identified,
                    corrupted: daily.corrupted,
                    signatureKind: daily.signatureKind,
                    signatureValue: daily.signatureValue,
                    sales: sql<number>`sum(${daily.likelySales})`.mapWith(Number),
                })
                .from(daily)
                .where(
                    and(
                        eq(daily.realm, filters.realm),
                        eq(daily.league, filters.league),
                        gte(daily.day, firstDay),
                        lte(daily.day, latestHour),
                        inArray(daily.itemKey, itemKeys),
                        merchantTab(daily),
                    ),
                )
                .groupBy(
                    daily.day,
                    daily.itemKey,
                    daily.identified,
                    daily.corrupted,
                    daily.signatureKind,
                    daily.signatureValue,
                ),
        ),
    ]);
    const entry = (row: MarketRowKey) => {
        const key = marketRowKey(row, 0);
        let found = sales.get(key);
        if (!found) {
            found = {
                hourly: Array(RECENT_SALE_HOURS).fill(0),
                daily: Array(RECENT_SALE_DAYS).fill(0),
            };
            sales.set(key, found);
        }
        return found;
    };
    for (const row of hours) entry(row).hourly[(row.hour - firstHour) / 3600]! += row.sales;
    for (const row of days) entry(row).daily[(row.day - firstDay) / 86400]! += row.sales;
    return sales;
}

/** Null for a Cluster Jewel, whose base type already says all of it. */
function baseDescription(baseType: string) {
    const entry = marketBaseEntry(baseType);
    return entry ? marketBaseDescription(entry) : null;
}

type MarketView = "all" | "list" | "history";

export function getMarketData(db: TDatabase, input: MarketFilters, view: MarketView = "all") {
    return traceSpan("market.data", (span) => readMarketData(db, input, view, span));
}

async function readMarketData(db: TDatabase, input: MarketFilters, view: MarketView, span: Span) {
    const { market, daily } = marketTables(input.realm);
    const exchangeHour = marketObservationRange().latestHour;
    const [stashSeasons, exchangeSeasons, ended] = await Promise.all([
        marketStashSeasons(db, input.realm),
        marketExchangeSeasons(db, input.realm, exchangeHour),
        endedStashLeagues(db, input.realm),
    ]);
    const byLeague = new Map(stashSeasons.map((season) => [season.league, season]));
    for (const season of exchangeSeasons) {
        const existing = byLeague.get(season.league);
        byLeague.set(
            season.league,
            existing
                ? {
                      league: season.league,
                      firstHour: Math.min(Number(existing.firstHour), Number(season.firstHour)),
                      latestHour: Math.max(Number(existing.latestHour), Number(season.latestHour)),
                  }
                : season,
        );
    }
    const seasons = activeFirst(
        [...byLeague.values()].sort((a, b) => Number(b.latestHour) - Number(a.latestHour)),
        ended,
    );
    const settings = marketSettings(input.category);
    const filters = {
        ...input,
        league: input.league || seasons[0]?.league || "",
        corruption: marketCorruption(input),
        identification: marketIdentification(input),
    };
    span.setAttributes({
        "market.view": view,
        "market.realm": filters.realm,
        "market.league": filters.league,
        "market.category": filters.category,
        "market.order": filters.order,
        "market.days": filters.days,
        "market.page": filters.page,
        "market.currency": filters.currency,
        "market.identification": filters.identification,
        "market.corruption": filters.corruption,
        "market.search": Boolean(filters.q),
        "market.item": Boolean(filters.item),
    });
    const season = seasons.find((entry) => entry.league === filters.league);
    const latestHour = Number(season?.latestHour ?? 0);
    const pageSize = settings.layout === "pairs" ? FORBIDDEN_PAGE_SIZE : PAGE_SIZE;
    // Windows start at UTC midnight so lists sum whole days of `stash_market_daily`.
    const windowStart = utcDay(latestHour - Number(filters.days) * 86400 + 3600);
    const scope = and(
        eq(market.realm, filters.realm),
        eq(market.league, filters.league),
        gte(market.hour, windowStart),
        merchantTab(market),
    );
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
                              eq(market.signatureKind, filters.kind),
                              eq(market.signatureValue, filters.value),
                              linksMatch(market, filters),
                          ),
                      )
                      .orderBy(desc(market.hour))
                      // 90 days of hours per link count.
                      .limit(2160 * 3),
              ).then(mergeByHour)
            : Promise.resolve([]);
    const variantsPromise =
        filters.item && view !== "list"
            ? marketVariants(db, market, scope, filters.item)
            : Promise.resolve([]);
    const modRowsPromise =
        filters.item && view !== "list" && isModPool(filters.kind)
            ? modPoolRows(db, filters, filters.item, scope, windowStart)
            : Promise.resolve(null);
    // Items listed on the exchange are priced from it; the rows query leaves out their stash listings.
    const listedMarkets =
        season && view !== "history"
            ? await marketExchangeMarkets(db, filters, exchangeHour, "market.exchange_listed")
            : [];
    const listed = [...new Set(listedMarkets.flatMap((row) => row.marketId.split("|")))];
    const exchangeNames = [
        ...new Set(listed.flatMap((id) => marketExchangeItem(filters.realm, id)?.name ?? [])),
    ];
    const days = and(
        eq(daily.realm, filters.realm),
        eq(daily.league, filters.league),
        gte(daily.day, windowStart),
        merchantTab(daily),
    );
    const search = filters.q ? `%${filters.q.replace(/[\\%_]/g, "\\$&")}%` : undefined;
    // The price locked when the market's newest listed hour was written, as its price cell shows it.
    const priceDivisor =
        !season ||
        view === "history" ||
        filters.currency === "chaos" ||
        filters.currency === "divine"
            ? undefined
            : await marketDisplayCurrencyRate(db, filters, latestHour);
    const price =
        filters.currency === "divine"
            ? sql`max(${market.priceDivine})`
            : filters.currency === "chaos"
              ? sql`max(${market.priceChaos})`
              : sql`max(${market.priceChaos}) / ${priceDivisor ?? null}`;
    const listings = sql`sum(${market.listingCount})`;
    const sellers = sql`sum(${market.uniqueSellers})`;
    const latestRowOrders: Partial<Record<MarketOrder, SQL>> = {
        "price-asc": asc(price),
        "price-desc": desc(price),
        "listings-asc": asc(listings),
        "listings-desc": desc(listings),
        "sellers-asc": asc(sellers),
        "sellers-desc": desc(sellers),
    };
    const latestRowOrder = latestRowOrders[filters.order];
    const latestRowFilters = [
        ...between(price, filters.priceMin, filters.priceMax),
        ...between(listings, filters.listingsMin, filters.listingsMax),
        ...between(sellers, filters.sellersMin, filters.sellersMax),
    ];
    // Ordering or filtering on the latest row's values must happen before pagination.
    const pageLatestRows = Boolean(latestRowOrder) || latestRowFilters.length > 0;
    const grouped = db
        .select({
            itemKey: daily.itemKey,
            identified: daily.identified,
            corrupted: daily.corrupted,
            signatureKind: daily.signatureKind,
            signatureValue: daily.signatureValue,
            latestHour: sql<number>`coalesce(max(${daily.listedHour}), max(${daily.latestHour}))`
                .mapWith(Number)
                .as("latest_hour"),
            periodSales: sql<number>`sum(${daily.likelySales})`.mapWith(Number).as("period_sales"),
            periodRemovals: sql<number>`sum(${daily.removedCount})`
                .mapWith(Number)
                .as("period_removals"),
            periodPending: sql<number>`sum(${daily.pendingCount})`
                .mapWith(Number)
                .as("period_pending"),
        })
        // A category's base types are a few index ranges; MySQL underrates them against long IN lists.
        // Search reads `name`, which the index does not cover.
        .from(
            daily,
            filters.category !== "all" && filters.category !== "other" && !search
                ? { forceIndex: "stash_market_daily_base_idx" }
                : undefined,
        )
        .where(
            and(
                days,
                marketCategoryFilter(filters, daily),
                gemFilter(daily, filters),
                mapFilter(daily, filters),
                settings.kind === "base" ? baseFilter(daily, filters) : undefined,
                gemListFilter(daily, filters.gemTransfigured, TRANSFIGURED_GEMS),
                gemListFilter(daily, filters.gemVaal, VAAL_GEMS),
                filters.identification === "all"
                    ? undefined
                    : eq(daily.identified, filters.identification === "true"),
                filters.corruption === "all"
                    ? undefined
                    : eq(daily.corrupted, filters.corruption === "true"),
                exchangeNames.length
                    ? or(notInArray(daily.baseType, exchangeNames), eq(daily.frameType, 3))
                    : undefined,
                search
                    ? or(
                          like(daily.name, search),
                          like(daily.itemKey, search),
                          like(daily.baseType, search),
                          like(daily.signatureValue, search),
                      )
                    : undefined,
            ),
        )
        .groupBy(
            daily.itemKey,
            daily.identified,
            daily.corrupted,
            daily.signatureKind,
            daily.signatureValue,
        )
        .having(({ periodSales }) =>
            and(...between(periodSales, filters.salesMin, filters.salesMax)),
        )
        .orderBy(({ periodSales, latestHour }) => [
            ...aggregateOrder(filters.order, periodSales, latestHour),
            filters.order === "name-desc" ? desc(daily.itemKey) : asc(daily.itemKey),
            asc(daily.identified),
            asc(daily.corrupted),
            asc(daily.signatureKind),
            asc(daily.signatureValue),
        ])
        .$dynamic();
    if (!pageLatestRows) grouped.limit(pageSize + 1).offset((filters.page - 1) * pageSize);
    const page = grouped.as("page");
    // One row per market: its latest hour's totals across its foil and non-foil rows.
    const marketsQuery = db
        .select({
            itemKey: page.itemKey,
            identified: page.identified,
            corrupted: page.corrupted,
            signatureKind: page.signatureKind,
            signatureValue: page.signatureValue,
            latestHour: page.latestHour,
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
                merchantTab(market),
                eq(market.itemKey, page.itemKey),
                eq(market.identified, page.identified),
                eq(market.corrupted, page.corrupted),
                eq(market.signatureKind, page.signatureKind),
                eq(market.signatureValue, page.signatureValue),
            ),
        )
        .groupBy(
            page.itemKey,
            page.identified,
            page.corrupted,
            page.signatureKind,
            page.signatureValue,
            page.latestHour,
            page.periodSales,
            page.periodRemovals,
            page.periodPending,
        )
        .having(and(...latestRowFilters))
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
            asc(page.signatureKind),
            asc(page.signatureValue),
        )
        .$dynamic();
    if (pageLatestRows) marketsQuery.limit(pageSize + 1).offset((filters.page - 1) * pageSize);
    const rowsPromise =
        view === "history"
            ? Promise.resolve([])
            : traceQuery("market.rows", marketsQuery, {
                  "market.page_latest_rows": pageLatestRows,
                  "market.window_start": windowStart,
              }).then(async (markets) => {
                  const [latest, recent] = await Promise.all([
                      marketLatestRows(db, filters, markets),
                      marketRecentSales(db, filters, markets, latestHour),
                  ]);
                  return latest.map((row) => ({
                      ...row,
                      recentSales: recent.get(marketRowKey(row, 0)) ?? {
                          hourly: Array<number>(RECENT_SALE_HOURS).fill(0),
                          daily: Array<number>(RECENT_SALE_DAYS).fill(0),
                      },
                  }));
              });
    const [rows, history, variants, exchange, modRows] = await Promise.all([
        rowsPromise,
        historyPromise,
        variantsPromise,
        listed.length
            ? marketExchange(
                  db,
                  filters,
                  exchangeHour,
                  listedMarkets,
                  (item) =>
                      exchangeListed(filters) && exchangeMatch(item, filters.category, filters.q),
              )
            : [],
        modRowsPromise,
    ]);
    // Variants are priced at the season's latest rates, as list rows are.
    const priced = [...rows, ...variants];
    const rates = await marketChaosRates(
        db,
        filters,
        [
            ...history,
            ...priced.map(({ prices }) => ({ prices, salesPrices: null })),
            ...(modRows ?? []),
        ],
        [
            ...history.map((row) => row.hour),
            ...(priced.length ? [latestHour] : []),
            ...(modRows ?? []).map((row) => row.hour),
        ],
    );
    const toChaos = marketDisplayRate(rates, "chaos", latestHour);
    const game = marketGame(filters.realm);
    const historyUnit = MARKET_PRICE_CURRENCIES[game][0];
    const listCurrencies = priced.length
        ? new Set(["divine", ...priced.flatMap((row) => Object.keys(row.prices ?? {}))])
        : [];
    const exchangeRows = exchangeMatches(exchange, filters);
    const exchangeUnit = marketExchangeUnit(filters.realm);
    // Exalted-priced exchange rows (PoE 2) give no chaos rate for divine.
    const exchangeChaos = exchangeRows.length > 0 && exchangeUnit === "chaos";
    /** Chaos per unit of each listing currency on the page, at the season's latest hour. */
    const chaosRates = {
        ...Object.fromEntries(
            [...listCurrencies].flatMap((currency) => {
                if (exchangeChaos && currency === "divine") return [];
                const rate = toChaos(currency);
                return rate ? [[currency, rate] as const] : [];
            }),
        ),
        ...(exchangeChaos ? exchangeDivine(exchange) : {}),
    };
    /** Each price currency per exchange unit for the value display: stash rates, else the exchange's. */
    const priceRates = {
        ...marketExchangePriceRates(
            exchange.filter((row) => row.current),
            filters.realm,
        ),
        ...(priced.length ? marketPriceRates(rates, game, latestHour) : {}),
    };
    span.setAttributes({
        "market.rows": rows.length,
        "market.history_rows": history.length,
        "market.variants": variants.length,
    });
    return {
        filters,
        seasons,
        season,
        rows: rows.slice(0, pageSize).map((row) => ({
            ...row,
            category: marketCategory(filters.realm, row.baseType, row.signatureKind, row.name),
            baseDescription: row.signatureKind === "base" ? baseDescription(row.baseType) : null,
        })),
        hasMore: rows.length > pageSize,
        variants,
        /** A crafting base market's item class, attributes and level requirement. */
        baseDescription:
            filters.item && filters.kind === "base" ? baseDescription(filters.item) : null,
        /** For a pool unique: each mod's value per mod count, in the display currency. */
        modValues:
            modRows &&
            modPoolValues(
                modRows.flatMap((row) => {
                    const mod = modPoolMod(row.signatureData);
                    if (!mod) return [];
                    const rate = marketDisplayRate(rates, filters.currency, row.hour);
                    const asks = row.current ? mergeMarketPrices(row.prices, rate) : null;
                    return [
                        {
                            ...mod,
                            signatureValue: row.signatureValue,
                            listings: row.current ? row.listingCount : 0,
                            ask: asks?.min ?? null,
                            medianAsk: asks?.median ?? null,
                            sales: row.likelySales,
                            salePrice: mergeMarketPrices(row.salesPrices, rate)?.median ?? null,
                        },
                    ];
                }),
            ),
        /** Exchange-traded items matching the category and search, on the first page only. */
        exchange: exchangeRows,
        exchangeUnit,
        chaosRates,
        priceRates,
        /** The currency `history` prices are in: the game's first price currency. */
        historyUnit,
        history: history.map((row) => {
            const rate = marketDisplayRate(rates, historyUnit, row.hour);
            return {
                ...row,
                merged: mergeMarketPrices(row.prices, rate),
                mergedSales: mergeMarketPrices(row.salesPrices, rate),
                mergedDelisted: mergeMarketPrices(row.delistedPrices, rate),
                priceRates: marketPriceRates(rates, game, row.hour),
            };
        }),
    };
}

/**
 * An item's markets, plus the markets of the same unique in the other identification state.
 * Unidentified uniques are keyed by their art (`unid:<icon>`) and named from identified copies.
 */
async function marketVariants(
    db: TDatabase,
    market: MarketTable,
    scope: SQL | undefined,
    item: string,
) {
    // A mod pool unique's per-mod markets are valued on the item page, not listed as variants.
    const notModMarket = or(
        notInArray(market.signatureKind, [...MOD_POOL_KINDS]),
        eq(market.signatureValue, ""),
    );
    const identities = await traceQuery(
        "market.variant_identities",
        db
            .selectDistinct({
                identified: market.identified,
                name: market.name,
                iconAsset: market.iconAsset,
            })
            .from(market)
            .where(and(scope, eq(market.itemKey, item), eq(market.frameType, 3), notModMarket)),
    );
    const names = new Set(identities.flatMap((row) => row.name ?? []));
    const counterparts = identities.flatMap((row) =>
        row.identified ? (row.iconAsset ? `unid:${row.iconAsset}` : []) : (row.name ?? []),
    );
    const variants = await traceQuery(
        "market.variants",
        db
            .select({
                itemKey: market.itemKey,
                name: max(market.name),
                identified: market.identified,
                corrupted: market.corrupted,
                signatureKind: market.signatureKind,
                signatureValue: market.signatureValue,
                links: market.links,
                signatureData: sql<
                    TStashUniqueHourlyS["signatureData"]
                >`any_value(${market.signatureData})`,
                periodSales: sql<number>`sum(${market.likelySales})`.mapWith(Number),
                latestHour: sql<number>`max(${market.hour})`.mapWith(Number),
            })
            .from(market)
            .where(
                and(
                    scope,
                    inArray(market.itemKey, [...new Set([item, ...counterparts])]),
                    notModMarket,
                ),
            )
            .groupBy(
                market.itemKey,
                market.identified,
                market.corrupted,
                market.signatureKind,
                market.signatureValue,
                market.links,
            )
            // Uniques that share art (e.g. replicas) share one unidentified market, named after only one of them.
            .having(or(eq(market.itemKey, item), inArray(max(market.name), [...names])))
            // Not limited: a cut-off drops the current variant and some of a market's link counts.
            .orderBy(
                desc(sql`sum(${market.likelySales})`),
                asc(market.corrupted),
                asc(market.signatureValue),
                asc(market.links),
            ),
    );
    const latest = await marketVariantLatestRows(db, market, scope, variants);
    const markets = Map.groupBy(variants, (row) =>
        JSON.stringify([
            row.itemKey,
            row.identified,
            row.corrupted,
            row.signatureKind,
            row.signatureValue,
        ]),
    );
    // Each market first merges its link counts (`links` null, as the list shows it), then lists
    // them separately when any copy has 5 or 6 links.
    return [...markets.values()].flatMap((group) => {
        const latestHour = Math.max(...group.map((row) => row.latestHour));
        const merged = {
            ...group[0]!,
            links: null,
            latestHour,
            periodSales: group.reduce((sum, row) => sum + row.periodSales, 0),
        };
        const linked = group.some((row) => row.links > 0);
        return [merged, ...(linked ? group : [])].map((row) => {
            const rows = latest.filter(
                (entry) =>
                    entry.hour === row.latestHour &&
                    marketRowKey(entry, 0) === marketRowKey(row, 0) &&
                    (row.links === null || entry.links === row.links),
            );
            const current = rows.length ? mergeMarketRows(rows) : undefined;
            return {
                ...row,
                prices: current?.prices ?? null,
                listingCount: current?.listingCount ?? 0,
            };
        });
    });
}

/** Each variant's rows in its latest hour in the period, for its price and listings then. */
function marketVariantLatestRows(
    db: TDatabase,
    market: MarketTable,
    scope: SQL | undefined,
    variants: (MarketRowKey & { links: number; latestHour: number })[],
) {
    if (!variants.length) return Promise.resolve([]);
    return traceQuery(
        "market.variant_latest_rows",
        db
            .select()
            .from(market)
            .where(
                and(
                    scope,
                    or(
                        ...variants.map((variant) =>
                            and(
                                eq(market.hour, variant.latestHour),
                                eq(market.itemKey, variant.itemKey),
                                eq(market.identified, variant.identified),
                                eq(market.corrupted, variant.corrupted),
                                eq(market.signatureKind, variant.signatureKind),
                                eq(market.signatureValue, variant.signatureValue),
                                eq(market.links, variant.links),
                            ),
                        ),
                    ),
                ),
            ),
    );
}

/**
 * A pool unique's per-mod markets: its latest listed hour's listings, marked `current`, and every
 * hour with likely sales. That hour is the item's own, since the season's can be a newer exchange
 * hour with no stash rows yet.
 */
async function modPoolRows(
    db: TDatabase,
    filters: MarketFilters,
    item: string,
    scope: SQL | undefined,
    windowStart: number,
) {
    const { market, daily } = marketTables(filters.realm);
    const [listed] = await traceQuery(
        "market.mod_pool_latest",
        db
            .select({
                hour: sql<number>`coalesce(max(${daily.listedHour}), max(${daily.latestHour}))`.mapWith(
                    Number,
                ),
            })
            .from(daily)
            .where(
                and(
                    eq(daily.realm, filters.realm),
                    eq(daily.league, filters.league),
                    gte(daily.day, windowStart),
                    merchantTab(daily),
                    eq(daily.itemKey, item),
                    eq(daily.identified, true),
                    eq(daily.corrupted, filters.corrupted === "true"),
                    eq(daily.signatureKind, filters.kind),
                ),
            ),
    );
    const latestHour = listed?.hour ?? 0;
    const rows = await traceQuery(
        "market.mod_pool",
        db
            .select({
                hour: market.hour,
                signatureValue: market.signatureValue,
                signatureData: market.signatureData,
                listingCount: market.listingCount,
                likelySales: market.likelySales,
                prices: market.prices,
                salesPrices: market.salesPrices,
            })
            .from(market)
            .where(
                and(
                    scope,
                    eq(market.itemKey, item),
                    eq(market.identified, true),
                    eq(market.corrupted, filters.corrupted === "true"),
                    eq(market.signatureKind, filters.kind),
                    ne(market.signatureValue, ""),
                    linksMatch(market, filters),
                    or(eq(market.hour, latestHour), gt(market.likelySales, 0)),
                ),
            ),
    );
    return rows.map((row) => ({ ...row, current: row.hour === latestHour }));
}

/**
 * Seasons of leagues with market features, those the league API still lists first, keeping each
 * group's order.
 */
function activeFirst<T extends { league: string }>(seasons: T[], ended: Set<string>) {
    const tracked = seasons.filter((season) => marketLeagueTracked(season.league));
    return [
        ...tracked.filter((season) => !ended.has(season.league)),
        ...tracked.filter((season) => ended.has(season.league)),
    ];
}

/**
 * Each league with stash listings, with its first and latest hours, newest first.
 * Reads the hour coverage rollup, so hourly rows moved out of the database keep their season.
 */
function marketStashSeasons(db: TDatabase, realm: string) {
    const { hourCoverage } = marketTables(realm);
    return traceQuery(
        "market.seasons",
        db
            .select({
                league: hourCoverage.league,
                firstHour: min(hourCoverage.hour),
                latestHour: max(hourCoverage.hour),
            })
            .from(hourCoverage)
            .where(and(eq(hourCoverage.stream, "uniques"), eq(hourCoverage.realm, realm)))
            .groupBy(hourCoverage.stream, hourCoverage.realm, hourCoverage.league)
            .orderBy(desc(max(hourCoverage.hour))),
    );
}

/** `marketExchangeSeasons` with leagues the league API still lists first. */
async function activeExchangeSeasons(db: TDatabase, realm: string, latestHour: number) {
    const [seasons, ended] = await Promise.all([
        marketExchangeSeasons(db, realm, latestHour),
        endedStashLeagues(db, realm),
    ]);
    return activeFirst(seasons, ended).map((season) => ({
        league: season.league,
        firstHour: Number(season.firstHour),
        latestHour: Number(season.latestHour),
    }));
}

/**
 * Each league with exchange snapshots by `latestHour`, with its first and latest hours,
 * newest first. Leagues sharing the latest hour put the most snapshots first.
 * Reads the hour coverage rollup: grouping the hourly table scans every snapshot of the realm.
 */
function marketExchangeSeasons(db: TDatabase, realm: string, latestHour: number) {
    const { hourCoverage } = marketTables(realm);
    return traceQuery(
        "market.exchange_seasons",
        db
            .select({
                league: hourCoverage.league,
                firstHour: min(hourCoverage.hour),
                latestHour: max(hourCoverage.hour),
            })
            .from(hourCoverage)
            .where(
                and(
                    eq(hourCoverage.stream, "currency"),
                    eq(hourCoverage.realm, realm),
                    lte(hourCoverage.hour, latestHour),
                ),
            )
            .groupBy(hourCoverage.stream, hourCoverage.realm, hourCoverage.league)
            .orderBy(desc(max(hourCoverage.hour)), desc(sum(hourCoverage.rowCount))),
    );
}

/** Exchange snapshots of the hours in [from, to], optionally of some markets only. */
function exchangeSnapshots(
    db: TDatabase,
    scope: { realm: string; league: string },
    [fromHour, toHour]: [number, number],
    marketIds?: string[],
) {
    const { currencyHourly } = marketTables(scope.realm);
    return traceQuery(
        fromHour === toHour ? "market.exchange" : "market.exchange_history",
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
                    eq(currencyHourly.realm, scope.realm),
                    eq(currencyHourly.league, scope.league),
                    fromHour === toHour
                        ? eq(currencyHourly.hour, fromHour)
                        : and(gte(currencyHourly.hour, fromHour), lte(currencyHourly.hour, toHour)),
                    marketIds ? inArray(currencyHourly.marketId, marketIds) : undefined,
                ),
            ),
    ).then((rows) => rows.map((row) => exchangeSnapshotSchema.parse(row)));
}

/** Exchange markets' daily totals with trades from `fromDay`, optionally of some markets only. */
function exchangeDaily(
    db: TDatabase,
    scope: { realm: string; league: string },
    fromDay: number,
    marketIds?: string[],
) {
    const { currencyDaily } = marketTables(scope.realm);
    return traceQuery(
        "market.exchange_daily",
        db
            .select({
                marketId: currencyDaily.marketId,
                day: currencyDaily.day,
                firstVolume: currencyDaily.firstVolume,
                secondVolume: currencyDaily.secondVolume,
                tradedHours: currencyDaily.tradedHours,
                latestHour: currencyDaily.latestHour,
            })
            .from(currencyDaily)
            .where(
                and(
                    eq(currencyDaily.realm, scope.realm),
                    eq(currencyDaily.league, scope.league),
                    gte(currencyDaily.day, fromDay),
                    gt(currencyDaily.firstVolume, 0),
                    marketIds ? inArray(currencyDaily.marketId, marketIds) : undefined,
                ),
            ),
    );
}

/** The first day of the exchange list's trailing days. */
function exchangeWindowStart(latestHour: number) {
    return utcDay(latestHour) - (MARKET_EXCHANGE_DAYS - 1) * 86400;
}

/** Units of each item traded on some exchange markets in each hour from `fromHour`. */
function exchangeHourlyVolumes(
    db: TDatabase,
    scope: { realm: string; league: string },
    [fromHour, toHour]: [number, number],
    marketIds: string[],
) {
    if (!marketIds.length) return Promise.resolve([]);
    const { currencyHourly } = marketTables(scope.realm);
    return traceQuery(
        "market.exchange_recent_volume",
        db
            .select({
                marketId: currencyHourly.marketId,
                hour: currencyHourly.hour,
                volumeTraded: currencyHourly.volumeTraded,
            })
            .from(currencyHourly)
            .where(
                and(
                    eq(currencyHourly.realm, scope.realm),
                    eq(currencyHourly.league, scope.league),
                    inArray(currencyHourly.marketId, marketIds),
                    gte(currencyHourly.hour, fromHour),
                    lte(currencyHourly.hour, toHour),
                ),
            ),
    ).then((rows) =>
        rows.map((row) =>
            exchangeSnapshotSchema
                .pick({ marketId: true, hour: true, volumeTraded: true })
                .parse(row),
        ),
    );
}

/**
 * Rows for every item on the listed markets, priced in the realm's exchange unit. Items `shown`
 * accepts carry their recent traded units; the others carry zeros.
 */
async function marketExchange(
    db: TDatabase,
    scope: { realm: string; league: string },
    latestHour: number,
    markets: ExchangeMarket[],
    shown: (item: { name: string; category: string }) => boolean,
) {
    const listed = [...new Set(markets.flatMap((row) => row.marketId.split("|")))];
    const describe = (itemId: string) => marketExchangeItem(scope.realm, itemId);
    const charted = new Set(
        listed.filter((itemId) => {
            const item = describe(itemId);
            return item !== undefined && shown(item);
        }),
    );
    const [snapshots, days, hourly] = await Promise.all([
        exchangeSnapshots(db, scope, [latestHour, latestHour]),
        exchangeDaily(db, scope, exchangeWindowStart(latestHour)),
        exchangeHourlyVolumes(
            db,
            scope,
            [latestHour - (MARKET_EXCHANGE_RECENT_HOURS - 1) * 3600, latestHour],
            markets
                .map((row) => row.marketId)
                .filter((id) => id.split("|").some((itemId) => charted.has(itemId))),
        ),
    ]);
    const past = days.filter((row) => row.day <= latestHour);
    const volumes = marketExchangeRecentVolume(hourly, past, latestHour, charted);
    return marketExchangeRows(
        snapshots,
        past,
        latestHour,
        describe,
        listed,
        Math.min(...markets.map((row) => row.firstHour)),
        marketExchangeUnit(scope.realm),
    ).map((row) => ({
        ...row,
        recentVolume: volumes.get(row.itemId) ?? marketExchangeNoRecentVolume(),
    }));
}

// Exchange rows need a divine rate even on pages without stash listings. Stash prices convert
// only at a divine rate from the latest hour, not from an earlier day.
function exchangeDivine(rows: MarketExchangeRow[]): Record<string, number> {
    const divine = rows.find((row) => row.itemId === DIVINE && row.current)?.price;
    return divine ? { divine } : {};
}

/** Pairs whose hourly history an exchange item page reads, besides its chaos, divine and exalted pairs. */
const EXCHANGE_HISTORY_PAIRS = 8;

/**
 * Markets of `itemIds` and the `anchor` markets of the items they trade against (and of the
 * `priced` currencies, which the page values are shown in).
 */
function exchangeItemMarkets(
    markets: string[][],
    itemIds: string[],
    anchor: string,
    priced: string[],
) {
    const items = new Set(itemIds);
    const own = (ids: string[]) => ids.some((id) => items.has(id));
    const counterparts = new Set(markets.flatMap((ids) => (own(ids) ? ids : [])));
    for (const id of priced) counterparts.add(id);
    return markets
        .filter(
            (ids) =>
                own(ids) ||
                (ids.includes(anchor) && ids.some((id) => id !== anchor && counterparts.has(id))),
        )
        .map((ids) => ids.join("|"));
}

/**
 * Prices of some exchange items in the realm's exchange unit, as the market list gives them: the
 * latest hour's trades, or else the newest of the last MARKET_EXCHANGE_DAYS days that traded.
 * Items without a usable path have a null price.
 */
export function getMarketExchangePrices(
    db: TDatabase,
    input: { realm: string; league: string; itemIds: string[] },
) {
    return traceSpan("market.exchange_prices", async () => {
        const latestHour = marketObservationRange().latestHour;
        const scope = { realm: input.realm, league: input.league };
        const unit = marketExchangeUnit(input.realm);
        const markets = (await marketExchangeMarkets(db, scope, latestHour)).map((row) =>
            row.marketId.split("|"),
        );
        const marketIds = exchangeItemMarkets(
            markets,
            input.itemIds,
            marketExchangeUnitId(unit),
            [],
        );
        const [snapshots, days] = marketIds.length
            ? await Promise.all([
                  exchangeSnapshots(db, scope, [latestHour, latestHour], marketIds),
                  exchangeDaily(db, scope, exchangeWindowStart(latestHour), marketIds),
              ])
            : [[], []];
        const rows = marketExchangeRows(
            snapshots,
            days.filter((row) => row.day <= latestHour),
            latestHour,
            (itemId) => marketExchangeItem(input.realm, itemId),
            input.itemIds,
            0,
            unit,
        );
        const prices = new Map(
            rows.flatMap((row) =>
                row.price === null || row.hour === null
                    ? []
                    : [[row.itemId, { price: row.price, hour: row.hour }] as const],
            ),
        );
        return { latestHour, unit, prices };
    });
}

/** Public leagues with exchange snapshots, active leagues first, then the most recently traded. */
export async function getMarketExchangeLeagues(db: TDatabase, realm: string) {
    const seasons = await activeExchangeSeasons(db, realm, marketObservationRange().latestHour);
    return seasons.map((season) => season.league);
}

/**
 * One exchange item: its list row (latest-hour or newest-day price, trend, volume and most
 * traded pair) and its hourly history over the period, priced in the realm's exchange unit. The
 * history reads the item's most traded pairs (always its chaos, divine and exalted pairs) and the
 * exchange unit's markets that convert them.
 */
export function getMarketExchangeItem(db: TDatabase, input: MarketExchangeItemInput) {
    return traceSpan("market.exchange_item", async () => {
        const latestHour = marketObservationRange().latestHour;
        const seasons = await activeExchangeSeasons(db, input.realm, latestHour);
        const league = input.league || seasons[0]?.league || "";
        const scope = { realm: input.realm, league };
        const unit = marketExchangeUnit(input.realm);
        const anchor = marketExchangeUnitId(unit);
        const describe = (itemId: string) => marketExchangeItem(input.realm, itemId);
        const listed = league ? await marketExchangeMarkets(db, scope, latestHour) : [];
        const markets = listed.map((row) => row.marketId.split("|"));
        const priced = marketPriceCurrencyIds(input.realm);
        const marketIds = exchangeItemMarkets(markets, [input.itemId], anchor, priced);
        const historyStart = latestHour - Number(input.days) * 86400 + 3600;
        const [snapshots, days] = marketIds.length
            ? await Promise.all([
                  exchangeSnapshots(db, scope, [latestHour, latestHour], marketIds),
                  exchangeDaily(
                      db,
                      scope,
                      Math.min(utcDay(historyStart), exchangeWindowStart(latestHour)),
                      marketIds,
                  ),
              ])
            : [[], []];
        const past = days.filter((row) => row.day <= latestHour);
        const rows = marketExchangeRows(
            snapshots,
            past.filter((row) => row.day >= exchangeWindowStart(latestHour)),
            latestHour,
            describe,
            [...new Set([input.itemId, ...priced])],
            Math.min(...listed.map((row) => row.firstHour)),
            unit,
        );
        const units = new Map<string, number>();
        for (const row of past) {
            const ids = row.marketId.split("|");
            if (!ids.includes(input.itemId)) continue;
            const traded = ids[0] === input.itemId ? row.firstVolume : row.secondVolume;
            units.set(row.marketId, (units.get(row.marketId) ?? 0) + traded);
        }
        // Every pair of chaos, divine or exalted includes itself, so it must not count as an anchor.
        const always = [CHAOS, DIVINE, EXALTED].filter((id) => id !== input.itemId);
        const pairs = markets
            .filter((ids) => ids.includes(input.itemId))
            .map((ids) => ids.join("|"))
            .sort((a, b) => (units.get(b) ?? 0) - (units.get(a) ?? 0));
        const kept = [
            ...pairs.filter((id) => always.some((anchor) => id.split("|").includes(anchor))),
            ...pairs
                .filter((id) => !always.some((anchor) => id.split("|").includes(anchor)))
                .slice(0, EXCHANGE_HISTORY_PAIRS),
        ].map((id) => id.split("|"));
        const historyIds = exchangeItemMarkets(
            [...kept, ...markets.filter((ids) => !ids.includes(input.itemId))],
            [input.itemId],
            anchor,
            priced,
        );
        const history = historyIds.length
            ? await exchangeSnapshots(db, scope, [historyStart, latestHour], historyIds)
            : [];
        const described = describe(input.itemId);
        return {
            realm: input.realm,
            league,
            seasons,
            latestHour,
            historyStart,
            unit,
            item: described ? (rows.find((row) => row.itemId === input.itemId) ?? null) : null,
            divine: rows.find((row) => row.itemId === DIVINE)?.price ?? null,
            priceRates: marketExchangePriceRates(rows, input.realm),
            history: marketExchangeHistory(history, input.itemId, describe, unit),
        };
    });
}

/**
 * The PoE 2 market: every item on the season's exchange markets, priced in exalted, matching the
 * category and search, dearest first. An empty league reads the season that traded most recently.
 */
export function getPoe2MarketExchange(db: TDatabase, input: Poe2MarketFilters) {
    return traceSpan("market.poe2_exchange", async (span) => {
        const realm = "poe2";
        const latestHour = marketObservationRange().latestHour;
        const seasons = await activeExchangeSeasons(db, realm, latestHour);
        const filters = { ...input, league: input.league || seasons[0]?.league || "" };
        const season = seasons.find((entry) => entry.league === filters.league);
        const scope = { realm, league: filters.league };
        const markets = season ? await marketExchangeMarkets(db, scope, latestHour) : [];
        const rows = markets.length
            ? await marketExchange(db, scope, latestHour, markets, (item) =>
                  exchangeMatch(item, filters.category, filters.q),
              )
            : [];
        const matches = exchangeSearch(rows, filters.category, filters.q);
        span.setAttributes({
            "market.league": filters.league,
            "market.category": filters.category,
            "market.search": Boolean(filters.q),
            "market.exchange_rows": matches.length,
        });
        return {
            filters,
            seasons,
            season,
            unit: marketExchangeUnit(realm),
            divine: rows.find((row) => row.itemId === DIVINE)?.price ?? null,
            priceRates: marketExchangePriceRates(rows, realm),
            rows: matches,
        };
    });
}

type ExchangeMarket = { marketId: string; firstHour: number };

/** Every exchange market of a league observed by `latestHour`, with its first hour. */
function marketExchangeMarkets(
    db: TDatabase,
    scope: { realm: string; league: string },
    latestHour: number,
    label = "market.exchange_markets",
): Promise<ExchangeMarket[]> {
    const { currencyMarket } = marketTables(scope.realm);
    return traceQuery(
        label,
        db
            .select({ marketId: currencyMarket.marketId, firstHour: currencyMarket.firstHour })
            .from(currencyMarket)
            .where(
                and(
                    eq(currencyMarket.realm, scope.realm),
                    eq(currencyMarket.league, scope.league),
                    lte(currencyMarket.firstHour, latestHour),
                ),
            ),
    );
}

/** Whether the market list shows exchange items, which it does on its first page only. */
function exchangeListed(filters: MarketFilters) {
    return !(
        filters.page > 1 ||
        filters.identification === "false" ||
        filters.corruption === "true"
    );
}

function exchangeMatches<Row extends MarketExchangeRow>(rows: Row[], filters: MarketFilters) {
    if (!exchangeListed(filters)) return [];
    return exchangeSearch(rows, filters.category, filters.q);
}

/** Whether an exchange item is in the category and its name contains `q`. */
function exchangeMatch(item: { name: string; category: string }, category: string, q: string) {
    return (
        (category === "all" || item.category === category) &&
        (!q || item.name.toLowerCase().includes(q.toLowerCase()))
    );
}

/** Rows in the category whose name contains `q`, dearest first. */
function exchangeSearch<Row extends MarketExchangeRow>(rows: Row[], category: string, q: string) {
    return rows
        .filter((row) => exchangeMatch(row, category, q))
        .sort(
            (a, b) =>
                (b.price ?? Number.NEGATIVE_INFINITY) - (a.price ?? Number.NEGATIVE_INFINITY) ||
                a.name.localeCompare(b.name),
        );
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

/** Chaos per unit of the selected currency at the hour, to state locked chaos prices in it. */
async function marketDisplayCurrencyRate(
    db: TDatabase,
    filters: Pick<MarketFilters, "realm" | "league" | "currency">,
    hour: number,
) {
    const rates = await marketChaosRates(db, filters, [], [hour]);
    return marketDisplayRate(rates, "chaos", hour)(filters.currency);
}

async function marketChaosRates(
    db: TDatabase,
    filters: Pick<MarketFilters, "realm" | "league" | "currency">,
    observations: (Pick<TStashUniqueHourlyS, "prices" | "salesPrices"> &
        Partial<Pick<TStashUniqueHourlyS, "delistedPrices">>)[],
    hours: number[],
) {
    if (!hours.length) return new Map<number, Map<string, number>>();
    const currencies = [
        ...new Set([
            filters.currency,
            "divine",
            ...MARKET_PRICE_CURRENCIES[marketGame(filters.realm)],
            ...observations.flatMap((row) => [
                ...Object.keys(row.prices ?? {}),
                ...Object.keys(row.salesPrices ?? {}),
                ...Object.keys(row.delistedPrices ?? {}),
            ]),
        ]),
    ];
    const snapshots = await traceQuery(
        "market.rates",
        marketRateSnapshots(db, filters, currencies, hours),
        { "market.currencies": currencies.length },
    );
    return chaosRatesByHour(
        snapshots.map((row) => exchangeSnapshotSchema.parse(row)),
        currencies,
    );
}
