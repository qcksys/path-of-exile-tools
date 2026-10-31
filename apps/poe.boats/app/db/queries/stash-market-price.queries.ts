import { exchangeSnapshotSchema } from "@poe-tools/market";
import { and, eq, inArray, isNotNull, max, min, notInArray, or, sql } from "drizzle-orm";
import type { MySqlColumn } from "drizzle-orm/mysql-core";
import type { TDatabase } from "~/db/client";
import type { StashGame } from "~/db/helpers/stash-game";
import { tStashMarketDaily } from "~/db/schema/stash.market-daily";
import { type TStashMarketPriceI, tStashMarketPrice } from "~/db/schema/stash.market-price";
import { type TStashUniqueHourlyI, tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";
import { marketLockedPrice } from "~/lib/market-listing-prices";
import { chaosRatesByHour, marketDisplayRate, mergePriceSummaries } from "~/lib/market-price-merge";
import { MOD_POOL_KINDS } from "~/lib/mod-pools";
import type { MarketTab } from "~/schemas/market";
import { marketRateSnapshots } from "./market-rates.queries";

const UPSERT_CHUNK = 200;
const ITEM_CHUNK = 1000;

type MarketKey = {
    itemKey: string;
    identified: boolean;
    corrupted: boolean;
    signatureKind: string;
    signatureValue: string;
};
type PriceScope = { game: StashGame; realm: string; league: string; hour: number };

function marketKey(row: MarketKey) {
    return JSON.stringify([
        row.itemKey,
        Boolean(row.identified),
        Boolean(row.corrupted),
        row.signatureKind,
        row.signatureValue,
    ]);
}

function chunks<T>(values: T[], size: number) {
    return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
        values.slice(index * size, (index + 1) * size),
    );
}

/** Chaos per unit of each currency at the hour. */
async function chaosRatesAt(db: TDatabase, scope: PriceScope, currencies: string[]) {
    const all = [...new Set(["divine", ...currencies])];
    const snapshots = await marketRateSnapshots(db, scope, all, [scope.hour]);
    const toChaos = marketDisplayRate(
        chaosRatesByHour(
            snapshots.map((row) => exchangeSnapshotSchema.parse(row)),
            all,
        ),
        "chaos",
        scope.hour,
    );
    return Object.fromEntries(
        all.flatMap((currency) => {
            const rate = toChaos(currency);
            return rate ? [[currency, rate] as const] : [];
        }),
    );
}

/** The columns an upsert replaces only when the incoming hour is at least as new as the stored one. */
function newestHourSet(table: (typeof tStashMarketPrice)[StashGame]) {
    const newer = sql`values(${table.hour}) >= ${table.hour}`;
    const newest = (column: MySqlColumn) => sql`if(${newer}, values(${column}), ${column})`;
    return {
        priceChaos: newest(table.priceChaos),
        priceDivine: newest(table.priceDivine),
        hour: sql`greatest(${table.hour}, values(${table.hour}))`,
    };
}

/**
 * Locks the prices of the items' markets listed in the hour, for each tab kind and for all tabs,
 * merging their rows as the market list does. An hour without listings leaves a market's price.
 */
async function lockMarketPrices(db: TDatabase, scope: PriceScope, itemKeys: string[]) {
    const { game, realm, league, hour } = scope;
    const hourly = tStashUniqueHourly[game];
    const listed = (
        await db
            .select({
                itemKey: hourly.itemKey,
                identified: hourly.identified,
                corrupted: hourly.corrupted,
                tab: hourly.tab,
                signatureKind: hourly.signatureKind,
                signatureValue: hourly.signatureValue,
                listingCount: hourly.listingCount,
                prices: hourly.prices,
            })
            .from(hourly)
            .where(
                and(
                    eq(hourly.realm, realm),
                    eq(hourly.league, league),
                    eq(hourly.hour, hour),
                    inArray(hourly.itemKey, itemKeys),
                    // A mod pool unique's per-mod markets are not listed.
                    or(
                        notInArray(hourly.signatureKind, [...MOD_POOL_KINDS]),
                        eq(hourly.signatureValue, ""),
                    ),
                ),
            )
    ).filter((row) => row.listingCount > 0);
    if (!listed.length) return;
    const chaosRates = await chaosRatesAt(
        db,
        scope,
        listed.flatMap((row) => Object.keys(row.prices ?? {})),
    );
    const prices: TStashMarketPriceI[] = [...Map.groupBy(listed, marketKey).values()].flatMap(
        (rows) => {
            const { itemKey, signatureKind, signatureValue } = rows[0]!;
            const tabs: MarketTab[] = ["all", "merchant", "other"];
            return tabs.flatMap((tab) => {
                const scoped = tab === "all" ? rows : rows.filter((row) => row.tab === tab);
                if (!scoped.length) return [];
                return {
                    realm,
                    league,
                    itemKey,
                    identified: Boolean(rows[0]!.identified),
                    corrupted: Boolean(rows[0]!.corrupted),
                    tab,
                    signatureKind,
                    signatureValue,
                    hour,
                    ...marketLockedPrice(
                        mergePriceSummaries(scoped.map((row) => row.prices)),
                        chaosRates,
                    ),
                };
            });
        },
    );
    const table = tStashMarketPrice[game];
    for (const batch of chunks(prices, UPSERT_CHUNK))
        await db
            .insert(table)
            .values(batch)
            .onDuplicateKeyUpdate({ set: newestHourSet(table) });
}

/**
 * Locks the prices of delivered market hours, reading each hour's stored rows and exchange rates.
 * An item whose every market is priced from a newer hour is skipped: re-delivering a past hour, as
 * sale status changes do, cannot change what the list shows.
 */
export async function lockDeliveredMarketPrices(
    db: TDatabase,
    game: StashGame,
    rows: Pick<TStashUniqueHourlyI, "realm" | "league" | "hour" | "itemKey" | "listingCount">[],
) {
    const table = tStashMarketPrice[game];
    const listed = rows.filter((row) => row.listingCount > 0);
    for (const group of Map.groupBy(listed, (row) =>
        JSON.stringify([row.realm, row.league]),
    ).values()) {
        const { realm, league } = group[0]!;
        const stored = await db
            .select({ itemKey: table.itemKey, oldest: min(table.hour) })
            .from(table)
            .where(
                and(
                    eq(table.realm, realm),
                    eq(table.league, league),
                    inArray(table.itemKey, [...new Set(group.map((row) => row.itemKey))]),
                ),
            )
            .groupBy(table.itemKey);
        const oldest = new Map(stored.map((row) => [row.itemKey, Number(row.oldest)]));
        const current = group.filter((row) => (oldest.get(row.itemKey) ?? 0) <= row.hour);
        for (const hourRows of Map.groupBy(current, (row) => row.hour).values())
            await lockMarketPrices(db, { game, realm, league, hour: hourRows[0]!.hour }, [
                ...new Set(hourRows.map((row) => row.itemKey)),
            ]);
    }
}

/**
 * Rebuilds the game's market prices from stored hours, each at its own hour's rates: every market's
 * newest listed hour, oldest hour first, so a market's newest hour is the one that stays.
 */
export async function refreshStashMarketPrices(
    db: TDatabase,
    scope: { game: StashGame; realm?: string; league?: string },
) {
    const daily = tStashMarketDaily[scope.game];
    const latest = await db
        .select({
            realm: daily.realm,
            league: daily.league,
            itemKey: daily.itemKey,
            hour: max(daily.listedHour),
        })
        .from(daily)
        .where(
            and(
                scope.realm === undefined ? undefined : eq(daily.realm, scope.realm),
                scope.league === undefined ? undefined : eq(daily.league, scope.league),
                isNotNull(daily.listedHour),
            ),
        )
        .groupBy(
            daily.realm,
            daily.league,
            daily.itemKey,
            daily.identified,
            daily.corrupted,
            daily.tab,
            daily.signatureKind,
            daily.signatureValue,
        );
    const hours = Map.groupBy(latest, (row) => JSON.stringify([row.realm, row.league, row.hour]));
    const ordered = [...hours.values()].sort((a, b) => Number(a[0]!.hour) - Number(b[0]!.hour));
    for (const rows of ordered) {
        const { realm, league, hour } = rows[0]!;
        const itemKeys = [...new Set(rows.map((row) => row.itemKey))];
        for (const keys of chunks(itemKeys, ITEM_CHUNK))
            await lockMarketPrices(
                db,
                { game: scope.game, realm, league, hour: Number(hour) },
                keys,
            );
    }
}
