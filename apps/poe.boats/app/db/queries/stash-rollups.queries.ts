import { and, between, eq, inArray, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { STASH_GAMES, type StashGame } from "~/db/helpers/stash-game";
import { tStashCohortHourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCurrencyDaily } from "~/db/schema/stash.currency-daily";
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

type RollupScope = { game: StashGame; realm?: string; league?: string };

/** Recomputes the game's market daily rows for every day touching [fromHour, toHour], optionally for some items only. */
export function refreshStashMarketDaily(
    db: TDatabase,
    scope: RollupScope & { fromHour?: number; toHour?: number; itemKeys?: string[] },
) {
    const hourly = tStashUniqueHourly[scope.game];
    const daily = tStashMarketDaily[scope.game];
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
                    tab: hourly.tab,
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
                    hourly.tab,
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

/** Recomputes the game's currency daily rows for every day touching [fromHour, toHour], optionally for some markets only. */
export function refreshStashCurrencyDaily(
    db: TDatabase,
    scope: RollupScope & { fromHour?: number; toHour?: number; marketIds?: string[] },
) {
    const hourly = tStashCurrencyHourly[scope.game];
    const daily = tStashCurrencyDaily[scope.game];
    const day = sql<number>`floor(${hourly.hour} / ${sql.raw(String(DAY))}) * ${sql.raw(String(DAY))}`;
    // Units traded of the market ID's first (1) or second (-1) item.
    const side = (index: 1 | -1) =>
        sql<number>`cast(json_extract(${hourly.volumeTraded}, concat('$."', substring_index(${hourly.marketId}, '|', ${sql.raw(String(index))}), '"')) as unsigned)`;
    const traded = sql`${side(1)} > 0 and ${side(-1)} > 0`;
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
                    marketId: hourly.marketId,
                    firstVolume:
                        sql<number>`coalesce(sum(case when ${traded} then ${side(1)} end), 0)`.as(
                            "firstVolume",
                        ),
                    secondVolume:
                        sql<number>`coalesce(sum(case when ${traded} then ${side(-1)} end), 0)`.as(
                            "secondVolume",
                        ),
                    tradedHours: sql<number>`count(case when ${traded} then 1 end)`.as(
                        "tradedHours",
                    ),
                    latestHour: sql<
                        number | null
                    >`max(case when ${traded} then ${hourly.hour} end)`.as("latestHour"),
                })
                .from(hourly)
                .where(
                    and(
                        scope.realm === undefined ? undefined : eq(hourly.realm, scope.realm),
                        scope.league === undefined ? undefined : eq(hourly.league, scope.league),
                        hours,
                        scope.marketIds ? inArray(hourly.marketId, scope.marketIds) : undefined,
                    ),
                )
                .groupBy(hourly.realm, hourly.league, day, hourly.marketId),
        )
        .onDuplicateKeyUpdate({
            set: {
                firstVolume: sql`values(${daily.firstVolume})`,
                secondVolume: sql`values(${daily.secondVolume})`,
                tradedHours: sql`values(${daily.tradedHours})`,
                latestHour: sql`values(${daily.latestHour})`,
            },
        });
}

/** The hourly streams each game stores; equipment cohorts are PoE 1 only. */
export const COVERAGE_STREAMS = {
    poe1: ["currency", "uniques", "equipment"],
    poe2: ["currency", "uniques"],
} as const satisfies Record<StashGame, readonly StashCoverageStream[]>;

function coverageSource(game: StashGame, stream: StashCoverageStream) {
    if (stream === "currency")
        return { table: tStashCurrencyHourly[game], index: "stash_currency_coverage_idx" };
    if (stream === "uniques")
        return { table: tStashUniqueHourly[game], index: "stash_unique_market_cover_idx" };
    if (game !== "poe1") throw new Error("Equipment cohorts are stored for PoE 1 only.");
    // The primary key leads with the hour.
    return { table: tStashCohortHourly, index: "PRIMARY" };
}

/** Recounts the game's hour coverage for a stream's hours (every stored hour when `hours` is omitted). */
export function refreshStashHourCoverage(
    db: TDatabase,
    stream: StashCoverageStream,
    scope: RollupScope & { hours?: number[] },
) {
    const { table, index } = coverageSource(scope.game, stream);
    const coverage = tStashHourCoverage[scope.game];
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
export function upsertStashCurrencyMarkets(
    db: TDatabase,
    game: StashGame,
    rows: TStashCurrencyMarketI[],
) {
    const market = tStashCurrencyMarket[game];
    return db
        .insert(market)
        .values(rows)
        .onDuplicateKeyUpdate({
            set: { firstHour: sql`least(${market.firstHour}, values(${market.firstHour}))` },
        });
}

/** Rebuilds the game's currency markets from every stored hour. */
export function refreshStashCurrencyMarkets(db: TDatabase, scope: RollupScope) {
    const hourly = tStashCurrencyHourly[scope.game];
    const market = tStashCurrencyMarket[scope.game];
    return db
        .insert(market)
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
            set: { firstHour: sql`least(${market.firstHour}, values(${market.firstHour}))` },
        });
}

/** Rebuilds every rollup from the hourly tables, of one game or of both. */
export async function refreshStashRollups(
    db: TDatabase,
    scope: Omit<RollupScope, "game"> & { game?: StashGame } = {},
) {
    for (const game of scope.game ? [scope.game] : STASH_GAMES) {
        const scoped = { ...scope, game };
        await refreshStashMarketDaily(db, scoped);
        await refreshStashCurrencyDaily(db, scoped);
        await refreshStashCurrencyMarkets(db, scoped);
        for (const stream of COVERAGE_STREAMS[game])
            await refreshStashHourCoverage(db, stream, scoped);
    }
}
