import {
    exchangeCurrencyId,
    exchangeSnapshotSchema,
    exchangeUnitQuote,
    marketObservationRange,
    quoteExchangeConversion,
    quoteExchangeWindow,
} from "@poe-tools/market";
import { and, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
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
    options?: { exactHour: true },
    onQuery?: (rowCount: number) => void,
): Promise<CraftingExchangeResult> {
    const range = marketObservationRange(input.at);
    if (options?.exactHour) range.earliestHour = range.latestHour;
    const result = await findDirectExchangePrices(db, input, range, onQuery);
    if (!input.conversion || !exchangeCurrencyId(input.currency)) return result;
    for (const currency of ["chaos", "divine", "exalted"]) {
        const bridge = exchangeCurrencyId(currency)!;
        if (bridge === exchangeCurrencyId(input.currency)) continue;
        const itemIds = Object.keys(result.missing).filter(
            (id) => id.startsWith("Metadata/Items/") && id !== bridge,
        );
        if (!itemIds.length) continue;
        const quoteId = exchangeCurrencyId(input.currency)!;
        const snapshots = await findExchangeSnapshots(
            db,
            input,
            [...itemIds.flatMap((id) => pairIds(id, bridge)), ...pairIds(bridge, quoteId)],
            range,
            onQuery,
        );
        for (const id of itemIds) {
            const quote = quoteExchangeConversion(
                snapshots,
                {
                    realm: input.realm,
                    league: input.league,
                    itemId: id,
                    quoteId,
                    window: input.window,
                },
                bridge,
                range.latestHour,
            );
            if (quote) {
                result.quotes[id] = quote;
                delete result.missing[id];
            }
        }
    }
    for (const quote of Object.values(result.quotes)) quote.conversion = input.conversion;
    for (const id of Object.keys(result.missing))
        if (id.startsWith("Metadata/Items/"))
            result.missing[id] =
                "No positive direct pair or matching-hour conversion through chaos, divine or exalted is available in the latest 24 completed hours at this cutoff.";
    return result;
}
async function findDirectExchangePrices(
    db: TDatabase,
    input: CraftingExchangeInput,
    range: ReturnType<typeof marketObservationRange>,
    onQuery?: (rowCount: number) => void,
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
                "No captured exchange observation is available in the latest 24 completed hours at this cutoff.";
        }
    }
    if (!pairs.length || !quoteId) return result;
    const snapshots = await findExchangeSnapshots(db, input, pairs, range, onQuery);
    for (const itemId of ids) {
        if (result.quotes[itemId] || !itemId.startsWith("Metadata/Items/")) continue;
        const quote = quoteExchangeWindow(
            snapshots,
            { realm: input.realm, league: input.league, itemId, quoteId, window: input.window },
            range.latestHour,
        );
        if (quote) {
            result.quotes[itemId] = quote;
            delete result.missing[itemId];
        } else if (snapshots.some((row) => pairIds(itemId, quoteId).includes(row.marketId)))
            result.missing[itemId] =
                "No positive traded volume is available in the latest captured exchange hour, or its observations conflict for this pair.";
    }
    return result;
}

async function findExchangeSnapshots(
    db: TDatabase,
    input: CraftingExchangeInput,
    pairs: string[],
    range: ReturnType<typeof marketObservationRange>,
    onQuery?: (rowCount: number) => void,
) {
    const query = db
        .select(columns)
        .from(hourly)
        .where(
            and(
                eq(hourly.realm, input.realm),
                eq(hourly.league, input.league),
                inArray(hourly.marketId, pairs),
                gte(hourly.hour, range.earliestHour),
                lte(hourly.hour, range.latestHour),
            ),
        )
        .orderBy(desc(hourly.hour));
    let rowCount = 0;
    try {
        const rows = await query;
        rowCount = rows.length;
        return rows.map((row) => exchangeSnapshotSchema.parse(row));
    } finally {
        onQuery?.(rowCount);
    }
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
