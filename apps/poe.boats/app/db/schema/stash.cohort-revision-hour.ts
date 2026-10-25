import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema";

// One row per revision with hourly cohort data, so lookups skip revisions without observations.
export const tStashCohortRevisionHour = mysqlTable(
    `${DB_TABLE_PREFIX}stash_cohort_revision_hour`,
    {
        realm: varchar({ length: 10 }).notNull(),
        league: varchar({ length: 100 }).notNull(),
        hour: bigint({ mode: "number" }).notNull(),
        revision: varchar({ length: 100 }).notNull(),
        ...timestampCols,
    },
    (table) => [primaryKey({ columns: [table.realm, table.league, table.hour, table.revision] })],
);
export type TStashCohortRevisionHourS = InferSelectModel<typeof tStashCohortRevisionHour>;
export type TStashCohortRevisionHourI = InferInsertModel<typeof tStashCohortRevisionHour>;
export const sStashCohortRevisionHourS = createSelectSchema(tStashCohortRevisionHour);
export const sStashCohortRevisionHourI = createInsertSchema(tStashCohortRevisionHour);
export const sStashCohortRevisionHourU = createUpdateSchema(tStashCohortRevisionHour);
