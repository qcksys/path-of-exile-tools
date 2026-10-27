import { and, between, eq, inArray, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashCohortHourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCurrencyHourly } from "~/db/schema/stash.currency-hourly";
import {
    type TStashCurrencyMarketI,
    tStashCurrencyMarket,
} from "~/db/schema/stash.currency-market";
import { type StashCoverageStream, tStashHourCoverage } from "~/db/schema/stash.hour-coverage";
import { tStashMarketDaily } from "~/db/schema/stash.market-daily";
import { tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";
import { MOD_POOL_KINDS } from "~/lib/mod-pools";

// Every rollup is recomputed from the hourly rows it summarises: the ingester re-pushes whole
// hours (sale corrections, late unid resolutions), so increments would double count.

const DAY = 86400;

export function utcDay(hour: number) {
    return Math.floor(hour / DAY) * DAY;
}

type RollupScope = { realm?: string; league?: string };

/** Recomputes `stash_market_daily` for every day touching [fromHour, toHour], optionally for some items only. */
export function refreshStashMarketDaily(
    db: TDatabase,
    scope: RollupScope & { fromHour?: number; toHour?: number; itemKeys?: string[] },
) {
    const hourly = tStashUniqueHourly;
    const daily = tStashMarketDaily;
    // Literals keep the select and group-by expressions identical under ONLY_FULL_GROUP_BY.
    const day = sql<number>`floor(${hourly.hour} / ${sql.raw(String(DAY))}) * ${sql.raw(String(DAY))}`;
    const pools = sql.raw(MOD_POOL_KINDS.map((kind) => `'${kind}'`).join(", "));
    // A mod pool unique's combinations are one market; the item page reads them from the hourly rows.
    const value = sql<string>`case when ${hourly.signatureKind} in (${pools}) then '' else ${hourly.signatureValue} end`;
    const hours =
        scope.fromHour === undefined || scope.toHour === undefined
            ? undefined
            : between(hourly.hour, utcDay(scope.fromHour), utcDay(scope.toHour) + DAY - 1);
    return db
        .insert(daily)
        .select(
            db
                .select({
                    realm: hourly.realm,
                    league: hourly.league,
                    day: day.as("day"),
                    itemKey: hourly.itemKey,
                    identified: hourly.identified,
                    corrupted: hourly.corrupted,
                    foilVariation: hourly.foilVariation,
                    signatureKind: hourly.signatureKind,
                    signatureValue: value.as("signatureValue"),
                    name: sql<string | null>`max(${hourly.name})`.as("name"),
                    baseType: sql<string>`max(${hourly.baseType})`.as("baseType"),
                    frameType: sql<number>`max(${hourly.frameType})`.as("frameType"),
                    likelySales: sql<number>`sum(${hourly.likelySales})`.as("likelySales"),
                    removedCount: sql<number>`sum(${hourly.removedCount})`.as("removedCount"),
                    pendingCount: sql<number>`sum(${hourly.pendingCount})`.as("pendingCount"),
                    latestHour: sql<number>`max(${hourly.hour})`.as("latestHour"),
                    listedHour: sql<
                        number | null
                    >`max(case when ${hourly.listingCount} > 0 then ${hourly.hour} end)`.as(
                        "listedHour",
                    ),
                })
                // (league, itemKey) plus the appended (realm, hour) reads each item's day as one range.
                .from(hourly, scope.itemKeys ? { forceIndex: "idx_stash_unique_item" } : undefined)
                .where(
                    and(
                        scope.realm === undefined ? undefined : eq(hourly.realm, scope.realm),
                        scope.league === undefined ? undefined : eq(hourly.league, scope.league),
                        hours,
                        scope.itemKeys ? inArray(hourly.itemKey, scope.itemKeys) : undefined,
                    ),
                )
                .groupBy(
                    hourly.realm,
                    hourly.league,
                    day,
                    hourly.itemKey,
                    hourly.identified,
                    hourly.corrupted,
                    hourly.foilVariation,
                    hourly.signatureKind,
                    value,
                ),
        )
        .onDuplicateKeyUpdate({
            set: {
                name: sql`values(${daily.name})`,
                baseType: sql`values(${daily.baseType})`,
                frameType: sql`values(${daily.frameType})`,
                likelySales: sql`values(${daily.likelySales})`,
                removedCount: sql`values(${daily.removedCount})`,
                pendingCount: sql`values(${daily.pendingCount})`,
                latestHour: sql`values(${daily.latestHour})`,
                listedHour: sql`values(${daily.listedHour})`,
            },
        });
}

const COVERAGE_SOURCES = {
    currency: { table: tStashCurrencyHourly, index: "stash_currency_coverage_idx" },
    uniques: { table: tStashUniqueHourly, index: "stash_unique_market_cover_idx" },
    equipment: { table: tStashCohortHourly, index: "stash_cohort_coverage_idx" },
} as const;

/** Recounts `stash_hour_coverage` for a stream's hours (every stored hour when `hours` is omitted). */
export function refreshStashHourCoverage(
    db: TDatabase,
    stream: StashCoverageStream,
    scope: RollupScope & { hours?: number[] },
) {
    const { table, index } = COVERAGE_SOURCES[stream];
    const coverage = tStashHourCoverage;
    return db
        .insert(coverage)
        .select(
            db
                .select({
                    stream: sql<StashCoverageStream>`${stream}`.as("stream"),
                    realm: table.realm,
                    league: table.league,
                    hour: table.hour,
                    rowCount: sql<number>`count(*)`.as("rowCount"),
                })
                .from(table, { forceIndex: index })
                .where(
                    and(
                        scope.realm === undefined ? undefined : eq(table.realm, scope.realm),
                        scope.league === undefined ? undefined : eq(table.league, scope.league),
                        scope.hours ? inArray(table.hour, scope.hours) : undefined,
                    ),
                )
                .groupBy(table.realm, table.league, table.hour),
        )
        .onDuplicateKeyUpdate({ set: { rowCount: sql`values(${coverage.rowCount})` } });
}

/** Records each market's earliest hour; an older hour arriving later lowers it. */
export function upsertStashCurrencyMarkets(db: TDatabase, rows: TStashCurrencyMarketI[]) {
    return db
        .insert(tStashCurrencyMarket)
        .values(rows)
        .onDuplicateKeyUpdate({
            set: {
                firstHour: sql`least(${tStashCurrencyMarket.firstHour}, values(${tStashCurrencyMarket.firstHour}))`,
            },
        });
}

/** Rebuilds `stash_currency_market` from every stored hour. */
export function refreshStashCurrencyMarkets(db: TDatabase, scope: RollupScope = {}) {
    const hourly = tStashCurrencyHourly;
    return db
        .insert(tStashCurrencyMarket)
        .select(
            db
                .select({
                    realm: hourly.realm,
                    league: hourly.league,
                    marketId: hourly.marketId,
                    firstHour: sql<number>`min(${hourly.hour})`.as("firstHour"),
                })
                .from(hourly)
                .where(
                    and(
                        scope.realm === undefined ? undefined : eq(hourly.realm, scope.realm),
                        scope.league === undefined ? undefined : eq(hourly.league, scope.league),
                    ),
                )
                .groupBy(hourly.realm, hourly.league, hourly.marketId),
        )
        .onDuplicateKeyUpdate({
            set: {
                firstHour: sql`least(${tStashCurrencyMarket.firstHour}, values(${tStashCurrencyMarket.firstHour}))`,
            },
        });
}

/** Rebuilds every rollup from the hourly tables, as the migration's backfill does. */
export async function refreshStashRollups(db: TDatabase, scope: RollupScope = {}) {
    await refreshStashMarketDaily(db, scope);
    await refreshStashCurrencyMarkets(db, scope);
    for (const stream of Object.keys(COVERAGE_SOURCES) as StashCoverageStream[])
        await refreshStashHourCoverage(db, stream, scope);
}
