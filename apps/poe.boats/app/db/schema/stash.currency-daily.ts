import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, int, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { timestampCols } from "~/db/helpers/schema";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";

/**
 * One row per exchange market per UTC day, recomputed from the game's currency hourly table
 * whenever an hour of that day is written. Volumes sum only the hours in which both sides traded,
 * so `secondVolume / firstVolume` is the day's volume-weighted price of the market ID's first item
 * in its second. `day` is the day's first hour.
 */
function stashCurrencyDaily(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "currency_daily"),
        {
            realm: varchar({ length: 10 }).notNull(),
            league: varchar({ length: 100 }).notNull(),
            day: bigint({ mode: "number" }).notNull(),
            marketId: varchar({ length: 512 }).notNull(),
            firstVolume: bigint({ mode: "number" }).notNull(),
            secondVolume: bigint({ mode: "number" }).notNull(),
            tradedHours: int().notNull(),
            /** The day's newest hour in which both sides traded, if any. */
            latestHour: bigint({ mode: "number" }),
            ...timestampCols,
        },
        (table) => [
            primaryKey({ columns: [table.realm, table.league, table.day, table.marketId] }),
            // Item pages read every day of a few markets.
            index("stash_currency_daily_market_idx").on(
                table.realm,
                table.league,
                table.marketId,
                table.day,
            ),
        ],
    );
}
export const tStashPoe1CurrencyDaily = stashCurrencyDaily("poe1");
export const tStashPoe2CurrencyDaily = stashCurrencyDaily("poe2");
export const tStashCurrencyDaily = { poe1: tStashPoe1CurrencyDaily, poe2: tStashPoe2CurrencyDaily };

export type TStashCurrencyDailyS = InferSelectModel<typeof tStashPoe1CurrencyDaily>;
export type TStashCurrencyDailyI = InferInsertModel<typeof tStashPoe1CurrencyDaily>;
