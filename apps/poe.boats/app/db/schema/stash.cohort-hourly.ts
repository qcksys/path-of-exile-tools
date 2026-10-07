import type { CohortHourly } from "@poe-tools/market";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, int, json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema";

export const tStashCohortHourly = mysqlTable(
    `${DB_TABLE_PREFIX}stash_cohort_hourly`,
    {
        realm: varchar({ length: 10 }).notNull(),
        league: varchar({ length: 100 }).notNull(),
        hour: bigint({ mode: "number" }).notNull(),
        revision: varchar({ length: 100 }).notNull(),
        cohortId: varchar({ length: 128 }).notNull(),
        listingCount: int().notNull(),
        uniqueSellers: int().notNull(),
        unknownCount: int().notNull(),
        prices: json().$type<CohortHourly["prices"]>().notNull(),
        confidenceMethod: varchar({ length: 40 }).notNull(),
        firstSeenAt: varchar({ length: 32 }),
        lastSeenAt: varchar({ length: 32 }),
        ...timestampCols,
    },
    (table) => [
        primaryKey({
            columns: [table.realm, table.league, table.revision, table.cohortId, table.hour],
        }),
        index("stash_cohort_history_idx").on(table.realm, table.league, table.cohortId, table.hour),
    ],
);
export type TStashCohortHourlyS = InferSelectModel<typeof tStashCohortHourly>;
export type TStashCohortHourlyI = InferInsertModel<typeof tStashCohortHourly>;
export const sStashCohortHourlyS = createSelectSchema(tStashCohortHourly);
export const sStashCohortHourlyI = createInsertSchema(tStashCohortHourly);
export const sStashCohortHourlyU = createUpdateSchema(tStashCohortHourly);
