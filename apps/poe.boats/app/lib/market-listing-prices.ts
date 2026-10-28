import type { MarketPriceSummary } from "~/db/schema/stash.unique-hourly";

export type MarketListingPrice = {
    currency: string;
    median: number;
    count: number;
    /** The median in chaos; undefined when the currency has no exchange rate. */
    chaos?: number;
    /** The median restated in chaos or divine so currencies can be compared. */
    equivalent?: { amount: number; currency: "chaos" | "divine" };
    /** Costs more than MARKET_OUTLIER_FACTOR times the most listed currency, in chaos. */
    outlier: boolean;
};

export const MARKET_OUTLIER_FACTOR = 3;

/** A chaos value in divine once it is worth at least one divine, otherwise in chaos, with the other as its equivalent. */
export function marketChaosPrice(chaos: number, divine: number | undefined) {
    if (divine && chaos >= divine)
        return {
            amount: chaos / divine,
            currency: "divine" as const,
            equivalent: { amount: chaos, currency: "chaos" as const },
        };
    return {
        amount: chaos,
        currency: "chaos" as const,
        equivalent: divine ? { amount: chaos / divine, currency: "divine" as const } : undefined,
    };
}

function equivalent(
    currency: string,
    chaos: number | undefined,
    divine: number | undefined,
): MarketListingPrice["equivalent"] {
    if (chaos === undefined) return undefined;
    if (currency === "divine") return { amount: chaos, currency: "chaos" };
    if (divine && (currency === "chaos" || chaos >= divine))
        return { amount: chaos / divine, currency: "divine" };
    if (currency === "chaos") return undefined;
    return { amount: chaos, currency: "chaos" };
}

/** The currency with the most listings; on a count tie the dearest, so no tied currency is hidden. */
export function marketMostListedPrice<Price extends { count: number; chaos?: number }>(
    prices: Price[],
) {
    return prices.reduce<Price | undefined>(
        (best, entry) =>
            !best ||
            entry.count > best.count ||
            (entry.count === best.count &&
                (entry.chaos ?? Number.NEGATIVE_INFINITY) >
                    (best.chaos ?? Number.NEGATIVE_INFINITY))
                ? entry
                : best,
        undefined,
    );
}

/**
 * A row's listing currencies, cheapest first by chaos value and then most listed. Chaos is
 * restated in divine, divine in chaos, and other currencies in divine once they are worth at
 * least one divine, otherwise in chaos. Currencies costing more than MARKET_OUTLIER_FACTOR
 * times the most listed currency are flagged as outliers.
 */
export function marketListingPrices(
    prices: Record<string, MarketPriceSummary> | null,
    chaosRates: Record<string, number>,
): MarketListingPrice[] {
    const divine = chaosRates.divine;
    const entries = Object.entries(prices ?? {}).map(([currency, { median, count }]) => {
        const rate = currency === "chaos" ? 1 : chaosRates[currency];
        return { currency, median, count, chaos: rate === undefined ? undefined : median * rate };
    });
    const common = marketMostListedPrice(entries)?.chaos;
    return entries
        .map((entry) => ({
            ...entry,
            equivalent: equivalent(entry.currency, entry.chaos, divine),
            outlier:
                common !== undefined &&
                entry.chaos !== undefined &&
                entry.chaos > common * MARKET_OUTLIER_FACTOR,
        }))
        .sort(
            (a, b) =>
                (a.chaos ?? Number.POSITIVE_INFINITY) - (b.chaos ?? Number.POSITIVE_INFINITY) ||
                b.count - a.count,
        );
}
