import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { stashGame } from "~/db/helpers/stash-game";
import { tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import { MARKET_RATE_MAX_AGE, marketGame, marketRatePairs } from "~/lib/market-price-merge";

/** The exchange snapshots that price `currencies` in chaos at `hours`. */
export function marketRateSnapshots(
    db: TDatabase,
    scope: { realm: string; league: string },
    currencies: string[],
    hours: number[],
) {
    const currencyHourly = tStashCurrencyHourly[stashGame(scope.realm)];
    return db
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
                inArray(
                    currencyHourly.marketId,
                    marketRatePairs(currencies, marketGame(scope.realm)),
                ),
                gte(currencyHourly.hour, Math.min(...hours) - MARKET_RATE_MAX_AGE),
                lte(currencyHourly.hour, Math.max(...hours)),
            ),
        );
}
