import { type CohortHourly, cohortBaseTypes, type MarketCohortDefinition } from "@poe-tools/market";
import { and, count, eq, inArray, lt, lte, type SQL, sql } from "drizzle-orm";
import type { MySqlColumn } from "drizzle-orm/mysql-core";
import type { TDatabase } from "~/db/client.ts";
import { type StashGame, stashGame } from "~/db/helpers/stash-game";
import { tStashBasemapSnapshot } from "~/db/schema/stash.basemap-snapshot";
import { tStashCohort } from "~/db/schema/stash.cohort";
import { tStashCohortHourly } from "~/db/schema/stash.cohort-hourly";
import { tStashCohortRevision } from "~/db/schema/stash.cohort-revision";
import { type CohortPriceWindows, tStashCohortWindow } from "~/db/schema/stash.cohort-window";
import {
    type TStashCurrencyHourlyI,
    tStashCurrencyHourly,
} from "~/db/schema/stash.currency-hourly";
import type { TStashCurrencyMarketI } from "~/db/schema/stash.currency-market";
import type { StashCoverageStream } from "~/db/schema/stash.hour-coverage";
import { type TStashUniqueHourlyI, tStashUniqueHourly } from "~/db/schema/stash.unique-hourly";
import { isYellowBeast, yellowBeastMarket } from "~/lib/crafting-yellow-beasts";
import {
    refreshStashCurrencyDaily,
    refreshStashHourCoverage,
    refreshStashMarketDaily,
    refreshYellowBeastHourly,
    upsertStashCurrencyMarkets,
    utcDay,
} from "./stash-rollups.queries";

const UPSERT_CHUNK = 200;
/** Hours of 6/24-hour cohort price windows kept; equipment prices read the latest 24 completed hours. */
export const COHORT_WINDOW_RETENTION_HOURS = 48;

type HourlyKey = { realm: string; league: string; hour: number };

function byLeague<T extends HourlyKey>(rows: T[]) {
    const groups = new Map<string, { game: StashGame; realm: string; league: string; rows: T[] }>();
    for (const row of rows) {
        const key = JSON.stringify([row.realm, row.league]);
        const group = groups.get(key) ?? {
            game: stashGame(row.realm),
            realm: row.realm,
            league: row.league,
            rows: [],
        };
        group.rows.push(row);
        groups.set(key, group);
    }
    return [...groups.values()];
}

function byGame<T extends { realm: string }>(rows: T[]) {
    const groups = new Map<StashGame, T[]>();
    for (const row of rows) {
        const game = stashGame(row.realm);
        groups.set(game, [...(groups.get(game) ?? []), row]);
    }
    return [...groups];
}

/** Recounts the stored rows of every hour the batch wrote. */
async function refreshCoverage(
    db: TDatabase,
    stream: StashCoverageStream,
    rows: HourlyKey[],
    run: (write: () => PromiseLike<unknown>) => PromiseLike<unknown> = (write) => write(),
) {
    for (const { game, realm, league, rows: leagueRows } of byLeague(rows)) {
        const hours = [...new Set(leagueRows.map((row) => row.hour))];
        await run(() => refreshStashHourCoverage(db, stream, { game, realm, league, hours }));
    }
}

/** PoE 1 equipment cohort definitions; each replaces the stored definition of its ID. */
export async function insertStashCohorts(
    db: TDatabase,
    rows: MarketCohortDefinition[],
): Promise<number> {
    for (const batch of chunk(rows, UPSERT_CHUNK))
        await db
            .insert(tStashCohort)
            .values(batch.map((row) => ({ ...row, baseTypes: cohortBaseTypes(row) })))
            .onDuplicateKeyUpdate({
                set: {
                    revision: sql`values(${tStashCohort.revision})`,
                    catalogHash: sql`values(${tStashCohort.catalogHash})`,
                    name: sql`values(${tStashCohort.name})`,
                    purpose: sql`values(${tStashCohort.purpose})`,
                    query: sql`values(${tStashCohort.query})`,
                    baseTypes: sql`values(${tStashCohort.baseTypes})`,
                },
            });
    return rows.length;
}

/** Each revision's sequence number, numbering unseen revisions in first-seen order. */
async function cohortRevisionSeqs(db: TDatabase, revisions: string[]) {
    const revision = tStashCohortRevision;
    const read = () =>
        db
            .select({ seq: revision.seq, revision: revision.revision })
            .from(revision)
            .where(inArray(revision.revision, revisions));
    let rows = await read();
    const missing = revisions.filter((value) => !rows.some((row) => row.revision === value));
    if (missing.length) {
        await db
            .insert(revision)
            .values(missing.map((value) => ({ revision: value })))
            .onDuplicateKeyUpdate({ set: { revision: sql`${revision.revision}` } });
        rows = await read();
    }
    return new Map(rows.map((row) => [row.revision, row.seq]));
}

/**
 * Columns an upsert replaces only when the incoming row's revision is at least as new as the
 * stored one. `revisionSeq` itself takes the greater value, so the outcome does not depend on the
 * order MySQL assigns the columns in.
 */
function newestRevisionSet<T extends string>(
    revisionSeq: MySqlColumn,
    columns: Record<T, MySqlColumn>,
): Record<T | "revisionSeq", SQL> {
    const newer = sql`values(${revisionSeq}) >= ${revisionSeq}`;
    const set = {} as Record<T | "revisionSeq", SQL>;
    for (const [name, column] of Object.entries(columns) as [T, MySqlColumn][])
        set[name] = sql`if(${newer}, values(${column}), ${column})`;
    set.revisionSeq = sql`greatest(${revisionSeq}, values(${revisionSeq}))`;
    return set;
}

/** Splits the 6/24-hour windows out of a cohort row's prices. */
export function splitCohortPriceWindows(prices: CohortHourly["prices"]) {
    const hourly: CohortHourly["prices"] = {};
    const windows: CohortPriceWindows = {};
    for (const [currency, { windows: currencyWindows, ...price }] of Object.entries(prices)) {
        hourly[currency] = price;
        if (currencyWindows) windows[currency] = currencyWindows;
    }
    return { prices: hourly, windows };
}

/** Deletes the given cohort hours of one revision sequence and older. */
function deleteCohortHours(
    db: TDatabase,
    table: typeof tStashCohortHourly | typeof tStashCohortWindow,
    scope: { realm: string; league: string; revisionSeq: number },
    keys: Array<{ hour: number; cohortId: string }>,
) {
    return db.delete(table).where(
        and(
            eq(table.realm, scope.realm),
            eq(table.league, scope.league),
            lte(table.revisionSeq, scope.revisionSeq),
            sql`(${table.hour}, ${table.cohortId}) in (${sql.join(
                keys.map(({ hour, cohortId }) => sql`(${hour}, ${cohortId})`),
                sql`, `,
            )})`,
        ),
    );
}

/**
 * Stores PoE 1 equipment cohort hours that have asking prices. Each cohort hour keeps the newest
 * catalog revision's row; an older revision delivered later leaves it unchanged. A cohort hour
 * without prices is not stored, so lookups use the cohort's latest priced hour, and it deletes a
 * row an earlier delivery of that hour stored.
 */
export async function upsertStashCohortHourly(
    db: TDatabase,
    rows: CohortHourly[],
): Promise<number> {
    if (rows.length === 0) return 0;
    const seqs = await cohortRevisionSeqs(db, [...new Set(rows.map((row) => row.revision))]);
    const windowCutoff =
        Math.floor(Date.now() / 3_600_000) * 3600 - COHORT_WINDOW_RETENTION_HOURS * 3600;
    const hourly = tStashCohortHourly;
    const window = tStashCohortWindow;
    for (const batch of chunk(rows, UPSERT_CHUNK)) {
        const incoming = batch.map(({ revision, prices, ...row }) => ({
            ...row,
            revisionSeq: seqs.get(revision)!,
            ...splitCohortPriceWindows(prices),
        }));
        const empty = incoming.filter((row) => Object.keys(row.prices).length === 0);
        for (const group of Map.groupBy(empty, ({ realm, league, revisionSeq }) =>
            JSON.stringify([realm, league, revisionSeq]),
        ).values()) {
            const scope = group[0]!;
            await deleteCohortHours(db, hourly, scope, group);
            await deleteCohortHours(db, window, scope, group);
        }
        const split = incoming.filter((row) => Object.keys(row.prices).length > 0);
        if (!split.length) continue;
        await db
            .insert(hourly)
            .values(split.map(({ windows: _windows, ...row }) => row))
            .onDuplicateKeyUpdate({
                set: newestRevisionSet(hourly.revisionSeq, {
                    listingCount: hourly.listingCount,
                    uniqueSellers: hourly.uniqueSellers,
                    unknownCount: hourly.unknownCount,
                    prices: hourly.prices,
                    confidenceMethod: hourly.confidenceMethod,
                    firstSeenAt: hourly.firstSeenAt,
                    lastSeenAt: hourly.lastSeenAt,
                }),
            });
        // Every recent row gets a window row, even an empty one, so an outdated window never applies.
        const recent = split.filter((row) => row.hour >= windowCutoff);
        if (recent.length)
            await db
                .insert(window)
                .values(
                    recent.map(({ realm, league, hour, cohortId, revisionSeq, windows }) => ({
                        realm,
                        league,
                        hour,
                        cohortId,
                        revisionSeq,
                        windows,
                    })),
                )
                .onDuplicateKeyUpdate({
                    set: newestRevisionSet(window.revisionSeq, { windows: window.windows }),
                });
    }
    for (const { realm, league } of byLeague(rows))
        await db
            .delete(window)
            .where(
                and(
                    eq(window.realm, realm),
                    eq(window.league, league),
                    lt(window.hour, windowCutoff),
                ),
            );
    // One recount per request: each scans the hour's cohort rows, and a request carries one hour.
    // A failed request is retried whole, so its hours are recounted then.
    await refreshCoverage(db, "equipment", rows);
    return rows.length;
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

export async function upsertStashUniqueHourly(
    db: TDatabase,
    rows: TStashUniqueHourlyI[],
): Promise<number> {
    if (rows.length === 0) return 0;
    let written = 0;
    for (const [game, gameRows] of byGame(rows)) {
        const table = tStashUniqueHourly[game];
        const itemDays = new Map<
            string,
            { realm: string; league: string; day: number; itemKeys: Set<string> }
        >();
        for (const batch of chunk(gameRows, UPSERT_CHUNK)) {
            await db
                .insert(table)
                .values(batch)
                .onDuplicateKeyUpdate({
                    set: {
                        iconAsset: sql`values(${table.iconAsset})`,
                        name: sql`values(${table.name})`,
                        baseType: sql`values(${table.baseType})`,
                        frameType: sql`values(${table.frameType})`,
                        listingCount: sql`values(${table.listingCount})`,
                        uniqueSellers: sql`values(${table.uniqueSellers})`,
                        removedCount: sql`values(${table.removedCount})`,
                        likelySales: sql`values(${table.likelySales})`,
                        relistedCount: sql`values(${table.relistedCount})`,
                        pendingCount: sql`values(${table.pendingCount})`,
                        salesPrices: sql`values(${table.salesPrices})`,
                        prices: sql`values(${table.prices})`,
                        signatureData: sql`values(${table.signatureData})`,
                        firstSeenAt: sql`values(${table.firstSeenAt})`,
                        lastSeenAt: sql`values(${table.lastSeenAt})`,
                    },
                });
            for (const row of batch) {
                const day = utcDay(row.hour);
                const key = JSON.stringify([row.realm, row.league, day]);
                const entry = itemDays.get(key) ?? {
                    realm: row.realm,
                    league: row.league,
                    day,
                    itemKeys: new Set<string>(),
                };
                entry.itemKeys.add(row.itemKey);
                itemDays.set(key, entry);
            }
            await refreshCoverage(db, "uniques", batch);
            written += batch.length;
        }
        const yellowBeasts = gameRows.filter((row) => isYellowBeast(row.itemKey));
        for (const { realm, league, rows: leagueRows } of byLeague(yellowBeasts)) {
            const hours = [...new Set(leagueRows.map((row) => row.hour))];
            await refreshYellowBeastHourly(db, { game, realm, league, hours });
            for (const hour of hours)
                itemDays
                    .get(JSON.stringify([realm, league, utcDay(hour)]))
                    ?.itemKeys.add(yellowBeastMarket);
        }
        // Each rollup re-reads the whole day of its items, so it runs once per item day after every
        // chunk is stored rather than once per chunk. A failed request is retried whole.
        for (const { realm, league, day, itemKeys } of itemDays.values())
            for (const keys of chunk([...itemKeys], UPSERT_CHUNK))
                await refreshStashMarketDaily(db, {
                    game,
                    realm,
                    league,
                    fromHour: day,
                    toHour: day,
                    itemKeys: keys,
                });
    }
    return written;
}

export async function countStashCurrencyHour(
    db: TDatabase,
    realm: string,
    hour: number,
    leagues: string[],
): Promise<number> {
    if (leagues.length === 0) return 0;
    const table = tStashCurrencyHourly[stashGame(realm)];
    const [row] = await db
        .select({ rows: count() })
        .from(table)
        .where(and(eq(table.realm, realm), inArray(table.league, leagues), eq(table.hour, hour)));
    return row?.rows ?? 0;
}

export async function upsertStashCurrencyHourly(
    db: TDatabase,
    rows: TStashCurrencyHourlyI[],
): Promise<number> {
    if (rows.length === 0) return 0;
    let written = 0;
    const ordered = rows.toSorted((a, b) => {
        for (const [left, right] of [
            [a.realm, b.realm],
            [a.league, b.league],
            [a.marketId, b.marketId],
        ] as const) {
            if (left < right) return -1;
            if (left > right) return 1;
        }
        return a.hour - b.hour;
    });
    for (const [game, gameRows] of byGame(ordered)) {
        const table = tStashCurrencyHourly[game];
        for (const batch of chunk(gameRows, UPSERT_CHUNK)) {
            await retryCurrencyDeadlock(() =>
                db
                    .insert(table)
                    .values(batch)
                    .onDuplicateKeyUpdate({
                        set: {
                            lowestRatio: sql`values(${table.lowestRatio})`,
                            highestRatio: sql`values(${table.highestRatio})`,
                            volumeTraded: sql`values(${table.volumeTraded})`,
                            lowestStock: sql`values(${table.lowestStock})`,
                            highestStock: sql`values(${table.highestStock})`,
                        },
                    }),
            );
            // Batches are sorted by market then hour, so each market's first row has its earliest hour.
            const markets = new Map<string, TStashCurrencyMarketI>();
            for (const row of batch) {
                const key = JSON.stringify([row.realm, row.league, row.marketId]);
                if (!markets.has(key))
                    markets.set(key, {
                        realm: row.realm,
                        league: row.league,
                        marketId: row.marketId,
                        firstHour: row.hour,
                    });
            }
            await retryCurrencyDeadlock(() =>
                upsertStashCurrencyMarkets(db, game, [...markets.values()]),
            );
            for (const { realm, league, rows: leagueRows } of byLeague(batch)) {
                const days = new Map<number, Set<string>>();
                for (const row of leagueRows) {
                    const day = utcDay(row.hour);
                    days.set(day, (days.get(day) ?? new Set()).add(row.marketId));
                }
                for (const [day, marketIds] of days)
                    await retryCurrencyDeadlock(() =>
                        refreshStashCurrencyDaily(db, {
                            game,
                            realm,
                            league,
                            fromHour: day,
                            toHour: day,
                            marketIds: [...marketIds],
                        }),
                    );
            }
            // Concurrent writers (the cron and cxapi) recount the same hours, so retry deadlocks here too.
            await refreshCoverage(db, "currency", batch, retryCurrencyDeadlock);
            written += batch.length;
        }
    }
    return written;
}

function isDeadlock(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    if (
        ("errno" in error && error.errno === 1213) ||
        ("code" in error && error.code === "ER_LOCK_DEADLOCK")
    )
        return true;
    // Inspect the driver cause, not Drizzle's SQL/parameter text in its wrapper message.
    if ("cause" in error && error.cause) return isDeadlock(error.cause);
    return error instanceof Error && /\bDeadlock found\b.*\(errno 1213\)/is.test(error.message);
}

async function retryCurrencyDeadlock(write: () => PromiseLike<unknown>) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await write();
        } catch (error) {
            if (attempt === 2 || !isDeadlock(error)) throw error;
            // Each batch is one autocommitted upsert, so only the deadlock victim needs replay.
            await new Promise((resolve) =>
                setTimeout(resolve, 25 * 2 ** attempt + Math.random() * 25),
            );
        }
    }
}

export async function upsertStashBasemapSnapshot(
    db: TDatabase,
    game: StashGame,
    rows: Array<{ iconAsset: string; name: string; baseType: string; seenCount: number }>,
): Promise<number> {
    if (rows.length === 0) return 0;
    const table = tStashBasemapSnapshot[game];
    let written = 0;
    for (const batch of chunk(rows, UPSERT_CHUNK)) {
        await db
            .insert(table)
            .values(batch)
            .onDuplicateKeyUpdate({
                set: {
                    name: sql`values(${table.name})`,
                    baseType: sql`values(${table.baseType})`,
                    seenCount: sql`values(${table.seenCount})`,
                },
            });
        written += batch.length;
    }
    return written;
}
