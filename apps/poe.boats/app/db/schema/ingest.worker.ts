import type { IngestStatus } from "@poe-tools/market";
import { bigint, json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { DB_TABLE_PREFIX } from "~/const";

export const tIngestWorker = mysqlTable(`${DB_TABLE_PREFIX}ingest_worker`, {
    workerId: varchar({ length: 100 }).primaryKey(),
    realm: varchar({ length: 10 }).notNull(),
    league: varchar({ length: 100 }).notNull(),
    receivedAt: bigint({ mode: "number" }).notNull(),
    report: json().$type<IngestStatus>().notNull(),
});
