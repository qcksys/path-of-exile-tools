import { CurrencyLabel } from "~/components/currency-label";
import { exchangePrice, useMarketDisplay } from "~/components/market-exchange";
import type { MarketPriceSummary } from "~/db/schema/stash.unique-hourly";
import {
    type MarketListingPrice as ListingPrice,
    marketListingPrices,
    marketMostListedPrice,
} from "~/lib/market-listing-prices";
import { marketNumber as number, marketPriceNumber as price } from "~/lib/market-number";
import { MARKET_PRICE_CURRENCIES, type MarketPriceRates } from "~/lib/market-price-currencies";

type Game = "poe1" | "poe2";

/** A listing currency's median in the game's exchange unit, when it has a chaos rate. */
export function marketListingValue(price: ListingPrice, rates: MarketPriceRates, game: Game) {
    const perUnit = rates.chaos ?? (MARKET_PRICE_CURRENCIES[game][0] === "chaos" ? 1 : undefined);
    return price.chaos === undefined || !perUnit ? undefined : price.chaos / perUnit;
}

/**
 * A listing currency's median in the shared value display. Divine equivalents under 0.01 are
 * left out; without an exchange rate, the listed amount alone.
 */
function useShownPrice(listing: ListingPrice, rates: MarketPriceRates, game: Game) {
    const [display] = useMarketDisplay();
    const value = marketListingValue(listing, rates, game);
    if (value === undefined)
        return { amount: listing.median, currency: listing.currency, equivalent: undefined };
    const shown = exchangePrice(value, rates, display, game);
    const equivalent =
        shown.equivalent?.currency === "divine" && shown.equivalent.amount < 0.01
            ? undefined
            : shown.equivalent;
    return { ...shown, equivalent };
}

function Amount({
    amount,
    currency,
    game,
    iconOnly = false,
}: {
    amount: number;
    currency: string;
    game: Game;
    iconOnly?: boolean;
}) {
    return (
        <>
            {price(amount)} <CurrencyLabel currency={currency} game={game} iconOnly={iconOnly} />
        </>
    );
}

/** The listed amount when the display shows another currency, and the listing count. */
function Listed({ listing, shown, game }: { listing: ListingPrice; shown: string; game: Game }) {
    return (
        <>
            {shown === listing.currency ? null : (
                <>
                    as {number(listing.median)}{" "}
                    <CurrencyLabel currency={listing.currency} game={game} iconOnly />
                    {" · "}
                </>
            )}
            {number(listing.count)} listed
        </>
    );
}

/** One listing currency's median in the shared value display, as an icon-only amount. */
export function MarketListingPrice({
    price: listing,
    rates,
    game,
}: {
    price: ListingPrice;
    rates: MarketPriceRates;
    game: Game;
}) {
    const shown = useShownPrice(listing, rates, game);
    return <Amount amount={shown.amount} currency={shown.currency} game={game} iconOnly />;
}

function PrimaryPrice({
    listing,
    rates,
    game,
}: {
    listing: ListingPrice;
    rates: MarketPriceRates;
    game: Game;
}) {
    const shown = useShownPrice(listing, rates, game);
    return (
        <>
            <p className="font-semibold">
                <Amount amount={shown.amount} currency={shown.currency} game={game} />
                {shown.equivalent ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ≈{" "}
                        <Amount
                            amount={shown.equivalent.amount}
                            currency={shown.equivalent.currency}
                            game={game}
                            iconOnly
                        />
                    </span>
                ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
                <Listed listing={listing} shown={shown.currency} game={game} />
            </p>
        </>
    );
}

function OtherPrice({
    listing,
    rates,
    game,
}: {
    listing: ListingPrice;
    rates: MarketPriceRates;
    game: Game;
}) {
    const shown = useShownPrice(listing, rates, game);
    return (
        <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
                <Amount amount={shown.amount} currency={shown.currency} game={game} iconOnly />
            </span>{" "}
            <Listed listing={listing} shown={shown.currency} game={game} />
        </p>
    );
}

/**
 * A market's most listed currency in the shared value display, with every other listing
 * currency, cheapest first, folded behind "+N more".
 */
export function MarketListingPrices({
    prices,
    game,
    chaosRates,
    rates,
}: {
    prices: Record<string, MarketPriceSummary> | null;
    game: Game;
    chaosRates: Record<string, number>;
    rates: MarketPriceRates;
}) {
    const listed = marketListingPrices(prices, chaosRates);
    const primary = marketMostListedPrice(listed);
    if (!primary) return "Unpriced";
    const others = listed.filter((listing) => listing !== primary);
    return (
        <>
            <PrimaryPrice listing={primary} rates={rates} game={game} />
            {others.length ? (
                <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                        +{others.length} more
                    </summary>
                    <div className="mt-1 space-y-0.5">
                        {others.map((listing) => (
                            <OtherPrice
                                key={listing.currency}
                                listing={listing}
                                rates={rates}
                                game={game}
                            />
                        ))}
                    </div>
                </details>
            ) : null}
        </>
    );
}
