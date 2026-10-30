import { eq, type SQL, sql } from "drizzle-orm";
import { double, index, int, mysqlTable, mysqlView, primaryKey } from "drizzle-orm/mysql-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";
import { tStashCurrencyMarket } from "~/db/schema/stash.currency-market";

/** The cxapi digest's per-item maps; each holds exactly the market's two items. */
export const STASH_CURRENCY_MAPS = [
    "lowestRatio",
    "highestRatio",
    "volumeTraded",
    "lowestStock",
    "highestStock",
] as const;
export type StashCurrencyMap = (typeof STASH_CURRENCY_MAPS)[number];

/**
 * Permanent hourly currency-exchange snapshots, one row per market per hour, written by
 * @poe-tools/stash-ingest and the exchange cron. Each digest map's value for the market ID's
 * first item (`…First`) and second item (`…Second`) is a column, so rows carry no item IDs.
 * The key leads with the hour, so each delivered hour appends.
 */
function stashCurrencyHour(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "currency_hour"),
        {
            hour: int({ unsigned: true }).notNull(),
            marketId: int({ unsigned: true }).notNull(),
            lowestRatioFirst: double().notNull(),
            lowestRatioSecond: double().notNull(),
            highestRatioFirst: double().notNull(),
            highestRatioSecond: double().notNull(),
            volumeTradedFirst: double().notNull(),
            volumeTradedSecond: double().notNull(),
            lowestStockFirst: double().notNull(),
            lowestStockSecond: double().notNull(),
            highestStockFirst: double().notNull(),
            highestStockSecond: double().notNull(),
        },
        (table) => [
            primaryKey({ columns: [table.hour, table.marketId] }),
            index("stash_currency_hour_market_idx").on(table.marketId, table.hour),
        ],
    );
}
export const tStashPoe1CurrencyHour = stashCurrencyHour("poe1");
export const tStashPoe2CurrencyHour = stashCurrencyHour("poe2");
export const tStashCurrencyHour = { poe1: tStashPoe1CurrencyHour, poe2: tStashPoe2CurrencyHour };

/** JSON returned for a computed column arrives as text from some drivers. */
const parseJson = (value: unknown) =>
    (typeof value === "string" ? JSON.parse(value) : value) as Record<string, number>;

/** Each market hour with its market's identity and the digest maps keyed by item ID again. */
function stashCurrencyHourly(game: StashGame) {
    const market = tStashCurrencyMarket[game];
    const hour = tStashCurrencyHour[game];
    const map = (name: StashCurrencyMap) =>
        sql<
            Record<string, number>
        >`json_object(substring_index(${market.marketId}, '|', 1), ${hour[`${name}First`]}, substring_index(${market.marketId}, '|', -1), ${hour[`${name}Second`]})`
            .mapWith(parseJson)
            .as(name) as SQL.Aliased<Record<string, number>>;
    return mysqlView(stashTableName(game, "currency_hourly")).as((qb) =>
        qb
            .select({
                realm: market.realm,
                league: market.league,
                marketId: market.marketId,
                hour: hour.hour,
                lowestRatio: map("lowestRatio"),
                highestRatio: map("highestRatio"),
                volumeTraded: map("volumeTraded"),
                lowestStock: map("lowestStock"),
                highestStock: map("highestStock"),
                volumeTradedFirst: hour.volumeTradedFirst,
                volumeTradedSecond: hour.volumeTradedSecond,
            })
            .from(hour)
            .innerJoin(market, eq(market.id, hour.marketId)),
    );
}
export const tStashPoe1CurrencyHourly = stashCurrencyHourly("poe1");
export const tStashPoe2CurrencyHourly = stashCurrencyHourly("poe2");
export const tStashCurrencyHourly = {
    poe1: tStashPoe1CurrencyHourly,
    poe2: tStashPoe2CurrencyHourly,
};

export type TStashCurrencyHourlyS = typeof tStashPoe1CurrencyHourly.$inferSelect;
/** One market hour as ingest delivers it, with the digest maps keyed by item ID. */
export type TStashCurrencyHourlyI = Pick<
    TStashCurrencyHourlyS,
    "realm" | "league" | "marketId" | "hour"
> &
    Partial<Record<StashCurrencyMap, Record<string, number> | null>>;

export const sStashCurrencyHourlyS = createSelectSchema(tStashPoe1CurrencyHourly);
