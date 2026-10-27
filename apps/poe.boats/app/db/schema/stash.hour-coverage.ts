import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, int, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema";

export const STASH_COVERAGE_STREAMS = ["currency", "uniques", "equipment"] as const;
export type StashCoverageStream = (typeof STASH_COVERAGE_STREAMS)[number];

// Stored rows per hourly stream, league and hour, recounted whenever that hour is written.
export const tStashHourCoverage = mysqlTable(
    `${DB_TABLE_PREFIX}stash_hour_coverage`,
    {
        stream: varchar({ length: 16 }).$type<StashCoverageStream>().notNull(),
        realm: varchar({ length: 10 }).notNull(),
        league: varchar({ length: 100 }).notNull(),
        hour: bigint({ mode: "number" }).notNull(),
        rowCount: int().notNull(),
        ...timestampCols,
    },
    (table) => [primaryKey({ columns: [table.stream, table.realm, table.league, table.hour] })],
);
export type TStashHourCoverageS = InferSelectModel<typeof tStashHourCoverage>;
export type TStashHourCoverageI = InferInsertModel<typeof tStashHourCoverage>;
