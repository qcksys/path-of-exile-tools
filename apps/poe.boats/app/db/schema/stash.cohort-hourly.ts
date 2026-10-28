import type { CohortHourly } from "@poe-tools/market";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, int, json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { stashTableName } from "~/db/helpers/stash-game";

/**
 * One row per PoE 1 equipment cohort and hour with asking prices, holding the newest catalog
 * revision's classification (`revisionSeq`, see `stash_poe1_cohort_revision`). Hours without
 * prices are not stored, so readers use each cohort's latest priced hour. `prices` omits the
 * 6/24-hour windows, which live in `stash_poe1_cohort_window` for recent hours only.
 */
export const tStashCohortHourly = mysqlTable(
    stashTableName("poe1", "cohort_hourly"),
    {
        realm: varchar({ length: 10 }).notNull(),
        league: varchar({ length: 100 }).notNull(),
        hour: bigint({ mode: "number" }).notNull(),
        cohortId: varchar({ length: 128 }).notNull(),
        revisionSeq: int().notNull(),
        listingCount: int().notNull(),
        uniqueSellers: int().notNull(),
        unknownCount: int().notNull(),
        prices: json().$type<CohortHourly["prices"]>().notNull(),
        confidenceMethod: varchar({ length: 40 }).notNull(),
        firstSeenAt: varchar({ length: 32 }),
        lastSeenAt: varchar({ length: 32 }),
    },
    (table) => [
        // Hour leads the key, so each delivered hour appends instead of touching pages across the table.
        primaryKey({ columns: [table.realm, table.league, table.hour, table.cohortId] }),
        index("stash_cohort_history_idx").on(table.realm, table.league, table.cohortId, table.hour),
    ],
);
export type TStashCohortHourlyS = InferSelectModel<typeof tStashCohortHourly>;
export type TStashCohortHourlyI = InferInsertModel<typeof tStashCohortHourly>;
export const sStashCohortHourlyS = createSelectSchema(tStashCohortHourly);
export const sStashCohortHourlyI = createInsertSchema(tStashCohortHourly);
export const sStashCohortHourlyU = createUpdateSchema(tStashCohortHourly);
