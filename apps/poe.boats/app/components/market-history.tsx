import type { ComponentProps, ReactNode } from "react";
import { ExchangeDisplayPicker, ExchangePrice } from "~/components/market-exchange";
import { MarketPriceChart } from "~/components/market-price-chart";
import type { MarketPriceRates } from "~/lib/market-price-currencies";

type Game = "poe1" | "poe2";

/** An hourly table's price in the exchange unit, shown in the shared value display. */
export function MarketHistoryPrice({
    value,
    rates,
    game,
}: {
    value: number | undefined;
    rates: MarketPriceRates;
    game: Game;
}) {
    return value === undefined ? "—" : <ExchangePrice price={value} rates={rates} game={game} />;
}

/**
 * A stash market's price history: the value display, the hourly chart of merged prices, and its
 * hourly table (`children`) under `summary`.
 */
export function MarketHistory({
    points,
    game,
    summary,
    children,
}: {
    points: ComponentProps<typeof MarketPriceChart>["points"];
    game: Game;
    summary: string;
    children: ReactNode;
}) {
    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    Prices from every listing currency, each converted at its hour's currency
                    exchange rate.
                </p>
                <ExchangeDisplayPicker game={game} />
            </div>
            <MarketPriceChart points={points} game={game} />
            <details>
                <summary className="cursor-pointer text-sm">{summary}</summary>
                {children}
            </details>
        </>
    );
}
