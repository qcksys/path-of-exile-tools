import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

export const tIdolPlannerUserPrefs = mysqlTable(`${DB_TABLE_PREFIX}idol_planner_user_prefs`, {
    userId: varchar({ length: 36 }).primaryKey(),
    leagueId: varchar({ length: 100 }),
    realm: varchar({ length: 20 }),
    favorites: json().$type<string[]>(),
    tradeSettings: json().$type<Record<string, unknown>>(),
    rowCreatedAt: timestampCols.rowCreatedAt,
    rowUpdatedAt: timestampCols.rowUpdatedAt,
});

export type TIdolPlannerUserPrefsS = InferSelectModel<typeof tIdolPlannerUserPrefs>;
export type TIdolPlannerUserPrefsI = InferInsertModel<typeof tIdolPlannerUserPrefs>;

export const sIdolPlannerUserPrefsS = createSelectSchema(tIdolPlannerUserPrefs);
export const sIdolPlannerUserPrefsI = createInsertSchema(tIdolPlannerUserPrefs);
export const sIdolPlannerUserPrefsU = createUpdateSchema(tIdolPlannerUserPrefs);
