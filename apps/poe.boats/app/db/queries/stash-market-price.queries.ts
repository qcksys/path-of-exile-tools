import { exchangeSnapshotSchema } from "@poe-tools/market";
import { and, eq, inArray, isNotNull, max, notInArray, or, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import type { StashGame } from "~/db/helpers/stash-game";
import { tStashMarketDaily } from "~/db/schema/stash.market-daily";
import {
    type TStashUniqueHourlyI,
    tStashMarket,
    tStashMarketHour,
} from "~/db/schema/stash.unique-hourly";
import { marketLockedPrice } from "~/lib/market-listing-prices";
import { chaosRatesByHour, marketDisplayRate, mergePriceSummaries } from "~/lib/market-price-merge";
import { MOD_POOL_KINDS } from "~/lib/mod-pools";
import { marketRateSnapshots } from "./market-rates.queries";

const UPSERT_CHUNK = 200;
const ITEM_CHUNK = 1000;

type PriceScope = { game: StashGame; realm: string; league: string; hour: number };

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

/**
 * Locks the prices of the items' markets listed in the hour with a row not yet priced, merging each
 * market's rows as the market list does. Markets whose rows are all priced keep their prices, so
 * re-delivering an hour reads no rates and writes nothing.
 */
async function lockMarketPrices(db: TDatabase, scope: PriceScope, itemKeys: string[]) {
    const { game, realm, league, hour } = scope;
    const market = tStashMarket[game];
    const table = tStashMarketHour[game];
    const rows = await db
        .select({
            marketId: table.marketId,
            itemKey: market.itemKey,
            identified: market.identified,
            corrupted: market.corrupted,
            tab: market.tab,
            signatureKind: market.signatureKind,
            signatureValue: market.signatureValue,
            prices: table.prices,
            priceChaos: table.priceChaos,
            priceDivine: table.priceDivine,
            allTabsPriceChaos: table.allTabsPriceChaos,
            allTabsPriceDivine: table.allTabsPriceDivine,
        })
        .from(market)
        .innerJoin(table, and(eq(table.marketId, market.id), eq(table.hour, hour)))
        .where(
            and(
                eq(market.realm, realm),
                eq(market.league, league),
                inArray(market.itemKey, itemKeys),
                sql`${table.listingCount} > 0`,
                // A mod pool unique's per-mod markets are not listed.
                or(
                    notInArray(market.signatureKind, [...MOD_POOL_KINDS]),
                    eq(market.signatureValue, ""),
                ),
            ),
        );
    const markets = [
        ...Map.groupBy(rows, (row) =>
            JSON.stringify([
                row.itemKey,
                Boolean(row.identified),
                Boolean(row.corrupted),
                row.signatureKind,
                row.signatureValue,
            ]),
        ).values(),
    ].filter((group) =>
        group.some(
            (row) =>
                Object.keys(row.prices ?? {}).length > 0 &&
                row.priceChaos === null &&
                row.priceDivine === null &&
                row.allTabsPriceChaos === null &&
                row.allTabsPriceDivine === null,
        ),
    );
    if (!markets.length) return;
    const chaosRates = await chaosRatesAt(
        db,
        scope,
        markets.flat().flatMap((row) => Object.keys(row.prices ?? {})),
    );
    const locked = markets.flatMap((group) => {
        const merged = (scoped: typeof group) =>
            marketLockedPrice(mergePriceSummaries(scoped.map((row) => row.prices)), chaosRates);
        const allTabs = merged(group);
        return [...Map.groupBy(group, (row) => row.tab).values()].flatMap((tabRows) => {
            const price = merged(tabRows);
            return tabRows.map((row) => ({
                hour,
                marketId: row.marketId,
                // The hour's rows are stored by now, so these only satisfy the insert's columns.
                listingCount: 0,
                uniqueSellers: 0,
                firstSeenAt: "",
                lastSeenAt: "",
                ...price,
                allTabsPriceChaos: allTabs.priceChaos,
                allTabsPriceDivine: allTabs.priceDivine,
            }));
        });
    });
    for (const batch of chunks(locked, UPSERT_CHUNK))
        await db
            .insert(table)
            .values(batch)
            .onDuplicateKeyUpdate({
                set: {
                    priceChaos: sql`values(${table.priceChaos})`,
                    priceDivine: sql`values(${table.priceDivine})`,
                    allTabsPriceChaos: sql`values(${table.allTabsPriceChaos})`,
                    allTabsPriceDivine: sql`values(${table.allTabsPriceDivine})`,
                },
            });
}

/** Locks the prices of delivered market hours, reading each hour's stored rows and exchange rates. */
export async function lockDeliveredMarketPrices(
    db: TDatabase,
    game: StashGame,
    rows: Pick<TStashUniqueHourlyI, "realm" | "league" | "hour" | "itemKey" | "listingCount">[],
) {
    const listed = rows.filter((row) => row.listingCount > 0);
    for (const group of Map.groupBy(listed, (row) =>
        JSON.stringify([row.realm, row.league, row.hour]),
    ).values()) {
        const { realm, league, hour } = group[0]!;
        await lockMarketPrices(db, { game, realm, league, hour }, [
            ...new Set(group.map((row) => row.itemKey)),
        ]);
    }
}

/**
 * Locks the prices of stored hours written before ingest locked them, each at its own hour's rates:
 * every market's newest listed hour, which is the one the market list reads.
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
    for (const rows of Map.groupBy(latest, (row) =>
        JSON.stringify([row.realm, row.league, row.hour]),
    ).values()) {
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
