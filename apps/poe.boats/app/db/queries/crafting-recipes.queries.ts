import { exchangeCurrencyId, marketObservationRange } from "@poe-tools/market";
import { and, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import type { TDatabase } from "~/db/client";
import { tStashPoe1UniqueHourly as hourly } from "~/db/schema/stash.unique-hourly";
import { findCraftingExchangePrices } from "./crafting-exchange.queries";

type Currency = "chaos" | "divine" | "exalted";
const CURRENCIES: Currency[] = ["chaos", "divine", "exalted"];

/** A captured beast species, or a Chronicle of Atzoatl market by its open tier 3 rooms. */
export type RecipeMarket = { itemKey: string; rooms?: string };

export type RecipeListing = {
    unitPrice: number;
    listingCount: number;
    hour: number;
    exchange?: { currency: Currency; unitPrice: number; rate: number };
};

export function recipeMarketKey({ itemKey, rooms }: RecipeMarket) {
    return rooms === undefined ? itemKey : `${itemKey}|${rooms}`;
}

/**
 * Each market's asking price in `currency` from its latest priced merchant-tab hour within 24
 * completed hours of `at`: the median ask in `currency`, or else the median ask in chaos, divine
 * or exalted converted at that hour's exchange rate. Markets without one are left out.
 */
export async function findCraftingRecipeListings(
    db: TDatabase,
    league: string,
    currency: Currency,
    markets: RecipeMarket[],
    at?: number,
) {
    const result = new Map<string, RecipeListing>();
    const beasts = markets.filter((market) => market.rooms === undefined);
    const temples = markets.filter((market) => market.rooms !== undefined);
    if (!markets.length) return result;
    const range = marketObservationRange(at);
    const rows = await db
        .select({
            itemKey: hourly.itemKey,
            signatureKind: hourly.signatureKind,
            signatureValue: hourly.signatureValue,
            hour: hourly.hour,
            listingCount: hourly.listingCount,
            prices: hourly.prices,
        })
        .from(hourly)
        .where(
            and(
                eq(hourly.realm, "pc"),
                eq(hourly.league, league),
                // Like the market's default and commodity prices, asks come from merchant tabs.
                eq(hourly.tab, "merchant"),
                or(
                    beasts.length
                        ? and(
                              inArray(
                                  hourly.itemKey,
                                  beasts.map((market) => market.itemKey),
                              ),
                              // Rare beasts carry a `beast` signature; spirit beasts are uniques.
                              inArray(hourly.signatureKind, ["beast", ""]),
                          )
                        : undefined,
                    ...temples.map((market) =>
                        and(
                            eq(hourly.itemKey, market.itemKey),
                            eq(hourly.signatureKind, "temple"),
                            eq(hourly.signatureValue, market.rooms!),
                        ),
                    ),
                ),
                eq(hourly.identified, true),
                eq(hourly.corrupted, false),
                gte(hourly.hour, range.earliestHour),
                lte(hourly.hour, range.latestHour),
            ),
        )
        .orderBy(desc(hourly.hour));
    const rates = new Map<number, Awaited<ReturnType<typeof findCraftingExchangePrices>>>();
    async function rate(from: Currency, hour: number) {
        let exchange = rates.get(hour);
        if (!exchange) {
            exchange = await findCraftingExchangePrices(
                db,
                {
                    game: "poe1",
                    realm: "pc",
                    league,
                    currency,
                    itemIds: CURRENCIES.map((entry) => exchangeCurrencyId(entry)!),
                    conversion: "reference-currency-v1",
                    at: hour,
                },
                { exactHour: true },
            );
            rates.set(hour, exchange);
        }
        return exchange.quotes[exchangeCurrencyId(from)!]?.amount;
    }
    for (const row of rows) {
        const key = recipeMarketKey({
            itemKey: row.itemKey,
            rooms: row.signatureKind === "temple" ? row.signatureValue : undefined,
        });
        if (result.has(key) || !(row.listingCount > 0)) continue;
        const direct = row.prices?.[currency]?.median;
        if (direct && direct > 0) {
            result.set(key, { unitPrice: direct, listingCount: row.listingCount, hour: row.hour });
            continue;
        }
        for (const from of CURRENCIES) {
            const original = row.prices?.[from]?.median;
            if (from === currency || !original || original <= 0) continue;
            const amount = await rate(from, row.hour);
            if (!amount) continue;
            result.set(key, {
                unitPrice: original * amount,
                listingCount: row.listingCount,
                hour: row.hour,
                exchange: { currency: from, unitPrice: original, rate: amount },
            });
            break;
        }
    }
    return result;
}
