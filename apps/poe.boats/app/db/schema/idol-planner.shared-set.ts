import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

export const tIdolPlannerSharedSet = mysqlTable(`${DB_TABLE_PREFIX}idol_planner_shared_set`, {
    id: varchar({ length: 10 }).primaryKey(),
    data: json().$type<{
        version: number;
        set: Record<string, unknown>;
        idols: Array<Record<string, unknown>>;
        createdAt: number;
    }>(),
    rowCreatedAt: timestampCols.rowCreatedAt,
    rowUpdatedAt: timestampCols.rowUpdatedAt,
});

export type TIdolPlannerSharedSetS = InferSelectModel<typeof tIdolPlannerSharedSet>;
export type TIdolPlannerSharedSetI = InferInsertModel<typeof tIdolPlannerSharedSet>;

export const sIdolPlannerSharedSetS = createSelectSchema(tIdolPlannerSharedSet);
export const sIdolPlannerSharedSetI = createInsertSchema(tIdolPlannerSharedSet);
