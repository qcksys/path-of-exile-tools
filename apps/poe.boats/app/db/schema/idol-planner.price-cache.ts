import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

export const tIdolPlannerPriceCache = mysqlTable(`${DB_TABLE_PREFIX}idol_planner_price_cache`, {
    league: varchar({ length: 100 }).primaryKey(),
    prices: json().$type<Record<string, { name: string; chaosValue: number }>>(),
    rowCreatedAt: timestampCols.rowCreatedAt,
    rowUpdatedAt: timestampCols.rowUpdatedAt,
});

export type TIdolPlannerPriceCacheS = InferSelectModel<typeof tIdolPlannerPriceCache>;
export type TIdolPlannerPriceCacheI = InferInsertModel<typeof tIdolPlannerPriceCache>;

export const sIdolPlannerPriceCacheS = createSelectSchema(tIdolPlannerPriceCache);
export const sIdolPlannerPriceCacheI = createInsertSchema(tIdolPlannerPriceCache);
