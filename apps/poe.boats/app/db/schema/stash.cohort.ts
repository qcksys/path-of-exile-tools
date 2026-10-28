import type { ItemQuery } from "@poe-tools/item-query";
import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { timestampCols } from "~/db/helpers/schema";
import { stashTableName } from "~/db/helpers/stash-game";

/**
 * PoE 1 equipment cohort definitions, one per cohort ID. A newer catalog revision's definition
 * replaces the stored one; `revision` and `catalogHash` record which delivered it.
 */
export const tStashCohort = mysqlTable(
    stashTableName("poe1", "cohort"),
    {
        id: varchar({ length: 128 }).primaryKey(),
        revision: varchar({ length: 100 }).notNull(),
        catalogHash: varchar({ length: 64 }).notNull(),
        name: varchar({ length: 300 }).notNull(),
        purpose: varchar({ length: 32 }).notNull(),
        query: json().$type<ItemQuery>().notNull(),
        baseTypes: json().$type<string[] | null>(),
        // Multi-base and unrestricted definitions share a fallback range, checked against the JSON predicate.
        baseTypeKey: varchar({ length: 255 }).generatedAlwaysAs(
            sql`case when json_length(baseTypes) = 1 then json_unquote(json_extract(baseTypes, '$[0]')) else '' end`,
            { mode: "virtual" },
        ),
        ...timestampCols,
    },
    (table) => [index("stash_cohort_base_page_idx").on(table.baseTypeKey, table.id)],
);
export type TStashCohortS = InferSelectModel<typeof tStashCohort>;
export type TStashCohortI = InferInsertModel<typeof tStashCohort>;
export const sStashCohortS = createSelectSchema(tStashCohort);
export const sStashCohortI = createInsertSchema(tStashCohort);
export const sStashCohortU = createUpdateSchema(tStashCohort);
