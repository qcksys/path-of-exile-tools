import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

/**
 * Each exchange market's newest hourly snapshot that recorded trades, kept current by
 * `upsertStashCurrencyHourly`. The market list reads it instead of scanning hourly snapshots
 * for nonzero volume.
 */
export const tStashCurrencyLatest = mysqlTable(
    `${DB_TABLE_PREFIX}stash_currency_latest`,
    {
        realm: varchar({ length: 10 }).notNull().default("pc"),
        league: varchar({ length: 100 }).notNull(),
        marketId: varchar({ length: 512 }).notNull(),
        hour: bigint({ mode: "number" }).notNull(),
        lowestRatio: json().$type<Record<string, number>>(),
        highestRatio: json().$type<Record<string, number>>(),
        volumeTraded: json().$type<Record<string, number>>(),
        ...timestampCols,
    },
    (table) => [
        primaryKey({ columns: [table.realm, table.league, table.marketId] }),
        index("stash_currency_latest_hour_idx").on(table.realm, table.league, table.hour),
    ],
);

export type TStashCurrencyLatestS = InferSelectModel<typeof tStashCurrencyLatest>;
export type TStashCurrencyLatestI = InferInsertModel<typeof tStashCurrencyLatest>;
