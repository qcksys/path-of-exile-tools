import {
    exchangeCurrencyId,
    exchangeSnapshotSchema,
    gemVariantValues,
    marketObservationRange,
    TRANSFIGURED_GEMS,
    VAAL_GEMS,
} from "@poe-tools/market";
import {
    and,
    asc,
    count,
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
    notLike,
    or,
    type SQL,
    type SQLWrapper,
    sql,
} from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { stashGame } from "~/db/helpers/stash-game";
import { tStashCurrencyDaily } from "~/db/schema/stash.currency-daily";
import { tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import { tStashCurrencyMarket } from "~/db/schema/stash.currency-market";
import { tStashMarketDaily } from "~/db/schema/stash.market-daily";
import { type TStashUniqueHourlyS, tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";
import { rankMarketBases } from "~/lib/market-bases";
import { isMarketBaseCategory } from "~/lib/market-categories";
import { marketCategory, marketCategoryFilter } from "~/lib/market-categories.server";
import {
    MARKET_EXCHANGE_DAYS,
    type MarketExchangeRow,
    marketExchangeHistory,
    marketExchangePriceRates,
    marketExchangeRows,
    marketExchangeUnit,
    marketExchangeUnitId,
    marketPriceCurrencyIds,
} from "~/lib/market-exchange";
import { marketExchangeItem } from "~/lib/market-exchange.server";
import { MARKET_PRICE_CURRENCIES } from "~/lib/market-price-currencies";
import {
    chaosRatesByHour,
    MARKET_RATE_MAX_AGE,
    marketDisplayRate,
    marketGame,
    marketPriceRates,
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
import {
    type MarketBaseInput,
    type MarketExchangeItemInput,
    type MarketFilters,
    type MarketOrder,
    marketCorruption,
    marketIdentification,
    type Poe2MarketFilters,
} from "~/schemas/market";
import { type Span, traceQuery, traceSpan } from "~/services/tracing.server";
import {
    baseSeasonLatestHour,
    latestBaseSeason,
    marketBase,
    marketBaseHistory,
    marketBaseIds,
    marketBaseRows,
} from "./market-bases.queries";
import { utcDay } from "./stash-rollups.queries";

const PAGE_SIZE = 50;
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
    };
}
type MarketTable = ReturnType<typeof marketTables>["market"];
type DailyTable = ReturnType<typeof marketTables>["daily"];

/**
 * A pool unique's mod combinations merge into one market with an empty value where markets are
 * listed (the market list and the item's variants); the item page values and links the combinations.
 */
function valueGroup(table: MarketTable) {
    return sql<string>`case when ${inArray(table.signatureKind, [...MOD_POOL_KINDS])} then '' else ${table.signatureValue} end`;
}

function valueMatch(market: MarketTable, kind: string, value: string) {
    return isModPool(kind) && !value ? undefined : eq(market.signatureValue, value);
}

/** Gem level and quality band filters list only the gem markets in the bands they allow. */
function gemFilter(daily: DailyTable, filters: MarketFilters) {
    const values = gemVariantValues(filters);
    if (!values) return undefined;
    return values.length
        ? and(eq(daily.signatureKind, "gem"), inArray(daily.signatureValue, values))
        : sql`false`;
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

/** Clears the representative combination from a pool unique's merged every-combination row. */
function asMarket<Row extends { signatureValue: string; signatureData: unknown }>(
    row: Row,
    kind: string,
    value: string,
): Row {
    return isModPool(kind) && !value ? { ...row, signatureValue: "", signatureData: null } : row;
}

/**
 * Merges one hour's rows of a market, which spans foil variations (and link counts unless the
 * filters pick one), so the result has neither.
 */
function mergeMarket(rows: TStashUniqueHourlyS[], kind: string, value: string) {
    const { foilVariation: _, links: _links, ...row } = mergeMarketRows(rows);
    return asMarket(row, kind, value);
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
        isModPool(row.signatureKind) ? "" : row.signatureValue,
    ]);
}

/** One row per hour, merging foil and non-foil listings (and a pool unique's combinations). */
function mergeByHour(rows: TStashUniqueHourlyS[], filters: MarketFilters) {
    const hours = Map.groupBy(rows, (row) => row.hour);
    return [...hours.values()]
        .map((group) => mergeMarket(group, filters.kind, filters.value))
        .sort((a, b) => a.hour - b.hour);
}

/** Each listed market's latest-hour row, merged across foil and non-foil listings, in list order. */
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
                                eq(market.signatureKind, entry.signatureKind),
                                valueMatch(market, entry.signatureKind, entry.signatureValue),
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
                ...mergeMarket(group, entry.signatureKind, entry.signatureValue),
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
    const { market, daily } = marketTables(input.realm);
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
        marketExchangeSeasons(db, input.realm, exchangeHour),
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
                              eq(market.signatureKind, filters.kind),
                              valueMatch(market, filters.kind, filters.value),
                              linksMatch(market, filters),
                          ),
                      )
                      .orderBy(desc(market.hour))
                      // 90 days of hours for non-foil plus up to 16 merged foil variations, per link count.
                      .limit(2160 * 17 * 3),
              ).then((rows) => mergeByHour(rows, filters))
            : Promise.resolve([]);
    const variantsPromise =
        filters.item && view !== "list"
            ? marketVariants(db, market, scope, filters.item)
            : Promise.resolve([]);
    const modRowsPromise =
        filters.item && view !== "list" && isModPool(filters.kind)
            ? modPoolRows(db, filters, filters.item, scope, latestHour)
            : Promise.resolve(null);
    // Crafting base categories list equipment cohorts instead of unique and exchange markets.
    const baseCategory = isMarketBaseCategory(filters.category);
    // Items listed on the exchange are priced from it; the rows query leaves out their stash listings.
    const listedMarkets =
        season && view !== "history" && !baseCategory
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
    );
    const search = filters.q ? `%${filters.q.replace(/[\\%_]/g, "\\$&")}%` : undefined;
    const currencyField = (field: string) =>
        sql`cast(json_unquote(json_extract(${market.prices}, ${`$.${JSON.stringify(filters.currency)}.${field}`})) as decimal(30, 10))`;
    // A market merging foil and non-foil rows orders by their listing-weighted median.
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
    const grouped = db
        .select({
            itemKey: daily.itemKey,
            identified: daily.identified,
            corrupted: daily.corrupted,
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
                marketCategoryFilter(filters, daily.baseType, daily.signatureKind),
                gemFilter(daily, filters),
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
    if (!pageLatestRows) grouped.limit(PAGE_SIZE + 1).offset((filters.page - 1) * PAGE_SIZE);
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
                eq(market.itemKey, page.itemKey),
                eq(market.identified, page.identified),
                eq(market.corrupted, page.corrupted),
                eq(market.signatureKind, page.signatureKind),
                eq(valueGroup(market), page.signatureValue),
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
    if (pageLatestRows) marketsQuery.limit(PAGE_SIZE + 1).offset((filters.page - 1) * PAGE_SIZE);
    const rowsPromise =
        view === "history" || baseCategory
            ? Promise.resolve([])
            : traceQuery("market.rows", marketsQuery, {
                  "market.page_latest_rows": pageLatestRows,
                  "market.window_start": windowStart,
              }).then((markets) => marketLatestRows(db, filters, markets));
    const [rows, baseRows, history, variants, exchange, modRows] = await Promise.all([
        rowsPromise,
        season && view !== "history" && baseCategory
            ? marketBaseRows(
                  db,
                  filters,
                  windowStart,
                  marketBaseIds({ category: filters.category }),
              )
            : [],
        historyPromise,
        variantsPromise,
        listed.length ? marketExchange(db, filters, exchangeHour, listedMarkets) : [],
        modRowsPromise,
    ]);
    const priced = [...rows, ...baseRows];
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
        ? new Set([
              "divine",
              // Base price ranges are in the display currency.
              ...(baseRows.length ? [filters.currency] : []),
              ...priced.flatMap((row) => Object.keys(row.prices ?? {})),
          ])
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
    const bases = rankMarketBases(baseRows, filters, chaosRates, PAGE_SIZE);
    span.setAttributes({
        "market.rows": rows.length,
        "market.base_rows": baseRows.length,
        "market.history_rows": history.length,
        "market.variants": variants.length,
    });
    return {
        filters,
        seasons,
        season,
        rows: rows.slice(0, PAGE_SIZE).map((row) => ({
            ...row,
            category: marketCategory(filters.realm, row.baseType, row.signatureKind),
        })),
        /** Crafting base cohorts (normal, magic and rare together) in a crafting base category. */
        bases: bases.rows,
        hasMore: rows.length > PAGE_SIZE || bases.hasMore,
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
                signatureKind: market.signatureKind,
                signatureValue: valueGroup(market),
                links: market.links,
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
                market.signatureKind,
                valueGroup(market),
                market.links,
            )
            .orderBy(
                desc(sql`sum(${market.likelySales})`),
                asc(market.corrupted),
                asc(valueGroup(market)),
                asc(market.links),
            )
            .limit(100),
    );
    // Uniques that share art (e.g. replicas) share one unidentified market, named after only one of them.
    const markets = Map.groupBy(
        variants.filter(
            (row) => row.itemKey === item || (row.name !== null && names.has(row.name)),
        ),
        (row) =>
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
        const merged = {
            ...group[0]!,
            links: null,
            periodSales: group.reduce((sum, row) => sum + row.periodSales, 0),
        };
        const linked = group.some((row) => row.links > 0);
        return [merged, ...(linked ? group : [])].map((row) =>
            asMarket(row, row.signatureKind, row.signatureValue),
        );
    });
}

/** A pool unique variant's sibling combinations: the latest hour's listings and every hour with likely sales. */
function modPoolRows(
    db: TDatabase,
    filters: MarketFilters,
    item: string,
    scope: SQL | undefined,
    latestHour: number,
) {
    const { market } = marketTables(filters.realm);
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
                    eq(market.signatureKind, filters.kind),
                    linksMatch(market, filters),
                    or(eq(market.hour, latestHour), gt(market.likelySales, 0)),
                ),
            ),
    );
}

/** Private league names end in their league ID, e.g. `Chiba league (PL87141)`. */
const PRIVATE_LEAGUE = "% (PL%)";

/**
 * Each public league with exchange snapshots by `latestHour`, with its first and latest hours,
 * newest first. Leagues sharing the latest hour put the most snapshots first.
 */
function marketExchangeSeasons(db: TDatabase, realm: string, latestHour: number) {
    const { currencyHourly } = marketTables(realm);
    return traceQuery(
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
                    eq(currencyHourly.realm, realm),
                    lte(currencyHourly.hour, latestHour),
                    notLike(currencyHourly.league, PRIVATE_LEAGUE),
                ),
            )
            .groupBy(currencyHourly.realm, currencyHourly.league)
            .orderBy(desc(max(currencyHourly.hour)), desc(count())),
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

/** Rows for every item on the listed markets, priced in the realm's exchange unit. */
async function marketExchange(
    db: TDatabase,
    scope: { realm: string; league: string },
    latestHour: number,
    markets: ExchangeMarket[],
) {
    const [snapshots, days] = await Promise.all([
        exchangeSnapshots(db, scope, [latestHour, latestHour]),
        exchangeDaily(db, scope, exchangeWindowStart(latestHour)),
    ]);
    return marketExchangeRows(
        snapshots,
        days.filter((row) => row.day <= latestHour),
        latestHour,
        (itemId) => marketExchangeItem(scope.realm, itemId),
        [...new Set(markets.flatMap((row) => row.marketId.split("|")))],
        Math.min(...markets.map((row) => row.firstHour)),
        marketExchangeUnit(scope.realm),
    );
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
 * Markets of `itemId` and the `anchor` markets of the items it trades against (and of the
 * `priced` currencies, which the page values are shown in).
 */
function exchangeItemMarkets(
    markets: string[][],
    itemId: string,
    anchor: string,
    priced: string[],
) {
    const counterparts = new Set(markets.flatMap((ids) => (ids.includes(itemId) ? ids : [])));
    for (const id of priced) counterparts.add(id);
    return markets
        .filter(
            (ids) =>
                ids.includes(itemId) ||
                (ids.includes(anchor) && ids.some((id) => id !== anchor && counterparts.has(id))),
        )
        .map((ids) => ids.join("|"));
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
        const league = input.league || (await latestExchangeLeague(db, input.realm, latestHour));
        const scope = { realm: input.realm, league };
        const unit = marketExchangeUnit(input.realm);
        const anchor = marketExchangeUnitId(unit);
        const describe = (itemId: string) => marketExchangeItem(input.realm, itemId);
        const listed = league ? await marketExchangeMarkets(db, scope, latestHour) : [];
        const markets = listed.map((row) => row.marketId.split("|"));
        const priced = marketPriceCurrencyIds(input.realm);
        const marketIds = exchangeItemMarkets(markets, input.itemId, anchor, priced);
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
            input.itemId,
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
        const seasons = (await marketExchangeSeasons(db, realm, latestHour)).map((season) => ({
            league: season.league,
            firstHour: Number(season.firstHour),
            latestHour: Number(season.latestHour),
        }));
        const filters = { ...input, league: input.league || seasons[0]?.league || "" };
        const season = seasons.find((entry) => entry.league === filters.league);
        const scope = { realm, league: filters.league };
        const markets = season ? await marketExchangeMarkets(db, scope, latestHour) : [];
        const rows = markets.length ? await marketExchange(db, scope, latestHour, markets) : [];
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

/**
 * A crafting base cohort's hourly asking prices over the period, in the game's exchange unit, and
 * the latest hour of every listed cohort of the same base type.
 */
export function getMarketBase(db: TDatabase, input: MarketBaseInput) {
    return traceSpan("market.base", async () => {
        const base = marketBase(input.baseId) ?? null;
        const season = input.league
            ? { league: input.league, latestHour: await baseSeasonLatestHour(db, input) }
            : await latestBaseSeason(db, input.realm);
        const league = season?.league ?? "";
        const latestHour = season?.latestHour ?? 0;
        const filters = { realm: input.realm, league, currency: input.currency };
        const windowStart = utcDay(latestHour - Number(input.days) * 86400 + 3600);
        const [history, variants] =
            base && latestHour
                ? await Promise.all([
                      marketBaseHistory(db, filters, windowStart, base.id),
                      marketBaseRows(db, filters, windowStart, marketBaseIds({ variantsOf: base })),
                  ])
                : [[], []];
        const rates = await marketChaosRates(
            db,
            filters,
            [...history, ...variants].map(({ prices }) => ({ prices, salesPrices: null })),
            history.length || variants.length
                ? [...history.map((row) => row.hour), latestHour]
                : [],
        );
        const toChaos = marketDisplayRate(rates, "chaos", latestHour);
        const currencies = new Set([
            "divine",
            input.currency,
            ...variants.flatMap((row) => Object.keys(row.prices)),
        ]);
        const game = marketGame(input.realm);
        const historyUnit = MARKET_PRICE_CURRENCIES[game][0];
        return {
            ...input,
            league,
            latestHour,
            base,
            historyUnit,
            history: history.map((row) => ({
                hour: row.hour,
                listingCount: row.listingCount,
                uniqueSellers: row.uniqueSellers,
                unknownCount: row.unknownCount,
                merged: mergeMarketPrices(
                    row.prices,
                    marketDisplayRate(rates, historyUnit, row.hour),
                ),
                priceRates: marketPriceRates(rates, game, row.hour),
            })),
            variants: variants.sort(
                (a, b) =>
                    a.ilvl.min - b.ilvl.min ||
                    (a.links ?? "").localeCompare(b.links ?? "") ||
                    (a.quality ?? 0) - (b.quality ?? 0),
            ),
            /** Chaos per unit of each listing currency on the page, at the latest hour. */
            chaosRates: Object.fromEntries(
                [...currencies].flatMap((currency) => {
                    const rate = toChaos(currency);
                    return rate ? [[currency, rate] as const] : [];
                }),
            ),
            priceRates: marketPriceRates(rates, game, latestHour),
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

/** The first of `marketExchangeSeasons`: the league whose exchange traded most recently. */
async function latestExchangeLeague(db: TDatabase, realm: string, latestHour: number) {
    const [row] = await marketExchangeSeasons(db, realm, latestHour);
    return row?.league ?? "";
}

function exchangeMatches(rows: MarketExchangeRow[], filters: MarketFilters) {
    if (filters.page > 1 || filters.identification === "false" || filters.corruption === "true")
        return [];
    return exchangeSearch(rows, filters.category, filters.q);
}

/** Rows in the category whose name contains `q`, dearest first. */
function exchangeSearch(rows: MarketExchangeRow[], category: string, q: string) {
    const search = q.toLowerCase();
    return rows
        .filter(
            (row) =>
                (category === "all" || row.category === category) &&
                (!search || row.name.toLowerCase().includes(search)),
        )
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

async function marketChaosRates(
    db: TDatabase,
    filters: Pick<MarketFilters, "realm" | "league" | "currency">,
    observations: Pick<TStashUniqueHourlyS, "prices" | "salesPrices">[],
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
            ]),
        ]),
    ];
    const { currencyHourly } = marketTables(filters.realm);
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
