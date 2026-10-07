import type { ItemQuery } from "@poe-tools/item-query";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { json, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
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
        ...timestampCols,
    },
    (table) => [primaryKey({ columns: [table.revision, table.id] })],
);
export type TStashCohortS = InferSelectModel<typeof tStashCohort>;
export type TStashCohortI = InferInsertModel<typeof tStashCohort>;
export const sStashCohortS = createSelectSchema(tStashCohort);
export const sStashCohortI = createInsertSchema(tStashCohort);
export const sStashCohortU = createUpdateSchema(tStashCohort);
