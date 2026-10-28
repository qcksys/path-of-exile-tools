import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import {
    EXCHANGE_UNIT_NAMES,
    type ExchangeDisplay,
    ExchangeDisplayPicker,
    ExchangeItemName,
    ExchangePair,
    ExchangePrice,
    ExchangeTrend,
} from "~/components/market-exchange";
import { MarketExchangeChart } from "~/components/market-exchange-chart";
import { marketUtc } from "~/components/market-filters";
import { Button } from "~/components/ui/button";
import type { getMarketExchangeItem } from "~/db/queries/market.queries";
import {
    MARKET_EXCHANGE_DAYS,
    type MarketExchangeRow,
    marketExchangeUnitId,
} from "~/lib/market-exchange";
import { marketCompactNumber as compact, marketNumber as number } from "~/lib/market-number";

type ExchangeItemData = Awaited<ReturnType<typeof getMarketExchangeItem>>;

const PRICE_SERIES = "price";

/** An exchange item's summary, hourly price chart and pairs, in either game's exchange unit. */
export function MarketExchangeItem({
    data: { item, divine, history, latestHour, unit },
    league,
    days,
    game,
    categoryLabel,
    backTo,
}: {
    data: ExchangeItemData & { item: MarketExchangeRow };
    league: string;
    days: string;
    game: "poe1" | "poe2";
    categoryLabel: string;
    backTo: string;
}) {
    const [display, setDisplay] = useState<ExchangeDisplay>("adaptive");
    const [series, setSeries] = useState(PRICE_SERIES);
    const unitName = EXCHANGE_UNIT_NAMES[unit].replace(/ Orb$/, "");
    const pair = history.pairs.find((entry) => entry.quoteId === series);
    const points = pair
        ? pair.hours.map(({ rate, ...point }) => ({ ...point, value: rate }))
        : history.prices.map(({ price, ...point }) => ({ ...point, value: price }));
    const summary = (label: string, value: ReactNode, detail?: ReactNode) => (
        <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
            {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
        </div>
    );
    return (
        <section
            aria-label="Exchange item"
            className="space-y-5 rounded-xl border border-border bg-card p-5"
        >
            <div>
                <Link to={backTo} className="text-sm text-muted-foreground underline">
                    ← Back to markets
                </Link>
                <h2 className="mt-2 text-2xl font-semibold">
                    <ExchangeItemName
                        itemId={item.itemId}
                        name={item.name}
                        game={game}
                        className="gap-3"
                        artClassName="size-16"
                    />
                </h2>
                <p className="text-sm text-muted-foreground">
                    {categoryLabel} · {league} · Currency exchange · Data through{" "}
                    {marketUtc(latestHour)}
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {summary(
                    "Value",
                    item.price === null ? (
                        item.hour === null ? (
                            `No trades in ${MARKET_EXCHANGE_DAYS} days`
                        ) : (
                            "No rate"
                        )
                    ) : (
                        <ExchangePrice
                            price={item.price}
                            divine={divine ?? undefined}
                            display={display}
                            unit={unit}
                            game={game}
                        />
                    ),
                    <>
                        {item.price === null
                            ? null
                            : item.current
                              ? "Traded in the latest hour"
                              : `Last traded ${item.hour === null ? "—" : marketUtc(item.hour)}`}
                        {item.via && item.via.itemId !== marketExchangeUnitId(unit)
                            ? ` · via ${item.via.name}`
                            : ""}
                    </>,
                )}
                {summary(
                    `Last ${MARKET_EXCHANGE_DAYS} days`,
                    <ExchangeTrend history={item.history} change={item.change} />,
                )}
                {summary(
                    "Volume / hour",
                    item.volume === null ? (
                        "—"
                    ) : (
                        <>
                            {compact(item.volume)}{" "}
                            <CurrencyLabel currency={unit} game={game} iconOnly />
                        </>
                    ),
                    `${unitName} value, averaged over ${MARKET_EXCHANGE_DAYS} days`,
                )}
                {summary("Most traded", <ExchangePair row={item} game={game} />)}
            </div>
            <ExchangeDisplayPicker unit={unit} display={display} onChange={setDisplay} />
            <section aria-label="Price history" className="space-y-3">
                <h3 className="text-sm font-semibold">
                    Hourly price history{" "}
                    <span className="font-normal text-muted-foreground">
                        · last {days} days, lowest to highest rate shaded
                    </span>
                </h3>
                <div className="flex flex-wrap gap-2 text-sm">
                    {[
                        { id: PRICE_SERIES, label: `${unitName} value` },
                        ...history.pairs.map((entry) => ({
                            id: entry.quoteId,
                            label: `${entry.name} per ${item.name}`,
                        })),
                    ].map((option) => (
                        <Button
                            key={option.id}
                            type="button"
                            size="sm"
                            variant={series === option.id ? "secondary" : "outline"}
                            aria-pressed={series === option.id}
                            onClick={() => setSeries(option.id)}
                            className="rounded-full"
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
                <MarketExchangeChart
                    points={points}
                    valueName={pair ? `${pair.name} per unit` : `${unitName} per unit`}
                    unitsName="Units traded"
                />
            </section>
            {history.pairs.length ? (
                <section aria-label="Exchange pairs" className="space-y-2">
                    <h3 className="text-sm font-semibold">Pairs</h3>
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs text-muted-foreground">
                            <tr>
                                <th className="py-2 font-medium">Traded against</th>
                                <th className="py-2 font-medium">Newest hourly rate</th>
                                <th className="py-2 text-right font-medium">Units traded</th>
                                <th className="py-2 text-right font-medium">Last traded</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.pairs.map((entry) => {
                                const newest = entry.hours.at(-1)!;
                                return (
                                    <tr key={entry.quoteId} className="border-t border-border">
                                        <td className="py-2">
                                            <ExchangeItemName
                                                itemId={entry.quoteId}
                                                name={entry.name}
                                                game={game}
                                                artClassName="size-6 rounded-none bg-transparent p-0"
                                            />
                                        </td>
                                        <td className="py-2 tabular-nums">
                                            <ExchangePair
                                                row={{
                                                    itemId: item.itemId,
                                                    name: item.name,
                                                    pair: {
                                                        quoteId: entry.quoteId,
                                                        name: entry.name,
                                                        rate: newest.rate,
                                                    },
                                                }}
                                                game={game}
                                            />
                                        </td>
                                        <td className="py-2 text-right tabular-nums">
                                            {number(
                                                entry.hours.reduce(
                                                    (sum, point) => sum + point.units,
                                                    0,
                                                ),
                                            )}
                                        </td>
                                        <td className="py-2 text-right text-xs whitespace-nowrap text-muted-foreground">
                                            {marketUtc(newest.hour)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>
            ) : null}
        </section>
    );
}
