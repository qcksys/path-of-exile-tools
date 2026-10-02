import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

/**
 * Permanent hourly currency-exchange snapshots, mirroring cxapi's hourly
 * digest verbatim per market. Written by @poe-tools/stash-ingest.
 */
export const tStashCurrencyHourly = mysqlTable(
    `${DB_TABLE_PREFIX}stash_currency_hourly`,
    {
        realm: varchar({ length: 10 }).notNull().default("pc"),
        league: varchar({ length: 100 }).notNull(),
        marketId: varchar({ length: 512 }).notNull(),
        hour: bigint({ mode: "number" }).notNull(),
        lowestRatio: json().$type<Record<string, number>>(),
        highestRatio: json().$type<Record<string, number>>(),
        volumeTraded: json().$type<Record<string, number>>(),
        lowestStock: json().$type<Record<string, number>>(),
        highestStock: json().$type<Record<string, number>>(),
        ...timestampCols,
    },
    (table) => [
        primaryKey({ columns: [table.realm, table.league, table.marketId, table.hour] }),
        index("idx_stash_cx_league_hour").on(table.league, table.hour),
    ],
);

export type TStashCurrencyHourlyS = InferSelectModel<typeof tStashCurrencyHourly>;
export type TStashCurrencyHourlyI = InferInsertModel<typeof tStashCurrencyHourly>;

export const sStashCurrencyHourlyS = createSelectSchema(tStashCurrencyHourly);
export const sStashCurrencyHourlyI = createInsertSchema(tStashCurrencyHourly);
