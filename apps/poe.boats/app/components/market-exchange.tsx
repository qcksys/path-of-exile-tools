import { createContext, type ReactNode, useContext, useState } from "react";
import { CurrencyLabel } from "~/components/currency-label";
import { ItemArt } from "~/components/item-art";
import { Button } from "~/components/ui/button";
import { useItemPresentations } from "~/hooks/use-item-presentations";
import { findItemPresentation } from "~/lib/item-presentation";
import type { MarketExchangeRow } from "~/lib/market-exchange";
import { marketNumber as number } from "~/lib/market-number";
import { MARKET_PRICE_WINDOWS, type MarketPriceTrend } from "~/lib/market-price-change";
import {
    MARKET_PRICE_CURRENCIES,
    MARKET_PRICE_CURRENCY_NAMES,
    type MarketPriceCurrency,
    type MarketPriceRates,
} from "~/lib/market-price-currencies";
import { cn } from "~/lib/utils";

type Game = "poe1" | "poe2";

export const EXCHANGE_UNIT_NAMES = { chaos: "Chaos Orb", exalted: "Exalted Orb" } as const;

/**
 * Adaptive shows divine once a value is worth at least one divine, otherwise the exchange unit;
 * the others show one of the game's price currencies.
 */
export function exchangeDisplays(game: Game) {
    return {
        adaptive: "Adaptive",
        ...Object.fromEntries(
            MARKET_PRICE_CURRENCIES[game].map((currency) => [
                currency,
                MARKET_PRICE_CURRENCY_NAMES[currency],
            ]),
        ),
    } as Record<ExchangeDisplay, string>;
}
export type ExchangeDisplay = "adaptive" | MarketPriceCurrency;

/** A value in the game's exchange unit, restated in the chosen display currency at `rates`. */
export function exchangePrice(
    price: number,
    rates: MarketPriceRates,
    display: ExchangeDisplay,
    game: Game,
): {
    amount: number;
    currency: string;
    equivalent?: { amount: number; currency: string };
} {
    const [unit] = MARKET_PRICE_CURRENCIES[game];
    if (display !== "adaptive") {
        const rate = rates[display];
        return rate
            ? { amount: price * rate, currency: display }
            : { amount: price, currency: unit };
    }
    const divine = rates.divine;
    if (!divine) return { amount: price, currency: unit };
    if (price * divine >= 1)
        return {
            amount: price * divine,
            currency: "divine",
            equivalent: { amount: price, currency: unit },
        };
    return {
        amount: price,
        currency: unit,
        equivalent: { amount: price * divine, currency: "divine" },
    };
}

/** `exchangePrice` as text, e.g. `1,132.67 divine ≈ 384,214 chaos`, for chart tooltips. */
export function exchangePriceText(
    price: number,
    rates: MarketPriceRates,
    display: ExchangeDisplay,
    game: Game,
) {
    const { amount, currency, equivalent } = exchangePrice(price, rates, display, game);
    return `${number(amount)} ${currency}${equivalent ? ` ≈ ${number(equivalent.amount)} ${equivalent.currency}` : ""}`;
}

const MarketDisplayContext = createContext<
    [ExchangeDisplay, (display: ExchangeDisplay) => void] | null
>(null);

/** Shares one value display across a game's market pages, so it persists between list and detail. */
export function MarketDisplayProvider({ children }: { children: ReactNode }) {
    const state = useState<ExchangeDisplay>("adaptive");
    return <MarketDisplayContext.Provider value={state}>{children}</MarketDisplayContext.Provider>;
}

/** The shared value display, or a local one outside a `MarketDisplayProvider`. */
export function useMarketDisplay() {
    const local = useState<ExchangeDisplay>("adaptive");
    return useContext(MarketDisplayContext) ?? local;
}

/** Buttons choosing how values are shown, in the game's price currencies. */
export function ExchangeDisplayPicker({ game, className }: { game: Game; className?: string }) {
    const [display, onChange] = useMarketDisplay();
    const displays = exchangeDisplays(game);
    return (
        <fieldset
            className={cn(
                "flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
                className,
            )}
        >
            <legend className="sr-only">Value display</legend>
            Show values in
            {(Object.keys(displays) as ExchangeDisplay[]).map((option) => (
                <Button
                    key={option}
                    type="button"
                    size="xs"
                    variant={display === option ? "secondary" : "ghost"}
                    aria-pressed={display === option}
                    onClick={() => onChange(option)}
                >
                    {displays[option]}
                </Button>
            ))}
        </fieldset>
    );
}

/** A value in the game's exchange unit, shown in the shared value display. */
export function ExchangePrice({
    price: value,
    rates,
    game,
    itemsPerCurrency = false,
}: {
    price: number;
    rates: MarketPriceRates;
    game: Game;
    itemsPerCurrency?: boolean;
}) {
    const [display] = useMarketDisplay();
    const price = exchangePrice(value, rates, display, game);
    const formatAmount = (amount: number) =>
        itemsPerCurrency && amount > 0 && amount < 1 ? `${number(1 / amount)} per` : number(amount);
    return (
        <>
            {formatAmount(price.amount)} <CurrencyLabel currency={price.currency} game={game} />
            {price.equivalent ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ≈ {formatAmount(price.equivalent.amount)}{" "}
                    <CurrencyLabel currency={price.equivalent.currency} game={game} iconOnly />
                </span>
            ) : null}
        </>
    );
}

/** An exchange item's art and name, looked up by its item ID. */
export function ExchangeItemName({
    itemId,
    name,
    game,
    iconOnly = false,
    className,
    artClassName,
}: {
    itemId: string;
    name: string;
    game: Game;
    iconOnly?: boolean;
    className?: string;
    artClassName?: string;
}) {
    const art = findItemPresentation(useItemPresentations(game), itemId, name)?.art;
    return (
        <span className={cn("inline-flex items-center gap-2 align-middle", className)}>
            <ItemArt src={art ?? ""} name={name} className={artClassName} decorative />
            <span className={iconOnly ? "sr-only" : undefined}>{name}</span>
        </span>
    );
}

export function exchangeChange(change: number) {
    return `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`;
}

/** Rises in green, falls in red, and a change that rounds to 0% muted. */
function changeTone(change: number) {
    if (Math.round(change * 100) === 0) return "text-muted-foreground";
    return change > 0 ? "text-success" : "text-destructive";
}

/** An exchange row's prices and changes as a price trend. */
export function exchangeTrend(
    row: Pick<MarketExchangeRow, "hourly" | "history" | "change24h" | "change3d" | "change">,
): MarketPriceTrend {
    return {
        hourly: row.hourly,
        daily: row.history,
        change24h: row.change24h,
        change3d: row.change3d,
        change7d: row.change,
    };
}

/** The 24-hour, 3-day and 7-day changes on one line, e.g. `+3% 24h · -1% 3d · +25% 7d`. */
export function MarketPriceChanges({ trend }: { trend: MarketPriceTrend }) {
    if (MARKET_PRICE_WINDOWS.every((window) => trend[window.key] === null)) return null;
    return (
        <p className="text-xs text-muted-foreground">
            {MARKET_PRICE_WINDOWS.map((window, index) => {
                const change = trend[window.key];
                return (
                    <span key={window.key} title={`Change over the last ${window.name}`}>
                        {index ? " · " : null}
                        <span className={change === null ? undefined : changeTone(change)}>
                            {change === null ? "—" : exchangeChange(change)}
                        </span>{" "}
                        {window.label}
                    </span>
                );
            })}
        </p>
    );
}

/** The latest 24 hours', 3 days' and 7 days' prices, each as a sparkline and its change. */
export function MarketPriceTrends({ trend }: { trend: MarketPriceTrend }) {
    return (
        <dl className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-1">
            {MARKET_PRICE_WINDOWS.map((window) => (
                <div key={window.key} className="contents">
                    <dt className="text-xs font-normal text-muted-foreground">
                        <abbr title={`Last ${window.name}`} className="no-underline">
                            {window.label}
                        </abbr>
                    </dt>
                    <dd>
                        <ExchangeTrend history={window.points(trend)} change={trend[window.key]} />
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/** A sparkline of prices and the change across them. */
export function ExchangeTrend({
    history,
    change,
}: {
    history: (number | null)[];
    change: number | null;
}) {
    const points = history.flatMap((value, index) => (value === null ? [] : [{ index, value }]));
    const tone =
        change === null || Math.round(change * 100) === 0
            ? "text-muted-foreground"
            : change > 0
              ? "text-success"
              : "text-destructive";
    if (points.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
    const values = points.map((point) => point.value);
    const low = Math.min(...values);
    const span = Math.max(...values) - low || 1;
    const width = 64;
    const height = 20;
    const path = points
        .map(
            ({ index, value }) =>
                `${((index / (history.length - 1)) * width).toFixed(1)},${(height - 2 - ((value - low) / span) * (height - 4)).toFixed(1)}`,
        )
        .join(" ");
    return (
        <span className={cn("inline-flex items-center gap-2", tone)}>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                width={width}
                height={height}
                aria-hidden="true"
                className="overflow-visible"
            >
                <polyline
                    points={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                />
            </svg>
            <span className="text-xs tabular-nums">
                {change === null ? "—" : exchangeChange(change)}
            </span>
        </span>
    );
}

/** The most traded pair as a trade: the dearer side's amount against one of the cheaper. */
export function ExchangePair({
    row,
    game,
}: {
    row: Pick<MarketExchangeRow, "itemId" | "name" | "pair">;
    game: Game;
}) {
    if (!row.pair) return <span className="text-muted-foreground">—</span>;
    const { quoteId, name, rate } = row.pair;
    const side = (itemId: string, label: string, amount: number) => (
        <span className="inline-flex items-center gap-1">
            {number(amount)}
            <ExchangeItemName
                itemId={itemId}
                name={label}
                game={game}
                iconOnly
                artClassName="size-5 rounded-none border-0 bg-transparent p-0"
            />
        </span>
    );
    return (
        <span
            className="inline-flex items-center gap-1 whitespace-nowrap"
            title={`${number(rate)} ${name} per ${row.name}`}
        >
            {rate >= 1 ? side(quoteId, name, rate) : side(quoteId, name, 1)}
            <span aria-hidden="true" className="text-muted-foreground">
                ⇄
            </span>
            <span className="sr-only">for</span>
            {rate >= 1 ? side(row.itemId, row.name, 1) : side(row.itemId, row.name, 1 / rate)}
        </span>
    );
}
