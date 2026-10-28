import { marketNumber } from "~/lib/market-number";

/** The currencies each game's item prices are shown in; the first is the unit history is priced in. */
export const MARKET_PRICE_CURRENCIES = {
    poe1: ["chaos", "divine"],
    poe2: ["exalted", "chaos", "annul", "divine"],
} as const satisfies Record<"poe1" | "poe2", readonly string[]>;

const SUFFIXES: Record<string, string> = {
    chaos: "c",
    divine: "d",
    exalted: "ex",
    annul: " annul",
};

/** Amounts under one read as `1/N` when that is within 10% of the amount, e.g. 0.05 as `1/20`. */
function amount(value: number) {
    if (value <= 0 || value >= 1) return marketNumber(value);
    const denominator = Math.round(1 / value);
    return denominator >= 2 && Math.abs(1 / denominator - value) <= value * 0.1
        ? `1/${denominator}`
        : marketNumber(value);
}

/**
 * An amount of the game's first price currency in each of its price currencies, e.g. `5c, 1/20d`
 * when 1 divine is 100 chaos. `rates` holds each currency per unit of the first; currencies
 * without a rate are left out.
 */
export function marketPriceText(
    value: number,
    rates: Record<string, number>,
    game: "poe1" | "poe2",
) {
    return MARKET_PRICE_CURRENCIES[game]
        .flatMap((currency) => {
            const rate = rates[currency];
            return rate ? `${amount(value * rate)}${SUFFIXES[currency]}` : [];
        })
        .join(", ");
}
