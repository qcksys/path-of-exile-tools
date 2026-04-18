import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

export const tAuthAccount = mysqlTable(
    `${DB_TABLE_PREFIX}auth_account`,
    {
        id: varchar({ length: 36 }).primaryKey(),
        accountId: text().notNull(),
        providerId: text().notNull(),
        userId: varchar({ length: 36 }).notNull(),
        accessToken: text(),
        refreshToken: text(),
        idToken: text(),
        accessTokenExpiresAt: timestamp(),
        refreshTokenExpiresAt: timestamp(),
        scope: text(),
        password: text(),
        createdAt: timestampCols.rowCreatedAt,
        updatedAt: timestampCols.rowUpdatedAt,
    },
    (table) => [index("account_userId_idx").on(table.userId)],
);

export type TAuthAccountS = InferSelectModel<typeof tAuthAccount>;
export type TAuthAccountI = InferInsertModel<typeof tAuthAccount>;

export const sAuthAccountS = createSelectSchema(tAuthAccount);
export const sAuthAccountI = createInsertSchema(tAuthAccount);
export const sAuthAccountU = createUpdateSchema(tAuthAccount);
