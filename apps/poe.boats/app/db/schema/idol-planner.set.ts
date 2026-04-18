import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, index, json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

export const tIdolPlannerSet = mysqlTable(
    `${DB_TABLE_PREFIX}idol_planner_set`,
    {
        id: varchar({ length: 36 }).primaryKey(),
        userId: varchar({ length: 36 }).notNull(),
        name: varchar({ length: 50 }).notNull(),
        mapDevice: json().$type<{
            slots: Array<{ slotIndex: number; scarabId: string | null }>;
            craftingOptionId: string | null;
        }>(),
        unlockedConditions: json().$type<string[]>(),
        isActive: boolean().default(false).notNull(),
        ...timestampCols,
    },
    (table) => [index("idx_idol_set_user").on(table.userId)],
);

export type TIdolPlannerSetS = InferSelectModel<typeof tIdolPlannerSet>;
export type TIdolPlannerSetI = InferInsertModel<typeof tIdolPlannerSet>;

export const sIdolPlannerSetS = createSelectSchema(tIdolPlannerSet);
export const sIdolPlannerSetI = createInsertSchema(tIdolPlannerSet);
export const sIdolPlannerSetU = createUpdateSchema(tIdolPlannerSet);
