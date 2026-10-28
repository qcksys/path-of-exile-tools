import { CurrencyLabel } from "~/components/currency-label";
import { exchangePrice, useMarketDisplay } from "~/components/market-exchange";
import type { MarketPriceSummary } from "~/db/schema/stash.unique-hourly";
import {
    type MarketListingPrice as ListingPrice,
    MARKET_OUTLIER_FACTOR,
    marketListingPrices,
} from "~/lib/market-listing-prices";
import { marketNumber as number } from "~/lib/market-number";
import { MARKET_PRICE_CURRENCIES, type MarketPriceRates } from "~/lib/market-price-currencies";

type Game = "poe1" | "poe2";

/** A listing currency's median in the game's exchange unit, when it has a chaos rate. */
export function marketListingValue(price: ListingPrice, rates: MarketPriceRates, game: Game) {
    const perUnit = rates.chaos ?? (MARKET_PRICE_CURRENCIES[game][0] === "chaos" ? 1 : undefined);
    return price.chaos === undefined || !perUnit ? undefined : price.chaos / perUnit;
}

/**
 * One listing currency's median in the shared value display, noting the listed amount when it
 * is shown in another currency; without an exchange rate, the listed amount alone.
 */
export function MarketListingPrice({
    price,
    rates,
    game,
    selected = true,
    compact = false,
}: {
    price: ListingPrice;
    rates: MarketPriceRates;
    game: Game;
    selected?: boolean;
    /** Leaves out the equivalent, the listed amount and the listing count. */
    compact?: boolean;
}) {
    const [display] = useMarketDisplay();
    const value = marketListingValue(price, rates, game);
    const shown =
        value === undefined
            ? { amount: price.median, currency: price.currency }
            : exchangePrice(value, rates, display, game);
    const amount = (
        <>
            {number(shown.amount)}{" "}
            <CurrencyLabel currency={shown.currency} game={game} iconOnly={compact} />
        </>
    );
    if (compact) return amount;
    return (
        <p className={selected ? "font-semibold" : "text-muted-foreground"}>
            {amount}
            {shown.equivalent ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ≈ {number(shown.equivalent.amount)}{" "}
                    <CurrencyLabel currency={shown.equivalent.currency} game={game} iconOnly />
                </span>
            ) : null}
            {shown.currency === price.currency ? null : (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                    listed as {number(price.median)}{" "}
                    <CurrencyLabel currency={price.currency} game={game} iconOnly />
                </span>
            )}
            <span className="ml-2 text-xs text-muted-foreground">n={price.count}</span>
        </p>
    );
}

/**
 * A market's listing currencies, cheapest first, in the shared value display. Currencies over
 * MARKET_OUTLIER_FACTOR times the most listed fold away; `currency` (the sort currency) is bold.
 */
export function MarketListingPrices({
    prices,
    currency,
    game,
    chaosRates,
    rates,
}: {
    prices: Record<string, MarketPriceSummary> | null;
    currency: string;
    game: Game;
    chaosRates: Record<string, number>;
    rates: MarketPriceRates;
}) {
    const listed = marketListingPrices(prices, chaosRates);
    if (!listed.length) return "Unpriced";
    const line = (price: ListingPrice) => (
        <MarketListingPrice
            key={price.currency}
            price={price}
            rates={rates}
            game={game}
            selected={price.currency === currency}
        />
    );
    const outliers = listed.filter((price) => price.outlier);
    return (
        <>
            {listed.filter((price) => !price.outlier).map(line)}
            {outliers.length ? (
                <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                        {outliers.length} over {MARKET_OUTLIER_FACTOR}× the most listed
                    </summary>
                    {outliers.map(line)}
                </details>
            ) : null}
        </>
    );
}
