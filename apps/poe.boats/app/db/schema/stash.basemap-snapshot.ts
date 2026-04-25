import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

/**
 * Public mirror of the icon-asset → unique-name basemap so consumers can
 * resolve unidentified-listing buckets (`unid:<iconAsset>`) without joining
 * to a private DB.
 */
export const tStashBasemapSnapshot = mysqlTable(`${DB_TABLE_PREFIX}stash_basemap_snapshot`, {
  iconAsset: varchar({ length: 255 }).primaryKey(),
  name: varchar({ length: 100 }).notNull(),
  baseType: varchar({ length: 100 }).notNull(),
  seenCount: bigint({ mode: "number" }).notNull(),
  ...timestampCols,
});

export type TStashBasemapSnapshotS = InferSelectModel<typeof tStashBasemapSnapshot>;
export type TStashBasemapSnapshotI = InferInsertModel<typeof tStashBasemapSnapshot>;

export const sStashBasemapSnapshotS = createSelectSchema(tStashBasemapSnapshot);
export const sStashBasemapSnapshotI = createInsertSchema(tStashBasemapSnapshot);
