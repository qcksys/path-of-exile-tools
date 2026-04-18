import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

export const tAuthSession = mysqlTable(
    `${DB_TABLE_PREFIX}auth_session`,
    {
        id: varchar({ length: 36 }).primaryKey(),
        userId: varchar({ length: 36 }).notNull(),
        expiresAt: timestamp().notNull(),
        token: varchar({ length: 255 }).notNull().unique(),
        createdAt: timestampCols.rowCreatedAt,
        updatedAt: timestampCols.rowUpdatedAt,
        ipAddress: text(),
        userAgent: text(),
        impersonatedBy: varchar({ length: 36 }),
    },
    (table) => [index("session_userId_idx").on(table.userId)],
);

export type TAuthSessionS = InferSelectModel<typeof tAuthSession>;
export type TAuthSessionI = InferInsertModel<typeof tAuthSession>;

export const sAuthSessionS = createSelectSchema(tAuthSession);
export const sAuthSessionI = createInsertSchema(tAuthSession);
export const sAuthSessionU = createUpdateSchema(tAuthSession);
