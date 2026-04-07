import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, datetime, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

export const tAuthUser = mysqlTable(`${DB_TABLE_PREFIX}auth_user`, {
  id: varchar({ length: 36 }).primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  emailVerified: boolean().default(false).notNull(),
  image: text(),
  createdAt: timestampCols.rowCreatedAt,
  updatedAt: timestampCols.rowUpdatedAt,
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  role: varchar({ length: 255 }).default("user").notNull(),
  banned: boolean().default(false).notNull(),
  banReason: text(),
  banExpires: datetime(),
});

export type TAuthUserS = InferSelectModel<typeof tAuthUser>;
export type TAuthUserI = InferInsertModel<typeof tAuthUser>;

export const sAuthUserS = createSelectSchema(tAuthUser);
export const sAuthUserI = createInsertSchema(tAuthUser);
export const sAuthUserU = createUpdateSchema(tAuthUser);
