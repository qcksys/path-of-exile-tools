import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, int, mysqlTable, primaryKey, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-orm/zod";
import { timestampCols } from "~/db/helpers/schema";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";

// Every exchange market stored per league, with the first hour it was observed. Hourly rows
// carry its `id`.
function stashCurrencyMarket(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "currency_market"),
        {
            id: int({ unsigned: true }).autoincrement().notNull(),
            realm: varchar({ length: 10 }).notNull(),
            league: varchar({ length: 100 }).notNull(),
            marketId: varchar({ length: 512 }).notNull(),
            firstHour: bigint({ mode: "number" }).notNull(),
            ...timestampCols,
        },
        (table) => [
            primaryKey({ columns: [table.realm, table.league, table.marketId] }),
            uniqueIndex("stash_currency_market_id_idx").on(table.id),
        ],
    );
}
export const tStashPoe1CurrencyMarket = stashCurrencyMarket("poe1");
export const tStashPoe2CurrencyMarket = stashCurrencyMarket("poe2");
export const tStashCurrencyMarket = {
    poe1: tStashPoe1CurrencyMarket,
    poe2: tStashPoe2CurrencyMarket,
};
export type TStashCurrencyMarketS = InferSelectModel<typeof tStashPoe1CurrencyMarket>;
export type TStashCurrencyMarketI = InferInsertModel<typeof tStashPoe1CurrencyMarket>;

export const sStashCurrencyMarketI = createInsertSchema(tStashPoe1CurrencyMarket);
