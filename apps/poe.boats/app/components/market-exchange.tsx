import { CurrencyLabel } from "~/components/currency-label";
import { ItemArt } from "~/components/item-art";
import { useItemPresentations } from "~/hooks/use-item-presentations";
import { findItemPresentation } from "~/lib/item-presentation";
import type { MarketExchangeRow } from "~/lib/market-exchange";
import { marketChaosPrice } from "~/lib/market-listing-prices";
import { marketNumber as number } from "~/lib/market-number";
import { cn } from "~/lib/utils";

type Game = "poe1" | "poe2";

/** Adaptive shows divine once an item is worth at least one divine, otherwise chaos. */
export const EXCHANGE_DISPLAYS = { adaptive: "Adaptive", chaos: "Chaos Orb", divine: "Divine Orb" };
export type ExchangeDisplay = keyof typeof EXCHANGE_DISPLAYS;

export function exchangePrice(chaos: number, divine: number | undefined, display: ExchangeDisplay) {
    if (display === "chaos" || !divine) return { amount: chaos, currency: "chaos" as const };
    if (display === "divine") return { amount: chaos / divine, currency: "divine" as const };
    return marketChaosPrice(chaos, divine);
}

export function ExchangePrice({
    chaos,
    divine,
    display,
    game,
}: {
    chaos: number;
    divine: number | undefined;
    display: ExchangeDisplay;
    game: Game;
}) {
    const price = exchangePrice(chaos, divine, display);
    return (
        <>
            {number(price.amount)} <CurrencyLabel currency={price.currency} game={game} />
            {"equivalent" in price && price.equivalent ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ≈ {number(price.equivalent.amount)}{" "}
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

/** A 7-day sparkline of daily chaos prices and the change across it. */
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
                artClassName="size-5 rounded-none bg-transparent p-0"
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
