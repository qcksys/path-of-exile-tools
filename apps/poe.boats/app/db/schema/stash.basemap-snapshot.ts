import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { timestampCols } from "~/db/helpers/schema.ts";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";

/**
 * Public mirror of the icon-asset → unique-name basemap so consumers can
 * resolve unidentified-listing buckets (`unid:<iconAsset>`) without joining
 * to a private DB.
 */
function stashBasemapSnapshot(game: StashGame) {
    return mysqlTable(stashTableName(game, "basemap_snapshot"), {
        iconAsset: varchar({ length: 255 }).primaryKey(),
        name: varchar({ length: 100 }).notNull(),
        baseType: varchar({ length: 100 }).notNull(),
        seenCount: bigint({ mode: "number" }).notNull(),
        ...timestampCols,
    });
}
export const tStashPoe1BasemapSnapshot = stashBasemapSnapshot("poe1");
export const tStashPoe2BasemapSnapshot = stashBasemapSnapshot("poe2");
export const tStashBasemapSnapshot = {
    poe1: tStashPoe1BasemapSnapshot,
    poe2: tStashPoe2BasemapSnapshot,
};

export type TStashBasemapSnapshotS = InferSelectModel<typeof tStashPoe1BasemapSnapshot>;
export type TStashBasemapSnapshotI = InferInsertModel<typeof tStashPoe1BasemapSnapshot>;

export const sStashBasemapSnapshotS = createSelectSchema(tStashPoe1BasemapSnapshot);
export const sStashBasemapSnapshotI = createInsertSchema(tStashPoe1BasemapSnapshot);
