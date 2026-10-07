import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, int, json, mysqlEnum, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema";
import type { CraftingBundle } from "~/schemas/crafting-workspace";

export const tCraftingShare = mysqlTable(
    `${DB_TABLE_PREFIX}crafting_share`,
    {
        id: varchar({ length: 36 }).primaryKey(),
        userId: varchar({ length: 36 }).notNull(),
        targetKind: mysqlEnum(["project", "build"]).notNull(),
        targetId: varchar({ length: 100 }).notNull(),
        mode: mysqlEnum(["frozen", "live"]).notNull(),
        snapshot: json().$type<CraftingBundle>(),
        workspaceRevision: int({ unsigned: true }).notNull(),
        rowCreatedAt: timestampCols.rowCreatedAt,
        rowUpdatedAt: timestampCols.rowUpdatedAt,
        rowDeletedAt: timestampCols.rowDeletedAt,
    },
    (table) => [index("crafting_share_user_idx").on(table.userId)],
);
export type TCraftingShareS = InferSelectModel<typeof tCraftingShare>;
export type TCraftingShareI = InferInsertModel<typeof tCraftingShare>;
export const sCraftingShareS = createSelectSchema(tCraftingShare);
export const sCraftingShareI = createInsertSchema(tCraftingShare);
export const sCraftingShareU = createUpdateSchema(tCraftingShare);
