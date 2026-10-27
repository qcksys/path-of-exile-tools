import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, boolean, int, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema";

/**
 * Superseded by `stash_market_daily`, which merges mod pool combinations; nothing reads or writes
 * this table. Kept so migrations do not drop it before the code that wrote it is retired.
 */
export const tStashUniqueDaily = mysqlTable(
    `${DB_TABLE_PREFIX}stash_unique_daily`,
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
    ],
);
export type TStashUniqueDailyS = InferSelectModel<typeof tStashUniqueDaily>;
export type TStashUniqueDailyI = InferInsertModel<typeof tStashUniqueDaily>;
export const sStashUniqueDailyS = createSelectSchema(tStashUniqueDaily);
