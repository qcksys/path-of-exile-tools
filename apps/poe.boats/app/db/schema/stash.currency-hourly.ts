import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { timestampCols } from "~/db/helpers/schema.ts";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";

/**
 * Permanent hourly currency-exchange snapshots, mirroring cxapi's hourly
 * digest verbatim per market. Written by @poe-tools/stash-ingest.
 */
function stashCurrencyHourly(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "currency_hourly"),
        {
            realm: varchar({ length: 10 }).notNull(),
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
            index("stash_currency_coverage_idx").on(table.realm, table.league, table.hour),
        ],
    );
}
export const tStashPoe1CurrencyHourly = stashCurrencyHourly("poe1");
export const tStashPoe2CurrencyHourly = stashCurrencyHourly("poe2");
export const tStashCurrencyHourly = {
    poe1: tStashPoe1CurrencyHourly,
    poe2: tStashPoe2CurrencyHourly,
};

export type TStashCurrencyHourlyS = InferSelectModel<typeof tStashPoe1CurrencyHourly>;
export type TStashCurrencyHourlyI = InferInsertModel<typeof tStashPoe1CurrencyHourly>;

export const sStashCurrencyHourlyS = createSelectSchema(tStashPoe1CurrencyHourly);
export const sStashCurrencyHourlyI = createInsertSchema(tStashPoe1CurrencyHourly);
