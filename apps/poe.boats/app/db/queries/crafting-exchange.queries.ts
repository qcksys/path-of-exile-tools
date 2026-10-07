import {
    exchangeCurrencyId,
    exchangeSnapshotSchema,
    exchangeUnitQuote,
    quoteExchangeSnapshot,
    quoteExchangeWindow,
} from "@poe-tools/market";
import { and, desc, eq, gte, inArray, lt, lte, max, sql } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashCurrencyHourly as hourly } from "~/db/schema/stash.currency-hourly";
import type {
    CraftingExchangeHistoryInput,
    CraftingExchangeInput,
    CraftingExchangeResult,
} from "~/schemas/crafting-exchange";

const columns = {
    realm: hourly.realm,
    league: hourly.league,
    marketId: hourly.marketId,
    hour: hourly.hour,
    volumeTraded: hourly.volumeTraded,
    lowestRatio: hourly.lowestRatio,
    highestRatio: hourly.highestRatio,
};
function pairIds(item: string, quote: string) {
    return [`${item}|${quote}`, `${quote}|${item}`];
}
export async function findCraftingExchangePrices(
    db: TDatabase,
    input: CraftingExchangeInput,
): Promise<CraftingExchangeResult> {
    const result: CraftingExchangeResult = { quotes: {}, missing: {} };
    const quoteId = exchangeCurrencyId(input.currency);
    const ids = [...new Set(input.itemIds)];
    const pairs: string[] = [];
    for (const itemId of ids) {
        if (!quoteId)
            result.missing[itemId] =
                "Choose chaos, divine, exalted, or a canonical accounting-currency ID.";
        else if (!itemId.startsWith("Metadata/Items/"))
            result.missing[itemId] =
                "This service or input has no exchange item ID; enter a manual price.";
        else if (itemId === quoteId)
            result.quotes[itemId] = exchangeUnitQuote({
                realm: input.realm,
                league: input.league,
                itemId,
                quoteId,
                window: input.window,
            });
        else {
            pairs.push(...pairIds(itemId, quoteId));
            result.missing[itemId] =
                "No positive traded volume is available for this direct currency pair.";
        }
    }
    if (!pairs.length || !quoteId) return result;
    const scope = and(
        eq(hourly.realm, input.realm),
        eq(hourly.league, input.league),
        inArray(hourly.marketId, pairs),
        lte(hourly.hour, input.at ?? Math.floor(Date.now() / 1000)),
    );
    const latest = db
        .select({ marketId: hourly.marketId, hour: max(hourly.hour).as("latest_hour") })
        .from(hourly)
        .where(scope)
        .groupBy(hourly.marketId)
        .as("latest");
    const rows = await db
        .select(columns)
        .from(hourly)
        .innerJoin(
            latest,
            and(
                eq(hourly.marketId, latest.marketId),
                input.window === "adaptive-v1"
                    ? gte(hourly.hour, sql`${latest.hour} - ${23 * 3600}`)
                    : eq(hourly.hour, latest.hour),
            ),
        )
        .where(scope)
        .orderBy(desc(hourly.hour));
    if (input.window === "adaptive-v1") {
        const snapshots = rows.map((row) => exchangeSnapshotSchema.parse(row));
        for (const itemId of ids) {
            if (result.quotes[itemId]) continue;
            const quote = quoteExchangeWindow(
                snapshots,
                {
                    realm: input.realm,
                    league: input.league,
                    itemId,
                    quoteId,
                    window: input.window,
                },
                input.at ?? Math.floor(Date.now() / 1000),
            );
            if (quote) {
                result.quotes[itemId] = quote;
                delete result.missing[itemId];
            }
        }
        return result;
    }
    const seen = new Set<string>();
    for (const row of rows) {
        const snapshot = exchangeSnapshotSchema.parse(row);
        const itemId = snapshot.marketId.split("|").find((id) => id !== quoteId);
        if (!itemId || !ids.includes(itemId) || seen.has(itemId)) continue;
        seen.add(itemId);
        const quote = quoteExchangeSnapshot(snapshot, itemId, quoteId);
        if (quote) {
            result.quotes[itemId] = quote;
            delete result.missing[itemId];
        }
    }
    return result;
}
export async function craftingExchangeHistory(db: TDatabase, input: CraftingExchangeHistoryInput) {
    const rows = await db
        .select(columns)
        .from(hourly)
        .where(
            and(
                eq(hourly.realm, input.realm),
                eq(hourly.league, input.league),
                inArray(hourly.marketId, pairIds(input.itemId, input.quoteId)),
                input.before === undefined ? undefined : lt(hourly.hour, input.before),
            ),
        )
        .orderBy(desc(hourly.hour))
        .limit(input.limit + 1);
    const history = rows.slice(0, input.limit).map((row) => exchangeSnapshotSchema.parse(row));
    return { history, nextBefore: rows.length > input.limit ? history.at(-1)!.hour : null };
}
