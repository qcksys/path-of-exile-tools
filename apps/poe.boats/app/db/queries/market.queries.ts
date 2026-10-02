import { and, asc, desc, eq, getTableColumns, gte, like, max, min, or, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashUniqueHourly as market } from "~/db/schema/stash.unique-hourly";
import type { MarketFilters } from "~/schemas/market";

const PAGE_SIZE = 50;

export async function getMarketData(db: TDatabase, input: MarketFilters) {
    const seasons = await db
        .select({
            league: market.league,
            firstHour: min(market.hour),
            latestHour: max(market.hour),
        })
        .from(market)
        .where(eq(market.realm, input.realm))
        .groupBy(market.league)
        .orderBy(desc(max(market.hour)));
    const filters = { ...input, league: input.league || seasons[0]?.league || "" };
    const season = seasons.find((entry) => entry.league === filters.league);
    const cutoff = Number(season?.latestHour ?? 0) - Number(filters.days) * 86400 + 3600;
    const scope = and(
        eq(market.realm, filters.realm),
        eq(market.league, filters.league),
        gte(market.hour, cutoff),
    );
    const partition = sql`${market.itemKey}, ${market.identified}, ${market.corrupted}, ${market.foilVariation}, ${market.signatureKind}, ${market.signatureValue}`;
    const search = filters.q ? `%${filters.q.replace(/[\\%_]/g, "\\$&")}%` : undefined;
    const ranked = db
        .select({
            ...getTableColumns(market),
            rank: sql<number>`row_number() over (partition by ${partition} order by (${market.listingCount} > 0) desc, ${market.hour} desc)`.as(
                "market_rank",
            ),
            periodSales: sql<number>`sum(${market.likelySales}) over (partition by ${partition})`
                .mapWith(Number)
                .as("period_sales"),
            periodRemovals:
                sql<number>`sum(${market.removedCount}) over (partition by ${partition})`
                    .mapWith(Number)
                    .as("period_removals"),
            periodPending: sql<number>`sum(${market.pendingCount}) over (partition by ${partition})`
                .mapWith(Number)
                .as("period_pending"),
        })
        .from(market)
        .where(
            and(
                scope,
                search
                    ? or(
                          like(market.name, search),
                          like(market.itemKey, search),
                          like(market.signatureValue, search),
                      )
                    : undefined,
            ),
        )
        .as("ranked");
    const rowsPromise = db
        .select()
        .from(ranked)
        .where(eq(ranked.rank, 1))
        .orderBy(
            desc(ranked.periodSales),
            asc(ranked.itemKey),
            asc(ranked.identified),
            asc(ranked.corrupted),
            asc(ranked.foilVariation),
            asc(ranked.signatureKind),
            asc(ranked.signatureValue),
        )
        .limit(PAGE_SIZE + 1)
        .offset((filters.page - 1) * PAGE_SIZE);
    const historyPromise = filters.item
        ? db
              .select()
              .from(market)
              .where(
                  and(
                      scope,
                      eq(market.itemKey, filters.item),
                      eq(market.identified, filters.identified === "true"),
                      eq(market.corrupted, filters.corrupted === "true"),
                      eq(market.foilVariation, filters.foil),
                      eq(market.signatureKind, filters.kind),
                      eq(market.signatureValue, filters.value),
                  ),
              )
              .orderBy(asc(market.hour))
              .limit(2160)
        : Promise.resolve([]);
    const [rows, history] = await Promise.all([rowsPromise, historyPromise]);
    return {
        filters,
        seasons,
        season,
        rows: rows.slice(0, PAGE_SIZE),
        hasMore: rows.length > PAGE_SIZE,
        history,
    };
}
