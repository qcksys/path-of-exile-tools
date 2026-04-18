import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, mysqlTable, tinyint, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

export const tIdolPlannerPlacement = mysqlTable(
    `${DB_TABLE_PREFIX}idol_planner_placement`,
    {
        id: varchar({ length: 36 }).primaryKey(),
        setId: varchar({ length: 36 }).notNull(),
        idolId: varchar({ length: 36 }).notNull(),
        posX: tinyint().notNull(),
        posY: tinyint().notNull(),
        rowCreatedAt: timestampCols.rowCreatedAt,
        rowUpdatedAt: timestampCols.rowUpdatedAt,
    },
    (table) => [index("idx_placement_set").on(table.setId)],
);

export type TIdolPlannerPlacementS = InferSelectModel<typeof tIdolPlannerPlacement>;
export type TIdolPlannerPlacementI = InferInsertModel<typeof tIdolPlannerPlacement>;

export const sIdolPlannerPlacementS = createSelectSchema(tIdolPlannerPlacement);
export const sIdolPlannerPlacementI = createInsertSchema(tIdolPlannerPlacement);
export const sIdolPlannerPlacementU = createUpdateSchema(tIdolPlannerPlacement);
