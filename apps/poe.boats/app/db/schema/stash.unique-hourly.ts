import { eq } from "drizzle-orm";
import {
    boolean,
    char,
    index,
    int,
    json,
    mysqlTable,
    mysqlView,
    primaryKey,
    tinyint,
    uniqueIndex,
    varchar,
} from "drizzle-orm/mysql-core";
import { createSelectSchema } from "drizzle-orm/zod";
import { type StashGame, stashTableName } from "~/db/helpers/stash-game";

/** The kind of public stash tab a market's listings were in; empty before tabs were recorded. */
export const STASH_LISTING_TABS = ["merchant", "other", ""] as const;
export type StashListingTab = (typeof STASH_LISTING_TABS)[number];

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

/** The columns that identify a public-stash market; `identityHash` is the md5 of them. */
export const STASH_MARKET_IDENTITY = [
    "realm",
    "league",
    "itemKey",
    "identified",
    "corrupted",
    "links",
    "tab",
    "signatureKind",
    "signatureValue",
] as const;

/**
 * Every public-stash market, written by @poe-tools/stash-ingest. A market is identified by
 * (realm, league, item_key, identified, corrupted, links, tab, signature_kind, signature_value),
 * stored once here so each hourly row carries only its `id`. Foil and non-foil listings share a
 * market.
 *
 * `links` is 5 or 6 for a unique whose largest linked socket group has that many sockets, as
 * poe.ninja splits them, otherwise 0.
 *
 * `tab` is `merchant` for listings in Faustus's merchant tabs (stash type `TradeStash`), `other`
 * for every other public tab, and empty for listings captured before tabs were recorded.
 *
 * `item_key` is the unique's market identity:
 *   - `unid:<icon>`     unidentified unique (variant carried by icon_asset)
 *   - `<name>`          identified unique
 *   - `<baseType>`      currency / non-unique identified bulk
 *
 * Mod-driven variants (Forbidden Flame's allocated notable, Impossible Escape keystone, Forbidden
 * Shako support) are identified by `signature_kind` and the deterministic `signature_value`;
 * `signature_data` holds the structured payload. Rows with no extracted signature use empty
 * strings, not NULL. A mod pool unique (Watcher's Eye) has one market for the item with an empty
 * value, plus a market per mod and mod count (`3 mods: Haste: You have Phasing`).
 *
 * The descriptive columns (icon, name, base type, frame, signature data) keep the latest delivery.
 */
function stashMarket(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "market"),
        {
            id: int({ unsigned: true }).autoincrement().primaryKey(),
            identityHash: char({ length: 32 }).notNull(),
            realm: varchar({ length: 10 }).notNull(),
            league: varchar({ length: 100 }).notNull(),
            itemKey: varchar({ length: 255 }).notNull(),
            identified: boolean().notNull(),
            corrupted: boolean().notNull().default(false),
            links: tinyint().notNull().default(0),
            tab: varchar({ length: 8 }).$type<StashListingTab>().notNull().default(""),
            signatureKind: varchar({ length: 32 }).notNull().default(""),
            signatureValue: varchar({ length: 255 }).notNull().default(""),
            iconAsset: varchar({ length: 255 }),
            name: varchar({ length: 100 }),
            baseType: varchar({ length: 100 }).notNull(),
            frameType: int().notNull(),
            signatureData: json().$type<Record<string, unknown>>(),
        },
        (table) => [
            uniqueIndex("stash_market_identity_idx").on(table.identityHash),
            index("stash_market_item_idx").on(table.realm, table.league, table.itemKey),
        ],
    );
}
export const tStashPoe1Market = stashMarket("poe1");
export const tStashPoe2Market = stashMarket("poe2");
export const tStashMarket = { poe1: tStashPoe1Market, poe2: tStashPoe2Market };

/**
 * Permanent hourly summary of each market's public-stash listings. The key leads with the hour,
 * so each delivered hour appends; `stash_market_hour_market_idx` serves a market's history.
 *
 * `newCount` is the listings first seen in the hour; it is null for hours ingested before it was
 * counted. `soldAgeSeconds` is the likely sales' average time from first seen to removed; it is null
 * for hours without likely sales and hours ingested before it was recorded. `delistedPrices` is the
 * last asks of removals that are not likely sales, relists or undecided; it is null for hours
 * ingested before it was recorded.
 */
function stashMarketHour(game: StashGame) {
    return mysqlTable(
        stashTableName(game, "market_hour"),
        {
            hour: int({ unsigned: true }).notNull(),
            marketId: int({ unsigned: true }).notNull(),
            listingCount: int().notNull(),
            uniqueSellers: int().notNull(),
            newCount: int(),
            soldAgeSeconds: int({ unsigned: true }),
            removedCount: int().notNull().default(0),
            likelySales: int().notNull().default(0),
            relistedCount: int().notNull().default(0),
            pendingCount: int().notNull().default(0),
            salesPrices: json().$type<Record<string, MarketPriceSummary>>(),
            delistedPrices: json().$type<Record<string, MarketPriceSummary>>(),
            prices: json().$type<Record<string, MarketPriceSummary>>(),
            firstSeenAt: varchar({ length: 32 }).notNull(),
            lastSeenAt: varchar({ length: 32 }).notNull(),
        },
        (table) => [
            primaryKey({ columns: [table.hour, table.marketId] }),
            index("stash_market_hour_market_idx").on(table.marketId, table.hour),
        ],
    );
}
export const tStashPoe1MarketHour = stashMarketHour("poe1");
export const tStashPoe2MarketHour = stashMarketHour("poe2");
export const tStashMarketHour = { poe1: tStashPoe1MarketHour, poe2: tStashPoe2MarketHour };

/** Each market hour with its market's identity and description, as one row per market per hour. */
function stashUniqueHourly(game: StashGame) {
    const market = tStashMarket[game];
    const hour = tStashMarketHour[game];
    return mysqlView(stashTableName(game, "unique_hourly")).as((qb) =>
        qb
            .select({
                realm: market.realm,
                league: market.league,
                hour: hour.hour,
                itemKey: market.itemKey,
                identified: market.identified,
                corrupted: market.corrupted,
                links: market.links,
                tab: market.tab,
                signatureKind: market.signatureKind,
                signatureValue: market.signatureValue,
                iconAsset: market.iconAsset,
                name: market.name,
                baseType: market.baseType,
                frameType: market.frameType,
                listingCount: hour.listingCount,
                uniqueSellers: hour.uniqueSellers,
                newCount: hour.newCount,
                soldAgeSeconds: hour.soldAgeSeconds,
                removedCount: hour.removedCount,
                likelySales: hour.likelySales,
                relistedCount: hour.relistedCount,
                pendingCount: hour.pendingCount,
                salesPrices: hour.salesPrices,
                delistedPrices: hour.delistedPrices,
                prices: hour.prices,
                signatureData: market.signatureData,
                firstSeenAt: hour.firstSeenAt,
                lastSeenAt: hour.lastSeenAt,
            })
            .from(hour)
            .innerJoin(market, eq(market.id, hour.marketId)),
    );
}
export const tStashPoe1UniqueHourly = stashUniqueHourly("poe1");
export const tStashPoe2UniqueHourly = stashUniqueHourly("poe2");
export const tStashUniqueHourly = { poe1: tStashPoe1UniqueHourly, poe2: tStashPoe2UniqueHourly };

export type TStashUniqueHourlyS = typeof tStashPoe1UniqueHourly.$inferSelect;
export const sStashUniqueHourlyS = createSelectSchema(tStashPoe1UniqueHourly);
/** One market hour as ingest delivers it; omitted counts and identity axes take their defaults. */
export type TStashUniqueHourlyI = Pick<
    TStashUniqueHourlyS,
    | "realm"
    | "league"
    | "hour"
    | "itemKey"
    | "identified"
    | "baseType"
    | "frameType"
    | "listingCount"
    | "uniqueSellers"
    | "firstSeenAt"
    | "lastSeenAt"
> &
    Partial<
        Pick<
            TStashUniqueHourlyS,
            | "corrupted"
            | "links"
            | "tab"
            | "signatureKind"
            | "signatureValue"
            | "iconAsset"
            | "name"
            | "signatureData"
            | "newCount"
            | "soldAgeSeconds"
            | "removedCount"
            | "likelySales"
            | "relistedCount"
            | "pendingCount"
            | "salesPrices"
            | "delistedPrices"
            | "prices"
        >
    >;
