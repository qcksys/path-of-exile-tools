import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

export const tAuthVerification = mysqlTable(
  `${DB_TABLE_PREFIX}auth_verification`,
  {
    id: varchar({ length: 36 }).primaryKey(),
    identifier: varchar({ length: 255 }).notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ fsp: 3 }).notNull(),
    createdAt: timestampCols.rowCreatedAt,
    updatedAt: timestampCols.rowUpdatedAt,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export type TAuthVerificationS = InferSelectModel<typeof tAuthVerification>;
export type TAuthVerificationI = InferInsertModel<typeof tAuthVerification>;

export const sAuthVerificationS = createSelectSchema(tAuthVerification);
export const sAuthVerificationI = createInsertSchema(tAuthVerification);
export const sAuthVerificationU = createUpdateSchema(tAuthVerification);
