import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, int, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { timestampCols } from "~/db/helpers/schema";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";

export const STASH_COVERAGE_STREAMS = ["currency", "uniques", "equipment"] as const;
export type StashCoverageStream = (typeof STASH_COVERAGE_STREAMS)[number];

// Stored rows per hourly stream, league and hour, recounted whenever that hour is written.
function stashHourCoverage(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "hour_coverage"),
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
}
export const tStashPoe1HourCoverage = stashHourCoverage("poe1");
export const tStashPoe2HourCoverage = stashHourCoverage("poe2");
export const tStashHourCoverage = { poe1: tStashPoe1HourCoverage, poe2: tStashPoe2HourCoverage };
export type TStashHourCoverageS = InferSelectModel<typeof tStashPoe1HourCoverage>;
export type TStashHourCoverageI = InferInsertModel<typeof tStashPoe1HourCoverage>;
