import {
    bigint,
    index,
    int,
    longtext,
    mysqlTable,
    primaryKey,
    varchar,
} from "drizzle-orm/mysql-core";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";

function stashCheckpoint(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "checkpoint"),
        {
            id: varchar({ length: 36 }).primaryKey(),
            realm: varchar({ length: 10 }).notNull(),
            league: varchar({ length: 100 }).notNull(),
            cursor: varchar({ length: 255 }),
            nextCursor: varchar({ length: 255 }).notNull(),
            capturedAt: bigint({ mode: "number" }).notNull(),
            responseHash: varchar({ length: 64 }).notNull(),
            stashCount: int().notNull(),
            itemCount: int().notNull(),
            responseBytes: int().notNull(),
        },
        (t) => [index("stash_checkpoint_scope_time").on(t.realm, t.league, t.capturedAt, t.id)],
    );
}
export const tStashPoe1Checkpoint = stashCheckpoint("poe1");
export const tStashPoe2Checkpoint = stashCheckpoint("poe2");
export const tStashCheckpoint = { poe1: tStashPoe1Checkpoint, poe2: tStashPoe2Checkpoint };

function stashDailySample(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "daily_sample"),
        {
            realm: varchar({ length: 10 }).notNull(),
            league: varchar({ length: 100 }).notNull(),
            day: varchar({ length: 10 }).notNull(),
            checkpointId: varchar({ length: 36 }).notNull(),
            responseGzip: longtext().notNull(),
        },
        (t) => [primaryKey({ columns: [t.realm, t.league, t.day] })],
    );
}
export const tStashPoe1DailySample = stashDailySample("poe1");
export const tStashPoe2DailySample = stashDailySample("poe2");
export const tStashDailySample = { poe1: tStashPoe1DailySample, poe2: tStashPoe2DailySample };
