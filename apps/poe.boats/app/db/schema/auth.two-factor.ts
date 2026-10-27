import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, index, int, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";

export const tAuthTwoFactor = mysqlTable(
    `${DB_TABLE_PREFIX}auth_two_factor`,
    {
        id: varchar({ length: 36 }).primaryKey(),
        secret: varchar({ length: 255 }).notNull(),
        backupCodes: text().notNull(),
        userId: varchar({ length: 36 }).notNull(),
        verified: boolean().default(true),
        failedVerificationCount: int().default(0),
        lockedUntil: timestamp({ fsp: 3 }),
    },
    (table) => [
        index("twoFactor_secret_idx").on(table.secret),
        index("twoFactor_userId_idx").on(table.userId),
    ],
);

export type TAuthTwoFactorS = InferSelectModel<typeof tAuthTwoFactor>;
export type TAuthTwoFactorI = InferInsertModel<typeof tAuthTwoFactor>;

export const sAuthTwoFactorS = createSelectSchema(tAuthTwoFactor);
export const sAuthTwoFactorI = createInsertSchema(tAuthTwoFactor);
export const sAuthTwoFactorU = createUpdateSchema(tAuthTwoFactor);
