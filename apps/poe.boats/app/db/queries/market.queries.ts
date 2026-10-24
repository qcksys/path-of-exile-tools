import { and, asc, desc, eq, getTableColumns, gte, like, max, min, or, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashUniqueHourly as market } from "~/db/schema/stash.unique-hourly";
import { marketCategory, marketCategoryFilter } from "~/lib/market-categories.server";
import type { MarketFilters } from "~/schemas/market";

const PAGE_SIZE = 50;

export async function getMarketData(
    db: TDatabase,
    input: MarketFilters,
    view: "all" | "list" | "history" = "all",
) {
    // Group by the full index prefix so MySQL can skip between season boundaries.
    const seasons = await db
        .select({
            league: market.league,
            firstHour: min(market.hour),
            latestHour: max(market.hour),
        })
        .from(market)
        .where(eq(market.realm, input.realm))
        .groupBy(market.realm, market.league)
        .orderBy(desc(max(market.hour)));
    const filters = { ...input, league: input.league || seasons[0]?.league || "" };
    const season = seasons.find((entry) => entry.league === filters.league);
    const cutoff = Number(season?.latestHour ?? 0) - Number(filters.days) * 86400 + 3600;
    const scope = and(
        eq(market.realm, filters.realm),
        eq(market.league, filters.league),
        gte(market.hour, cutoff),
    );
    const search = filters.q ? `%${filters.q.replace(/[\\%_]/g, "\\$&")}%` : undefined;
    const priceOrder = filters.order === "price-asc" || filters.order === "price-desc";
    const rarity = { normal: 0, magic: 1, rare: 2, unique: 3 };
    const grouped = db
        .select({
            itemKey: market.itemKey,
            identified: market.identified,
            corrupted: market.corrupted,
            foilVariation: market.foilVariation,
            signatureKind: market.signatureKind,
            signatureValue: market.signatureValue,
            latestHour:
                sql<number>`coalesce(max(case when ${market.listingCount} > 0 then ${market.hour} end), max(${market.hour}))`
                    .mapWith(Number)
                    .as("latest_hour"),
            periodSales: sql<number>`sum(${market.likelySales})`.mapWith(Number).as("period_sales"),
            periodRemovals: sql<number>`sum(${market.removedCount})`
                .mapWith(Number)
                .as("period_removals"),
            periodPending: sql<number>`sum(${market.pendingCount})`
                .mapWith(Number)
                .as("period_pending"),
        })
        .from(market)
        .where(
            and(
                scope,
                marketCategoryFilter(filters),
                filters.rarity === "all" ? undefined : eq(market.frameType, rarity[filters.rarity]),
                filters.identification === "all"
                    ? undefined
                    : eq(market.identified, filters.identification === "true"),
                filters.corruption === "all"
                    ? undefined
                    : eq(market.corrupted, filters.corruption === "true"),
                search
                    ? or(
                          like(market.name, search),
                          like(market.itemKey, search),
                          like(market.baseType, search),
                          like(market.signatureValue, search),
                      )
                    : undefined,
            ),
        )
        .groupBy(
            market.itemKey,
            market.identified,
            market.corrupted,
            market.foilVariation,
            market.signatureKind,
            market.signatureValue,
        )
        .orderBy(({ periodSales, latestHour }) => [
            ...(filters.order === "sales"
                ? [desc(periodSales)]
                : filters.order === "newest"
                  ? [desc(latestHour)]
                  : []),
            filters.order === "name-desc" ? desc(market.itemKey) : asc(market.itemKey),
            asc(market.identified),
            asc(market.corrupted),
            asc(market.foilVariation),
            asc(market.signatureKind),
            asc(market.signatureValue),
        ])
        .$dynamic();
    if (!priceOrder) grouped.limit(PAGE_SIZE + 1).offset((filters.page - 1) * PAGE_SIZE);
    const page = grouped.as("page");
    const price = sql`cast(json_unquote(json_extract(${market.prices}, ${`$.${JSON.stringify(filters.currency)}.median`})) as decimal(30, 10))`;
    // Only price ordering needs the latest price rows before pagination.
    const rowsQuery = db
        .select({
            ...getTableColumns(market),
            rank: sql<number>`1`,
            periodSales: page.periodSales,
            periodRemovals: page.periodRemovals,
            periodPending: page.periodPending,
        })
        .from(page)
        .innerJoin(
            market,
            and(
                eq(market.realm, filters.realm),
                eq(market.league, filters.league),
                eq(market.hour, page.latestHour),
                eq(market.itemKey, page.itemKey),
                eq(market.identified, page.identified),
                eq(market.corrupted, page.corrupted),
                eq(market.foilVariation, page.foilVariation),
                eq(market.signatureKind, page.signatureKind),
                eq(market.signatureValue, page.signatureValue),
            ),
        )
        .orderBy(
            ...(priceOrder
                ? [
                      asc(sql`${price} is null`),
                      filters.order === "price-asc" ? asc(price) : desc(price),
                  ]
                : filters.order === "sales"
                  ? [desc(page.periodSales)]
                  : filters.order === "newest"
                    ? [desc(page.latestHour)]
                    : []),
            filters.order === "name-desc" ? desc(page.itemKey) : asc(page.itemKey),
            asc(page.identified),
            asc(page.corrupted),
            asc(page.foilVariation),
            asc(page.signatureKind),
            asc(page.signatureValue),
        )
        .$dynamic();
    if (priceOrder) rowsQuery.limit(PAGE_SIZE + 1).offset((filters.page - 1) * PAGE_SIZE);
    const rowsPromise = view === "history" ? Promise.resolve([]) : rowsQuery;
    const historyPromise =
        filters.item && view !== "list"
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
        rows: rows
            .slice(0, PAGE_SIZE)
            .map((row) => ({ ...row, category: marketCategory(filters.realm, row.baseType) })),
        hasMore: rows.length > PAGE_SIZE,
        history,
    };
}
