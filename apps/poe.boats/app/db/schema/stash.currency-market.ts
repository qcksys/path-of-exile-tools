import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema";

// Every exchange market stored per league, with the first hour it was observed.
export const tStashCurrencyMarket = mysqlTable(
    `${DB_TABLE_PREFIX}stash_currency_market`,
    {
        realm: varchar({ length: 10 }).notNull(),
        league: varchar({ length: 100 }).notNull(),
        marketId: varchar({ length: 512 }).notNull(),
        firstHour: bigint({ mode: "number" }).notNull(),
        ...timestampCols,
    },
    (table) => [primaryKey({ columns: [table.realm, table.league, table.marketId] })],
);
export type TStashCurrencyMarketS = InferSelectModel<typeof tStashCurrencyMarket>;
export type TStashCurrencyMarketI = InferInsertModel<typeof tStashCurrencyMarket>;
