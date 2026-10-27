import {
    exchangeCurrencyId,
    exchangeSnapshotSchema,
    marketObservationRange,
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
    notInArray,
    or,
    type SQL,
    type SQLWrapper,
    sql,
} from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashCurrencyHourly as currencyHourly } from "~/db/schema/stash.currency-hourly";
import { tStashCurrencyMarket as currencyMarket } from "~/db/schema/stash.currency-market";
import { tStashMarketDaily as daily } from "~/db/schema/stash.market-daily";
import {
    tStashUniqueHourly as market,
    type TStashUniqueHourlyS,
} from "~/db/schema/stash.unique-hourly";
import { marketCategory, marketCategoryFilter } from "~/lib/market-categories.server";
import { type MarketExchangeRow, marketExchangeRows } from "~/lib/market-exchange";
import { marketExchangeItem } from "~/lib/market-exchange.server";
import {
    chaosRatesByHour,
    MARKET_RATE_MAX_AGE,
    marketDisplayRate,
    marketGame,
    marketRatePairs,
    mergeMarketPrices,
    mergeMarketRows,
} from "~/lib/market-price-merge";
import {
    isModPool,
    MOD_POOL_KINDS,
    modPoolMods,
    modPoolValues,
    parseModList,
} from "~/lib/mod-pools";
import type { MarketFilters, MarketOrder } from "~/schemas/market";
import { type Span, traceQuery, traceSpan } from "~/services/tracing.server";
import { utcDay } from "./stash-rollups.queries";

const PAGE_SIZE = 50;
const DIVINE = exchangeCurrencyId("divine")!;
/** -1 for non-foil rows and 0 for every foil variation, which trade as one market. */
const foilGroup = sql<number>`least(${market.foilVariation}, 0)`;

function foilMatch(foil: number) {
    return foil < 0 ? eq(market.foilVariation, -1) : gte(market.foilVariation, 0);
}

/**
 * A pool unique's mod combinations merge into one market with an empty value where markets are
 * listed (the market list and the item's variants); the item page values and links the combinations.
 */
function valueGroup(table: typeof market) {
    return sql<string>`case when ${inArray(table.signatureKind, [...MOD_POOL_KINDS])} then '' else ${table.signatureValue} end`;
}

function valueMatch(kind: string, value: string) {
    return isModPool(kind) && !value ? undefined : eq(market.signatureValue, value);
}

/** Clears the representative combination from a pool unique's merged every-combination row. */
function asMarket<Row extends { signatureValue: string; signatureData: unknown }>(
    row: Row,
    kind: string,
    value: string,
): Row {
    return isModPool(kind) && !value ? { ...row, signatureValue: "", signatureData: null } : row;
}

type MarketRowKey = Pick<
    TStashUniqueHourlyS,
    "itemKey" | "identified" | "corrupted" | "foilVariation" | "signatureKind" | "signatureValue"
>;

function marketRowKey(row: MarketRowKey, hour: number) {
    return JSON.stringify([
        hour,
        row.itemKey,
        Boolean(row.identified),
        Boolean(row.corrupted),
        Math.min(row.foilVariation, 0),
        row.signatureKind,
        isModPool(row.signatureKind) ? "" : row.signatureValue,
    ]);
}

/** One row per hour, merging the foil variations of a foil market (and a pool unique's combinations). */
function mergeByHour(rows: TStashUniqueHourlyS[], filters: MarketFilters) {
    const hours = Map.groupBy(rows, (row) => row.hour);
    return [...hours.values()]
        .map((group) => ({
            ...asMarket(mergeMarketRows(group), filters.kind, filters.value),
            foilVariation: filters.foil,
        }))
        .sort((a, b) => a.hour - b.hour);
}

/** Each listed market's latest-hour row, merged across its foil variations, in list order. */
async function marketLatestRows<
    Market extends MarketRowKey & {
        latestHour: number;
        periodSales: number;
        periodRemovals: number;
        periodPending: number;
    },
>(db: TDatabase, filters: MarketFilters, markets: Market[]) {
    if (!markets.length) return [];
    const rows = await traceQuery(
        "market.latest_rows",
        db
            .select()
            .from(market, { forceIndex: "PRIMARY" })
            .where(
                and(
                    eq(market.realm, filters.realm),
                    eq(market.league, filters.league),
                    or(
                        ...markets.map((entry) =>
                            and(
                                eq(market.hour, entry.latestHour),
                                eq(market.itemKey, entry.itemKey),
                                eq(market.identified, entry.identified),
                                eq(market.corrupted, entry.corrupted),
                                foilMatch(entry.foilVariation),
                                eq(market.signatureKind, entry.signatureKind),
                                valueMatch(entry.signatureKind, entry.signatureValue),
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
                ...asMarket(mergeMarketRows(group), entry.signatureKind, entry.signatureValue),
                foilVariation: entry.foilVariation,
                rank: 1,
                periodSales: entry.periodSales,
                periodRemovals: entry.periodRemovals,
                periodPending: entry.periodPending,
            },
        ];
    });
}

type MarketView = "all" | "list" | "history";

export function getMarketData(db: TDatabase, input: MarketFilters, view: MarketView = "all") {
    return traceSpan("market.data", (span) => readMarketData(db, input, view, span));
}

async function readMarketData(db: TDatabase, input: MarketFilters, view: MarketView, span: Span) {
    const exchangeHour = marketObservationRange().latestHour;
    const [stashSeasons, exchangeSeasons] = await Promise.all([
        // Group by the full index prefix so MySQL can skip between season boundaries.
        traceQuery(
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
        ),
        traceQuery(
            "market.exchange_seasons",
            db
                .select({
                    league: currencyHourly.league,
                    firstHour: min(currencyHourly.hour),
                    latestHour: max(currencyHourly.hour),
                })
                .from(currencyHourly)
                .where(
                    and(
                        eq(currencyHourly.realm, input.realm),
                        lte(currencyHourly.hour, exchangeHour),
                    ),
                )
                .groupBy(currencyHourly.realm, currencyHourly.league),
        ),
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
    const seasons = [...byLeague.values()].sort(
        (a, b) => Number(b.latestHour) - Number(a.latestHour),
    );
    // Foil variations merge into one market, so any foil variation selects all of them.
    const filters = {
        ...input,
        league: input.league || seasons[0]?.league || "",
        foil: Math.min(input.foil, 0),
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
        "market.rarity": filters.rarity,
        "market.identification": filters.identification,
        "market.corruption": filters.corruption,
        "market.search": Boolean(filters.q),
        "market.item": Boolean(filters.item),
    });
    const season = seasons.find((entry) => entry.league === filters.league);
    const latestHour = Number(season?.latestHour ?? 0);
    // Windows start at UTC midnight so lists sum whole days of `stash_market_daily`.
    const windowStart = utcDay(latestHour - Number(filters.days) * 86400 + 3600);
    const scope = and(
        eq(market.realm, filters.realm),
        eq(market.league, filters.league),
        gte(market.hour, windowStart),
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
                              foilMatch(filters.foil),
                              eq(market.signatureKind, filters.kind),
                              valueMatch(filters.kind, filters.value),
                          ),
                      )
                      .orderBy(desc(market.hour))
                      // 90 days of hours for up to 16 merged foil variations.
                      .limit(2160 * 16),
              ).then((rows) => mergeByHour(rows, filters))
            : Promise.resolve([]);
    const variantsPromise =
        filters.item && view !== "list"
            ? marketVariants(db, scope, filters.item)
            : Promise.resolve([]);
    const modRowsPromise =
        filters.item && view !== "list" && isModPool(filters.kind)
            ? modPoolRows(db, filters, filters.item, scope, latestHour)
            : Promise.resolve(null);
    // Items listed on the exchange are priced from it; the rows query leaves out their stash listings.
    const listed =
        season && view !== "history" ? await marketExchangeListed(db, filters, exchangeHour) : [];
    const exchangeNames = [
        ...new Set(listed.flatMap((id) => marketExchangeItem(filters.realm, id)?.name ?? [])),
    ];
    const days = and(
        eq(daily.realm, filters.realm),
        eq(daily.league, filters.league),
        gte(daily.day, windowStart),
    );
    const dailyFoilGroup = sql<number>`least(${daily.foilVariation}, 0)`;
    const search = filters.q ? `%${filters.q.replace(/[\\%_]/g, "\\$&")}%` : undefined;
    const currencyField = (field: string) =>
        sql`cast(json_unquote(json_extract(${market.prices}, ${`$.${JSON.stringify(filters.currency)}.${field}`})) as decimal(30, 10))`;
    // A merged foil market orders by its variations' listing-weighted median.
    const price = sql`sum(${currencyField("median")} * ${currencyField("count")}) / sum(${currencyField("count")})`;
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
    const rarity = { normal: 0, magic: 1, rare: 2, unique: 3 };
    const grouped = db
        .select({
            itemKey: daily.itemKey,
            identified: daily.identified,
            corrupted: daily.corrupted,
            foilVariation: dailyFoilGroup.mapWith(Number).as("foil_group"),
            signatureKind: daily.signatureKind,
            // Already empty for a mod pool unique's every-combination market.
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
                marketCategoryFilter(filters, daily.baseType),
                filters.rarity === "all" ? undefined : eq(daily.frameType, rarity[filters.rarity]),
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
            dailyFoilGroup,
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
            asc(dailyFoilGroup),
            asc(daily.signatureKind),
            asc(daily.signatureValue),
        ])
        .$dynamic();
    if (!pageLatestRows) grouped.limit(PAGE_SIZE + 1).offset((filters.page - 1) * PAGE_SIZE);
    const page = grouped.as("page");
    // One row per market: its latest hour's totals across the foil variations it merges.
    const marketsQuery = db
        .select({
            itemKey: page.itemKey,
            identified: page.identified,
            corrupted: page.corrupted,
            foilVariation: page.foilVariation,
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
                eq(market.itemKey, page.itemKey),
                eq(market.identified, page.identified),
                eq(market.corrupted, page.corrupted),
                eq(foilGroup, page.foilVariation),
                eq(market.signatureKind, page.signatureKind),
                eq(valueGroup(market), page.signatureValue),
            ),
        )
        .groupBy(
            page.itemKey,
            page.identified,
            page.corrupted,
            page.foilVariation,
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
            asc(page.foilVariation),
            asc(page.signatureKind),
            asc(page.signatureValue),
        )
        .$dynamic();
    if (pageLatestRows) marketsQuery.limit(PAGE_SIZE + 1).offset((filters.page - 1) * PAGE_SIZE);
    const rowsPromise =
        view === "history"
            ? Promise.resolve([])
            : traceQuery("market.rows", marketsQuery, {
                  "market.page_latest_rows": pageLatestRows,
                  "market.window_start": windowStart,
              }).then((markets) => marketLatestRows(db, filters, markets));
    const [rows, history, variants, exchange, modRows] = await Promise.all([
        rowsPromise,
        historyPromise,
        variantsPromise,
        listed.length ? marketExchange(db, filters, exchangeHour, listed) : [],
        modRowsPromise,
    ]);
    const rates = await marketChaosRates(
        db,
        filters,
        [...history, ...rows, ...(modRows ?? [])],
        [
            ...history.map((row) => row.hour),
            ...(rows.length ? [latestHour] : []),
            ...(modRows ?? []).map((row) => row.hour),
        ],
    );
    const toChaos = marketDisplayRate(rates, "chaos", latestHour);
    const listCurrencies = rows.length
        ? new Set(["divine", ...rows.flatMap((row) => Object.keys(row.prices ?? {}))])
        : [];
    const exchangeRows = exchangeMatches(exchange, filters);
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
        /** For a pool unique's variant: each mod's value, in the display currency. */
        modValues:
            modRows &&
            modPoolValues(
                modRows.flatMap((row) => {
                    const mods = modPoolMods(row.signatureData);
                    if (!mods) return [];
                    const rate = marketDisplayRate(rates, filters.currency, row.hour);
                    const current = row.hour === latestHour;
                    return [
                        {
                            signatureValue: row.signatureValue,
                            mods,
                            listings: current ? row.listingCount : 0,
                            ask: current
                                ? (mergeMarketPrices(row.prices, rate)?.min ?? null)
                                : null,
                            sales: row.likelySales,
                            salePrice: mergeMarketPrices(row.salesPrices, rate)?.median ?? null,
                        },
                    ];
                }),
                { require: parseModList(filters.mods), anyOf: parseModList(filters.anyMods) },
            ),
        /** Exchange-traded items matching the category and search, on the first page only. */
        exchange: exchangeRows,
        /** Chaos per unit of each listing currency on the page, at the season's latest hour. */
        chaosRates: {
            ...Object.fromEntries(
                [...listCurrencies].flatMap((currency) => {
                    if (exchangeRows.length && currency === "divine") return [];
                    const rate = toChaos(currency);
                    return rate ? [[currency, rate] as const] : [];
                }),
            ),
            ...(exchangeRows.length ? exchangeDivine(exchange) : {}),
        },
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

/**
 * An item's markets, plus the markets of the same unique in the other identification state.
 * Unidentified uniques are keyed by their art (`unid:<icon>`) and named from identified copies.
 */
async function marketVariants(db: TDatabase, scope: SQL | undefined, item: string) {
    const identities = await traceQuery(
        "market.variant_identities",
        db
            .selectDistinct({
                identified: market.identified,
                name: market.name,
                iconAsset: market.iconAsset,
            })
            .from(market)
            .where(and(scope, eq(market.itemKey, item), eq(market.frameType, 3))),
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
                foilVariation: foilGroup.mapWith(Number),
                signatureKind: market.signatureKind,
                signatureValue: valueGroup(market),
                signatureData: sql<
                    TStashUniqueHourlyS["signatureData"]
                >`any_value(${market.signatureData})`,
                periodSales: sql<number>`sum(${market.likelySales})`.mapWith(Number),
            })
            .from(market)
            .where(and(scope, inArray(market.itemKey, [...new Set([item, ...counterparts])])))
            .groupBy(
                market.itemKey,
                market.identified,
                market.corrupted,
                foilGroup,
                market.signatureKind,
                valueGroup(market),
            )
            .orderBy(
                desc(sql`sum(${market.likelySales})`),
                asc(market.corrupted),
                asc(foilGroup),
                asc(valueGroup(market)),
            )
            .limit(100),
    );
    // Uniques that share art (e.g. replicas) share one unidentified market, named after only one of them.
    return variants
        .filter((row) => row.itemKey === item || (row.name !== null && names.has(row.name)))
        .map((row) => asMarket(row, row.signatureKind, row.signatureValue));
}

/** A pool unique variant's sibling combinations: the latest hour's listings and every hour with likely sales. */
function modPoolRows(
    db: TDatabase,
    filters: MarketFilters,
    item: string,
    scope: SQL | undefined,
    latestHour: number,
) {
    return traceQuery(
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
                    foilMatch(filters.foil),
                    eq(market.signatureKind, filters.kind),
                    or(eq(market.hour, latestHour), gt(market.likelySales, 0)),
                ),
            ),
    );
}

/** Items on any retained exchange market observed by `latestHour`. */
async function marketExchangeListed(db: TDatabase, filters: MarketFilters, latestHour: number) {
    const markets = await traceQuery(
        "market.exchange_listed",
        db
            .select({ marketId: currencyMarket.marketId })
            .from(currencyMarket)
            .where(
                and(
                    eq(currencyMarket.realm, filters.realm),
                    eq(currencyMarket.league, filters.league),
                    lte(currencyMarket.firstHour, latestHour),
                ),
            ),
    );
    return [...new Set(markets.flatMap((row) => row.marketId.split("|")))];
}

async function marketExchange(
    db: TDatabase,
    filters: MarketFilters,
    latestHour: number,
    listed: string[],
) {
    const snapshots = await traceQuery(
        "market.exchange",
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
                    eq(currencyHourly.hour, latestHour),
                ),
            ),
    );
    return marketExchangeRows(
        snapshots.map((row) => exchangeSnapshotSchema.parse(row)),
        latestHour,
        (itemId) => marketExchangeItem(filters.realm, itemId),
        listed,
    );
}

// Exchange rows need a divine rate even on pages without stash listings.
function exchangeDivine(rows: MarketExchangeRow[]): Record<string, number> {
    const divine = rows.find((row) => row.itemId === DIVINE)?.chaos;
    return divine ? { divine } : {};
}

function exchangeMatches(rows: MarketExchangeRow[], filters: MarketFilters) {
    if (
        filters.page > 1 ||
        filters.rarity !== "all" ||
        filters.identification === "false" ||
        filters.corruption === "true"
    )
        return [];
    const search = filters.q.toLowerCase();
    return rows
        .filter(
            (row) =>
                (filters.category === "all" || row.category === filters.category) &&
                (!search || row.name.toLowerCase().includes(search)),
        )
        .sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name));
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

async function marketChaosRates(
    db: TDatabase,
    filters: MarketFilters,
    observations: Pick<TStashUniqueHourlyS, "prices" | "salesPrices">[],
    hours: number[],
) {
    if (!hours.length) return new Map<number, Map<string, number>>();
    const currencies = [
        ...new Set([
            filters.currency,
            "divine",
            ...observations.flatMap((row) => [
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
                    inArray(
                        currencyHourly.marketId,
                        marketRatePairs(currencies, marketGame(filters.realm)),
                    ),
                    gte(currencyHourly.hour, Math.min(...hours) - MARKET_RATE_MAX_AGE),
                    lte(currencyHourly.hour, Math.max(...hours)),
                ),
            ),
        { "market.currencies": currencies.length },
    );
    return chaosRatesByHour(
        snapshots.map((row) => exchangeSnapshotSchema.parse(row)),
        currencies,
    );
}
