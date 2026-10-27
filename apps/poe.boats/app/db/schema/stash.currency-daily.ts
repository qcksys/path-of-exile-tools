import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, int, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema";

/**
 * One row per exchange market per UTC day, recomputed from `stash_currency_hourly` whenever an
 * hour of that day is written. Volumes sum only the hours in which both sides traded, so
 * `secondVolume / firstVolume` is the day's volume-weighted price of the market ID's first item in
 * its second. `day` is the day's first hour.
 */
export const tStashCurrencyDaily = mysqlTable(
    `${DB_TABLE_PREFIX}stash_currency_daily`,
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

export type TStashCurrencyDailyS = InferSelectModel<typeof tStashCurrencyDaily>;
export type TStashCurrencyDailyI = InferInsertModel<typeof tStashCurrencyDaily>;
