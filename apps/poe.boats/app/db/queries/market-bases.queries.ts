import data from "@poe-tools/market/market-bases-poe1.json";
import { and, eq, gte, inArray, max } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashCohortHourly as hourly } from "~/db/schema/stash.cohort-hourly";
import { type MarketBaseRow, marketBasesSchema } from "~/lib/market-bases";
import type { MarketFilters } from "~/schemas/market";
import { traceQuery } from "~/services/tracing.server";

const { revision, bases } = marketBasesSchema.parse(data);
const byId = new Map(bases.map((base) => [base.id, base]));

/** Each listed crafting base cohort of the category at its latest hour in the window. */
export async function marketBaseRows(
    db: TDatabase,
    filters: MarketFilters,
    windowStart: number,
): Promise<MarketBaseRow[]> {
    const ids = bases.filter((base) => base.category === filters.category).map((base) => base.id);
    if (!ids.length || filters.realm === "poe2") return [];
    const scope = and(eq(hourly.realm, filters.realm), eq(hourly.league, filters.league));
    const latest = db
        .select({ cohortId: hourly.cohortId, hour: max(hourly.hour).as("latest_hour") })
        .from(hourly)
        .where(and(scope, gte(hourly.hour, windowStart), inArray(hourly.cohortId, ids)))
        .groupBy(hourly.cohortId)
        .as("latest");
    const rows = await traceQuery(
        "market.base_rows",
        db
            .select({
                cohortId: hourly.cohortId,
                revision: hourly.revision,
                hour: hourly.hour,
                listingCount: hourly.listingCount,
                uniqueSellers: hourly.uniqueSellers,
                unknownCount: hourly.unknownCount,
                prices: hourly.prices,
            })
            .from(hourly)
            .innerJoin(
                latest,
                and(eq(hourly.cohortId, latest.cohortId), eq(hourly.hour, latest.hour)),
            )
            .where(scope),
    );
    // Reclassified hours hold a row per revision; prefer the current one, then the fullest.
    const chosen = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
        const previous = chosen.get(row.cohortId);
        const current = row.revision === revision;
        if (
            !previous ||
            (current !== (previous.revision === revision)
                ? current
                : row.listingCount > previous.listingCount)
        )
            chosen.set(row.cohortId, row);
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
