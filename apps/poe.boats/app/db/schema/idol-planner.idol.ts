import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, index, json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

export const tIdolPlannerIdol = mysqlTable(
    `${DB_TABLE_PREFIX}idol_planner_idol`,
    {
        id: varchar({ length: 36 }).primaryKey(),
        setId: varchar({ length: 36 }).notNull(),
        data: json().$type<{
            id: string;
            baseType: string;
            itemLevel: number;
            rarity: string;
            name?: string;
            implicit?: { text: string; value: number };
            prefixes: Array<{
                modId: string;
                type: string;
                text?: string;
                rolledValue: number;
                tier: number | null;
            }>;
            suffixes: Array<{
                modId: string;
                type: string;
                text?: string;
                rolledValue: number;
                tier: number | null;
            }>;
        }>(),
        importedAt: bigint({ mode: "number" }).notNull(),
        source: varchar({ length: 20 }).notNull(),
        ...timestampCols,
    },
    (table) => [index("idx_idol_set").on(table.setId)],
);

export type TIdolPlannerIdolS = InferSelectModel<typeof tIdolPlannerIdol>;
export type TIdolPlannerIdolI = InferInsertModel<typeof tIdolPlannerIdol>;

export const sIdolPlannerIdolS = createSelectSchema(tIdolPlannerIdol);
export const sIdolPlannerIdolI = createInsertSchema(tIdolPlannerIdol);
export const sIdolPlannerIdolU = createUpdateSchema(tIdolPlannerIdol);
