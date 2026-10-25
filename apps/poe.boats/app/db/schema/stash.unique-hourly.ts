import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
    bigint,
    boolean,
    index,
    int,
    json,
    mysqlTable,
    primaryKey,
    varchar,
} from "drizzle-orm/mysql-core";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { DB_TABLE_PREFIX } from "~/const";
import { timestampCols } from "~/db/helpers/schema.ts";

/** Listing prices in one currency. Rows ingested before mean and quantiles were added omit them. */
export type MarketPriceSummary = {
    count: number;
    min: number;
    mean?: number;
    p10?: number;
    p25?: number;
    median: number;
    p75?: number;
    p90?: number;
    max: number;
};

/**
 * Permanent hourly summary of public-stash listings, written by
 * @poe-tools/stash-ingest. One row per *market* per hour, where a market
 * is identified by (league, hour, item_key, corrupted, foil_variation,
 * signature_kind, signature_value).
 *
 * `item_key` is the unique's market identity:
 *   - `unid:<icon>`     unidentified unique (variant carried by icon_asset)
 *   - `<name>`          identified unique
 *   - `<baseType>`      currency / non-unique identified bulk
 *
 * Mod-driven variants (Forbidden Flame's allocated notable, Watcher's Eye
 * aura+stat pairs, Impossible Escape keystone, Forbidden Shako support)
 * are tracked as first-class columns:
 *   - `signature_kind`  e.g. `forbidden-jewel`, `watchers-eye`
 *   - `signature_value` deterministic stringified variant (PK component)
 *   - `signature_data`  full structured payload as JSON, for queries that
 *                       need to drill into individual fields (e.g. WHERE
 *                       signature_data->>'$.allocatedNotable' = 'X').
 *
 * Rows with no extracted signature use `signature_kind = ''` and
 * `signature_value = ''` (empty strings, not NULL, so the PK works).
 *
 * Retention is permanent — this table is the long-term price/availability
 * history.
 */
export const tStashUniqueHourly = mysqlTable(
    `${DB_TABLE_PREFIX}stash_unique_hourly`,
    {
        realm: varchar({ length: 10 }).notNull().default("pc"),
        league: varchar({ length: 100 }).notNull(),
        hour: bigint({ mode: "number" }).notNull(),
        itemKey: varchar({ length: 255 }).notNull(),
        identified: boolean().notNull(),
        corrupted: boolean().notNull().default(false),
        foilVariation: int().notNull().default(-1),
        signatureKind: varchar({ length: 32 }).notNull().default(""),
        signatureValue: varchar({ length: 255 }).notNull().default(""),

        iconAsset: varchar({ length: 255 }),
        name: varchar({ length: 100 }),
        baseType: varchar({ length: 100 }).notNull(),
        frameType: int().notNull(),

        listingCount: int().notNull(),
        uniqueSellers: int().notNull(),
        removedCount: int().notNull().default(0),
        likelySales: int().notNull().default(0),
        relistedCount: int().notNull().default(0),
        pendingCount: int().notNull().default(0),
        salesPrices: json().$type<Record<string, MarketPriceSummary>>(),
        prices: json().$type<Record<string, MarketPriceSummary>>(),
        signatureData: json().$type<Record<string, unknown>>(),

        firstSeenAt: varchar({ length: 32 }).notNull(),
        lastSeenAt: varchar({ length: 32 }).notNull(),
        ...timestampCols,
    },
    (table) => [
        primaryKey({
            columns: [
                table.realm,
                table.league,
                table.hour,
                table.itemKey,
                table.identified,
                table.corrupted,
                table.foilVariation,
                table.signatureKind,
                table.signatureValue,
            ],
        }),
        index("idx_stash_unique_league_hour").on(table.league, table.hour),
        index("idx_stash_unique_item").on(table.league, table.itemKey),
        index("idx_stash_unique_sig").on(table.signatureKind, table.signatureValue),
        index("idx_stash_unique_icon").on(table.iconAsset),
        // InnoDB appends the variant primary key; aggregation never needs the JSON payloads.
        index("stash_unique_market_cover_idx").on(
            table.realm,
            table.league,
            table.hour,
            table.listingCount,
            table.likelySales,
            table.removedCount,
            table.pendingCount,
            table.baseType,
            table.frameType,
        ),
    ],
);

export type TStashUniqueHourlyS = InferSelectModel<typeof tStashUniqueHourly>;
export type TStashUniqueHourlyI = InferInsertModel<typeof tStashUniqueHourly>;

export const sStashUniqueHourlyS = createSelectSchema(tStashUniqueHourly);
export const sStashUniqueHourlyI = createInsertSchema(tStashUniqueHourly);
