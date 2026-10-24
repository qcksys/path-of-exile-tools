import type { ItemQuery } from "@poe-tools/item-query";
import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import { index, json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema";

export const tStashCohort = mysqlTable(
    `${DB_TABLE_PREFIX}stash_cohort`,
    {
        revision: varchar({ length: 100 }).notNull(),
        id: varchar({ length: 128 }).notNull(),
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
    (table) => [
        primaryKey({ columns: [table.revision, table.id] }),
        index("stash_cohort_base_page_idx").on(table.baseTypeKey, table.revision, table.id),
    ],
);
export type TStashCohortS = InferSelectModel<typeof tStashCohort>;
export type TStashCohortI = InferInsertModel<typeof tStashCohort>;
export const sStashCohortS = createSelectSchema(tStashCohort);
export const sStashCohortI = createInsertSchema(tStashCohort);
export const sStashCohortU = createUpdateSchema(tStashCohort);
