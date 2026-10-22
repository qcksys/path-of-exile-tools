import { exchangeCurrencyId, marketObservationRange } from "@poe-tools/market";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashUniqueHourly as hourly } from "~/db/schema/stash.unique-hourly";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { type CraftingSourceResult, commoditySourceQuoteSchema } from "~/schemas/crafting-sources";
import { findCraftingExchangePrices } from "./crafting-exchange.queries";

export async function findCraftingCommodityPrices(
    db: TDatabase,
    graph: CraftingGraph,
    identities: Array<{ id: string; baseType: string }>,
    at?: number,
    conversion?: "exchange-v1",
): Promise<CraftingSourceResult> {
    const result: CraftingSourceResult = { quotes: {}, missing: {} };
    if (!identities.length) return result;
    const range = marketObservationRange(at);
    const rows = await db
        .select({
            itemKey: hourly.itemKey,
            baseType: hourly.baseType,
            name: hourly.name,
            hour: hourly.hour,
            listingCount: hourly.listingCount,
            uniqueSellers: hourly.uniqueSellers,
            prices: hourly.prices,
        })
        .from(hourly)
        .where(
            and(
                eq(hourly.realm, "pc"),
                eq(hourly.league, graph.league!),
                inArray(
                    hourly.itemKey,
                    identities.map(({ baseType }) => baseType),
                ),
                eq(hourly.frameType, 5),
                eq(hourly.identified, true),
                eq(hourly.corrupted, false),
                eq(hourly.foilVariation, -1),
                eq(hourly.signatureKind, ""),
                eq(hourly.signatureValue, ""),
                gte(hourly.hour, range.earliestHour),
                lte(hourly.hour, range.latestHour),
            ),
        )
        .orderBy(desc(hourly.hour));
    const rates = new Map<number, Awaited<ReturnType<typeof findCraftingExchangePrices>>>();
    for (const { id, baseType } of identities) {
        const row = rows.find((row) => row.itemKey === baseType);
        const price = row?.prices?.[graph.currency];
        const observation = {
            source: "stash-commodity",
            game: graph.game,
            realm: "pc",
            league: graph.league,
            currency: graph.currency,
            id,
            baseType,
            amount: price?.median,
            low: price?.min,
            high: price?.max,
            samples: price?.count,
            hour: row?.hour,
            listingCount: row?.listingCount,
            uniqueSellers: row?.uniqueSellers,
            ...(conversion ? { conversion } : {}),
        };
        let parsed = commoditySourceQuoteSchema.safeParse(observation);
        if (!price && conversion && row?.baseType === baseType && !row.name) {
            let exchange = rates.get(row.hour);
            if (!exchange) {
                exchange = await findCraftingExchangePrices(
                    db,
                    {
                        game: "poe1",
                        realm: "pc",
                        league: graph.league!,
                        currency: graph.currency,
                        itemIds: ["chaos", "divine", "exalted"].map(
                            (currency) => exchangeCurrencyId(currency)!,
                        ),
                        conversion: "reference-currency-v1",
                        at: row.hour,
                    },
                    { exactHour: true },
                );
                rates.set(row.hour, exchange);
            }
            for (const currency of ["chaos", "divine", "exalted"] as const) {
                const original = row.prices?.[currency];
                const quote = exchange.quotes[exchangeCurrencyId(currency)!];
                if (!original || !quote) continue;
                parsed = commoditySourceQuoteSchema.safeParse({
                    ...observation,
                    amount: original.median * quote.amount,
                    low: original.min * quote.amount,
                    high: original.max * quote.amount,
                    samples: original.count,
                    exchange: {
                        currency,
                        amount: original.median,
                        low: original.min,
                        high: original.max,
                        quote,
                    },
                });
                if (parsed.success) break;
            }
        }
        if (parsed.success && row?.baseType === baseType && !row.name)
            result.quotes[id] = parsed.data;
        else
            result.missing[id] = conversion
                ? "No positive asking price or matching-hour exchange conversion for this exact essence in the latest captured bucket within 24 completed hours. Enter a manual price or inspect market history."
                : "No positive asking-price observation for this exact essence in the latest captured bucket within 24 completed hours. Enter a manual price or inspect market history.";
    }
    return result;
}
