import {
    bigint,
    index,
    int,
    longtext,
    mysqlTable,
    primaryKey,
    varchar,
} from "drizzle-orm/mysql-core";
import { DB_TABLE_PREFIX } from "~/const";

export const tStashCheckpoint = mysqlTable(
    `${DB_TABLE_PREFIX}stash_checkpoint`,
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

export const tStashDailySample = mysqlTable(
    `${DB_TABLE_PREFIX}stash_daily_sample`,
    {
        realm: varchar({ length: 10 }).notNull(),
        league: varchar({ length: 100 }).notNull(),
        day: varchar({ length: 10 }).notNull(),
        checkpointId: varchar({ length: 36 }).notNull(),
        responseGzip: longtext().notNull(),
    },
    (t) => [primaryKey({ columns: [t.realm, t.league, t.day] })],
);
