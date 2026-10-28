import type { CohortHourly } from "@poe-tools/market";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, int, json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { stashTableName } from "~/db/helpers/stash-game";

export type CohortPriceWindows = Record<
    string,
    NonNullable<CohortHourly["prices"][string]["windows"]>
>;

/**
 * The 6/24-hour price windows of `stash_poe1_cohort_hourly` rows, by currency. Ingest deletes
 * hours older than `COHORT_WINDOW_RETENTION_HOURS`; a window applies only while its `revisionSeq`
 * matches the hourly row's.
 */
export const tStashCohortWindow = mysqlTable(
    stashTableName("poe1", "cohort_window"),
    {
        realm: varchar({ length: 10 }).notNull(),
        league: varchar({ length: 100 }).notNull(),
        hour: bigint({ mode: "number" }).notNull(),
        cohortId: varchar({ length: 128 }).notNull(),
        revisionSeq: int().notNull(),
        windows: json().$type<CohortPriceWindows>().notNull(),
    },
    (table) => [primaryKey({ columns: [table.realm, table.league, table.hour, table.cohortId] })],
);
export type TStashCohortWindowS = InferSelectModel<typeof tStashCohortWindow>;
export type TStashCohortWindowI = InferInsertModel<typeof tStashCohortWindow>;
