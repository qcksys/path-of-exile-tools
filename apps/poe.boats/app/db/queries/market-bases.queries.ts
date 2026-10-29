import { marketLeagueTracked } from "@poe-tools/market";
import data from "@poe-tools/market/market-bases-poe1.json";
import { and, desc, eq, gte, inArray, max } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashCohortHourly as hourly } from "~/db/schema/stash.cohort-hourly";
import { tStashHourCoverage } from "~/db/schema/stash.hour-coverage";
import { type MarketBase, type MarketBaseRow, marketBasesSchema } from "~/lib/market-bases";
import type { MarketCategory } from "~/lib/market-categories";
import { traceQuery } from "~/services/tracing.server";
import { endedStashLeagues } from "./stash-league.queries";

// Equipment cohorts are stored for PoE 1 only.
const coverage = tStashHourCoverage.poe1;
const { bases } = marketBasesSchema.parse(data);
const byId = new Map(bases.map((base) => [base.id, base]));

type BaseScope = { realm: string; league: string };
type CohortRow = Pick<
    MarketBaseRow,
    "hour" | "listingCount" | "uniqueSellers" | "unknownCount" | "prices"
> & { cohortId: string };

/** A listed crafting base cohort, or undefined for an unknown or unlisted ID. */
export function marketBase(id: string) {
    return byId.get(id);
}

/** Listed cohort IDs of a category, or the variants of a base: its base type and Cluster skill. */
export function marketBaseIds(filter: {
    category?: MarketCategory | "all";
    variantsOf?: MarketBase;
}) {
    const of = filter.variantsOf;
    return bases
        .filter(
            (base) =>
                (!filter.category || base.category === filter.category) &&
                (!of ||
                    (base.baseType === of.baseType && base.cluster?.skill === of.cluster?.skill)),
        )
        .map((base) => base.id);
}

const cohortColumns = {
    cohortId: hourly.cohortId,
    hour: hourly.hour,
    listingCount: hourly.listingCount,
    uniqueSellers: hourly.uniqueSellers,
    unknownCount: hourly.unknownCount,
    prices: hourly.prices,
};

function baseRows(rows: CohortRow[]) {
    return rows.map(({ cohortId, prices, ...row }) => ({
        ...byId.get(cohortId)!,
        ...row,
        prices: Object.fromEntries(
            Object.entries(prices).map(([currency, { count, min, median, max }]) => [
                currency,
                { count, min, median, max },
            ]),
        ),
    }));
}

/** Each of the listed crafting base cohorts at its latest hour in the window. */
export async function marketBaseRows(
    db: TDatabase,
    scope: BaseScope,
    windowStart: number,
    ids: string[],
): Promise<MarketBaseRow[]> {
    if (!ids.length || scope.realm === "poe2") return [];
    const where = and(eq(hourly.realm, scope.realm), eq(hourly.league, scope.league));
    const latest = db
        .select({ cohortId: hourly.cohortId, hour: max(hourly.hour).as("latest_hour") })
        .from(hourly)
        .where(and(where, gte(hourly.hour, windowStart), inArray(hourly.cohortId, ids)))
        .groupBy(hourly.cohortId)
        .as("latest");
    const rows = await traceQuery(
        "market.base_rows",
        db
            .select(cohortColumns)
            .from(hourly)
            .innerJoin(
                latest,
                and(eq(hourly.cohortId, latest.cohortId), eq(hourly.hour, latest.hour)),
            )
            .where(where),
    );
    return baseRows(rows);
}

/** A crafting base cohort's hourly rows in the window, oldest first. */
export async function marketBaseHistory(
    db: TDatabase,
    scope: BaseScope,
    windowStart: number,
    id: string,
): Promise<MarketBaseRow[]> {
    const rows = await traceQuery(
        "market.base_history",
        db
            .select(cohortColumns)
            .from(hourly, { forceIndex: "stash_cohort_history_idx" })
            .where(
                and(
                    eq(hourly.realm, scope.realm),
                    eq(hourly.league, scope.league),
                    eq(hourly.cohortId, id),
                    gte(hourly.hour, windowStart),
                ),
            ),
    );
    return baseRows(rows).sort((a, b) => a.hour - b.hour);
}

/**
 * The active league with market features whose crafting base cohorts were observed most
 * recently, with that hour, or the most recent ended one when no listed league has cohorts.
 * Reads the hour coverage rollup.
 */
export async function latestBaseSeason(db: TDatabase, realm: string) {
    const [rows, ended] = await Promise.all([
        traceQuery(
            "market.base_season",
            db
                .select({ league: coverage.league, latestHour: max(coverage.hour) })
                .from(coverage)
                .where(and(eq(coverage.stream, "equipment"), eq(coverage.realm, realm)))
                .groupBy(coverage.stream, coverage.realm, coverage.league)
                .orderBy(desc(max(coverage.hour))),
        ),
        endedStashLeagues(db, realm),
    ]);
    const tracked = rows.filter((season) => marketLeagueTracked(season.league));
    const row = tracked.find((season) => !ended.has(season.league)) ?? tracked[0];
    return row ? { league: row.league, latestHour: Number(row.latestHour) } : undefined;
}

/** The newest hour a league's crafting base cohorts were observed. */
export async function baseSeasonLatestHour(db: TDatabase, scope: BaseScope) {
    const [row] = await traceQuery(
        "market.base_latest_hour",
        db
            .select({ latestHour: max(coverage.hour) })
            .from(coverage)
            .where(
                and(
                    eq(coverage.stream, "equipment"),
                    eq(coverage.realm, scope.realm),
                    eq(coverage.league, scope.league),
                ),
            ),
    );
    return row?.latestHour == null ? undefined : Number(row.latestHour);
}
