import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { int, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { timestampCols } from "~/db/helpers/schema";
import { stashTableName } from "~/db/helpers/stash-game";

/** PoE 1 cohort catalog revisions in the order ingest first saw them; a higher `seq` is newer. */
export const tStashCohortRevision = mysqlTable(
    stashTableName("poe1", "cohort_revision"),
    {
        seq: int().autoincrement().primaryKey(),
        revision: varchar({ length: 100 }).notNull(),
        ...timestampCols,
    },
    (table) => [uniqueIndex("stash_cohort_revision_idx").on(table.revision)],
);
export type TStashCohortRevisionS = InferSelectModel<typeof tStashCohortRevision>;
export type TStashCohortRevisionI = InferInsertModel<typeof tStashCohortRevision>;
