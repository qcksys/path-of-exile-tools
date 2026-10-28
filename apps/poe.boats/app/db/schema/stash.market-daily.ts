import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
    bigint,
    boolean,
    index,
    int,
    mysqlTable,
    primaryKey,
    varchar,
} from "drizzle-orm/mysql-core";
import { timestampCols } from "~/db/helpers/schema";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";
import type { StashListingTab } from "~/db/schema/stash.unique-hourly";

/**
 * One row per listed market and stash tab kind per UTC day, recomputed from the game's unique
 * hourly table whenever an hour of that day is written, so market lists sum days instead of hours.
 * A mod pool unique's combinations (Watcher's Eye, Loreweave) share one market with an empty
 * `signatureValue`, as the list shows them. `day` is the day's first hour.
 */
function stashMarketDaily(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "market_daily"),
        {
            realm: varchar({ length: 10 }).notNull(),
            league: varchar({ length: 100 }).notNull(),
            day: bigint({ mode: "number" }).notNull(),
            itemKey: varchar({ length: 255 }).notNull(),
            identified: boolean().notNull(),
            corrupted: boolean().notNull(),
            foilVariation: int().notNull(),
            tab: varchar({ length: 8 }).$type<StashListingTab>().notNull().default(""),
            signatureKind: varchar({ length: 32 }).notNull(),
            signatureValue: varchar({ length: 255 }).notNull(),
            name: varchar({ length: 100 }),
            baseType: varchar({ length: 100 }).notNull(),
            frameType: int().notNull(),
            likelySales: int().notNull(),
            removedCount: int().notNull(),
            pendingCount: int().notNull(),
            /** The day's newest hour. */
            latestHour: bigint({ mode: "number" }).notNull(),
            /** The day's newest hour with listings, if any. */
            listedHour: bigint({ mode: "number" }),
            ...timestampCols,
        },
        (table) => [
            primaryKey({
                columns: [
                    table.realm,
                    table.league,
                    table.day,
                    table.itemKey,
                    table.identified,
                    table.corrupted,
                    table.foilVariation,
                    table.tab,
                    table.signatureKind,
                    table.signatureValue,
                ],
            }),
            // Category lists read only their base types; InnoDB appends the market primary key.
            index("stash_market_daily_base_idx").on(
                table.realm,
                table.league,
                table.baseType,
                table.day,
                table.frameType,
                table.likelySales,
                table.removedCount,
                table.pendingCount,
                table.latestHour,
                table.listedHour,
            ),
        ],
    );
}
export const tStashPoe1MarketDaily = stashMarketDaily("poe1");
export const tStashPoe2MarketDaily = stashMarketDaily("poe2");
export const tStashMarketDaily = { poe1: tStashPoe1MarketDaily, poe2: tStashPoe2MarketDaily };
export type TStashMarketDailyS = InferSelectModel<typeof tStashPoe1MarketDaily>;
export type TStashMarketDailyI = InferInsertModel<typeof tStashPoe1MarketDaily>;
