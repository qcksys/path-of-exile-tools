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
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema";

/**
 * One row per listed market per UTC day, recomputed from `stash_unique_hourly` whenever an hour
 * of that day is written, so market lists sum days instead of hours. A mod pool unique's
 * combinations (Watcher's Eye, Loreweave) share one market with an empty `signatureValue`, as the
 * list shows them. `day` is the day's first hour.
 */
export const tStashMarketDaily = mysqlTable(
    `${DB_TABLE_PREFIX}stash_market_daily`,
    {
        realm: varchar({ length: 10 }).notNull(),
        league: varchar({ length: 100 }).notNull(),
        day: bigint({ mode: "number" }).notNull(),
        itemKey: varchar({ length: 255 }).notNull(),
        identified: boolean().notNull(),
        corrupted: boolean().notNull(),
        foilVariation: int().notNull(),
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
export type TStashMarketDailyS = InferSelectModel<typeof tStashMarketDaily>;
export type TStashMarketDailyI = InferInsertModel<typeof tStashMarketDaily>;
