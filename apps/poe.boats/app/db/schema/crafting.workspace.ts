import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { int, json, mysqlEnum, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema";
import type { CraftingBundle } from "~/schemas/crafting-workspace";

export const tCraftingWorkspace = mysqlTable(`${DB_TABLE_PREFIX}crafting_workspace`, {
    userId: varchar({ length: 36 }).primaryKey(),
    bundle: json().$type<CraftingBundle>().notNull(),
    revision: int({ unsigned: true }).notNull().default(0),
    defaultStorage: mysqlEnum(["local", "cloud"]),
    rowCreatedAt: timestampCols.rowCreatedAt,
    rowUpdatedAt: timestampCols.rowUpdatedAt,
    rowDeletedAt: timestampCols.rowDeletedAt,
});
export type TCraftingWorkspaceS = InferSelectModel<typeof tCraftingWorkspace>;
export type TCraftingWorkspaceI = InferInsertModel<typeof tCraftingWorkspace>;
export const sCraftingWorkspaceS = createSelectSchema(tCraftingWorkspace);
export const sCraftingWorkspaceI = createInsertSchema(tCraftingWorkspace);
export const sCraftingWorkspaceU = createUpdateSchema(tCraftingWorkspace);
