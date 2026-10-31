import type { InferInsertModel } from "drizzle-orm";
import { boolean, double, int, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { timestampCols } from "~/db/helpers/schema";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";
import type { MarketTab } from "~/schemas/market";

/**
 * Each listed market's asking price at its newest hour with listings, per stash tab scope, as the
 * market list orders and filters by it. The prices are the most listed currency's merged median,
 * converted when the hour is written at that hour's exchange rates, so they never follow later
 * rates. A market listed without a usable price has null prices. A mod pool unique (Watcher's Eye,
 * Loreweave) has only its item market, with an empty `signatureValue`, as the list shows it.
 */
function stashMarketPrice(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "market_price"),
        {
            realm: varchar({ length: 10 }).notNull(),
            league: varchar({ length: 100 }).notNull(),
            itemKey: varchar({ length: 255 }).notNull(),
            identified: boolean().notNull(),
            corrupted: boolean().notNull(),
            tab: varchar({ length: 8 }).$type<MarketTab>().notNull(),
            signatureKind: varchar({ length: 32 }).notNull(),
            signatureValue: varchar({ length: 255 }).notNull(),
            hour: int({ unsigned: true }).notNull(),
            priceChaos: double(),
            priceDivine: double(),
            ...timestampCols,
        },
        (table) => [
            primaryKey({
                columns: [
                    table.realm,
                    table.league,
                    table.itemKey,
                    table.identified,
                    table.corrupted,
                    table.tab,
                    table.signatureKind,
                    table.signatureValue,
                ],
            }),
        ],
    );
}
export const tStashPoe1MarketPrice = stashMarketPrice("poe1");
export const tStashPoe2MarketPrice = stashMarketPrice("poe2");
export const tStashMarketPrice = { poe1: tStashPoe1MarketPrice, poe2: tStashPoe2MarketPrice };
export type TStashMarketPriceI = InferInsertModel<typeof tStashPoe1MarketPrice>;
