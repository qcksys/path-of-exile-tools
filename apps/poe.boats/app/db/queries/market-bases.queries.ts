import data from "@poe-tools/market/market-bases-poe1.json";
import { and, desc, eq, gte, inArray, max } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashCohortHourly as hourly } from "~/db/schema/stash.cohort-hourly";
import { type MarketBase, type MarketBaseRow, marketBasesSchema } from "~/lib/market-bases";
import type { MarketCategory } from "~/lib/market-categories";
import { traceQuery } from "~/services/tracing.server";

const { revision, bases } = marketBasesSchema.parse(data);
const byId = new Map(bases.map((base) => [base.id, base]));

type BaseScope = { realm: string; league: string };
type CohortRow = Pick<
    MarketBaseRow,
    "hour" | "listingCount" | "uniqueSellers" | "unknownCount" | "prices"
> & { cohortId: string; revision: string };

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
    revision: hourly.revision,
    hour: hourly.hour,
    listingCount: hourly.listingCount,
    uniqueSellers: hourly.uniqueSellers,
    unknownCount: hourly.unknownCount,
    prices: hourly.prices,
};

/**
 * One row per cohort and hour. Reclassified hours hold a row per revision; prefer the current
 * one, then the fullest.
 */
function currentRevisionRows(rows: CohortRow[]) {
    const chosen = new Map<string, CohortRow>();
    for (const row of rows) {
        const key = `${row.cohortId}\0${row.hour}`;
        const previous = chosen.get(key);
        const current = row.revision === revision;
        if (
            !previous ||
            (current !== (previous.revision === revision)
                ? current
                : row.listingCount > previous.listingCount)
        )
            chosen.set(key, row);
    }
    return [...chosen.values()].map(({ cohortId, revision: _revision, prices, ...row }) => ({
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
    return currentRevisionRows(rows);
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
    return currentRevisionRows(rows).sort((a, b) => a.hour - b.hour);
}

/** The league whose crafting base cohorts were observed most recently, with that hour. */
export async function latestBaseSeason(db: TDatabase, realm: string) {
    const [row] = await traceQuery(
        "market.base_season",
        db
            .select({ league: hourly.league, latestHour: max(hourly.hour) })
            .from(hourly)
            .where(eq(hourly.realm, realm))
            .groupBy(hourly.realm, hourly.league)
            .orderBy(desc(max(hourly.hour)))
            .limit(1),
    );
    return row ? { league: row.league, latestHour: Number(row.latestHour) } : undefined;
}

/** The newest hour a league's crafting base cohorts were observed. */
export async function baseSeasonLatestHour(db: TDatabase, scope: BaseScope) {
    const [row] = await traceQuery(
        "market.base_latest_hour",
        db
            .select({ latestHour: max(hourly.hour) })
            .from(hourly)
            .where(and(eq(hourly.realm, scope.realm), eq(hourly.league, scope.league))),
    );
    return row?.latestHour == null ? undefined : Number(row.latestHour);
}
