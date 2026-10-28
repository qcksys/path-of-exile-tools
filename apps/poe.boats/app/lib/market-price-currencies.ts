/** The currencies each game's prices are shown in; the first is its exchange unit. */
export const MARKET_PRICE_CURRENCIES = {
    poe1: ["chaos", "divine"],
    poe2: ["exalted", "chaos", "annul", "divine"],
} as const satisfies Record<"poe1" | "poe2", readonly string[]>;

export type MarketPriceCurrency =
    (typeof MARKET_PRICE_CURRENCIES)[keyof typeof MARKET_PRICE_CURRENCIES][number];

export const MARKET_PRICE_CURRENCY_NAMES: Record<MarketPriceCurrency, string> = {
    chaos: "Chaos Orb",
    divine: "Divine Orb",
    exalted: "Exalted Orb",
    annul: "Orb of Annulment",
};

/** Units of each price currency per unit of the game's exchange unit; currencies without a rate are absent. */
export type MarketPriceRates = Record<string, number>;
