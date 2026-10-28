import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { timestampCols } from "~/db/helpers/schema";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";

// Every exchange market stored per league, with the first hour it was observed.
function stashCurrencyMarket(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "currency_market"),
        {
            realm: varchar({ length: 10 }).notNull(),
            league: varchar({ length: 100 }).notNull(),
            marketId: varchar({ length: 512 }).notNull(),
            firstHour: bigint({ mode: "number" }).notNull(),
            ...timestampCols,
        },
        (table) => [primaryKey({ columns: [table.realm, table.league, table.marketId] })],
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
