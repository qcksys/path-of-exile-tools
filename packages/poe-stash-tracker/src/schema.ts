import type { Item } from "@poe-tools/api-client";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tListing = sqliteTable(
  "listing",
  {
    accountName: text().notNull(),
    stashId: text().notNull(),
    itemId: text().notNull(),
    league: text().notNull(),
    itemKey: text().notNull(),
    identified: integer({ mode: "boolean" }).notNull(),
    typeLine: text().notNull(),
    baseType: text().notNull(),
    name: text(),
    corrupted: integer({ mode: "boolean" }).notNull().default(false),
    foilVariation: integer(),
    priceAmount: real(),
    priceCurrency: text(),
    iconAsset: text(),
    rawItem: text({ mode: "json" }).$type<Item>(),
    firstSeenAt: integer({ mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer({ mode: "timestamp_ms" }).notNull(),
    removedAt: integer({ mode: "timestamp_ms" }),
  },
  (t) => [
    primaryKey({ columns: [t.accountName, t.stashId, t.itemId] }),
    index("listing_item_key_idx").on(t.itemKey, t.league),
    index("listing_active_idx").on(t.removedAt),
    index("listing_icon_asset_idx").on(t.iconAsset),
  ],
);

// Asset-path → canonical unique identity. Built from identified uniques
// observed in the stream; used to resolve unidentified drops that share a
// baseType with many different uniques (e.g. Cobalt Jewel → Forbidden Flesh
// vs That Which Was Taken vs Uber Cortex).
export const tIconBasemap = sqliteTable("icon_basemap", {
  iconAsset: text().primaryKey(),
  name: text().notNull(),
  baseType: text().notNull(),
  seenCount: integer().notNull().default(1),
  firstSeenAt: integer({ mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer({ mode: "timestamp_ms" }).notNull(),
});

export const tCurrencyRate = sqliteTable(
  "currency_rate",
  {
    league: text().notNull(),
    marketId: text().notNull(),
    observedHour: integer().notNull(),
    lowestRatio: text({ mode: "json" }).$type<Record<string, number>>().notNull(),
    highestRatio: text({ mode: "json" }).$type<Record<string, number>>().notNull(),
    volumeTraded: text({ mode: "json" }).$type<Record<string, number>>().notNull(),
    lowestStock: text({ mode: "json" }).$type<Record<string, number>>().notNull(),
    highestStock: text({ mode: "json" }).$type<Record<string, number>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.league, t.marketId, t.observedHour] })],
);

export const tStreamCursor = sqliteTable("stream_cursor", {
  streamName: text().primaryKey(),
  cursor: text().notNull(),
  updatedAt: integer({ mode: "timestamp_ms" }).notNull(),
});
