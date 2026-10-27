import { exchangeCurrencyId } from "@poe-tools/market";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import {
    EXCHANGE_DISPLAYS,
    type ExchangeDisplay,
    ExchangeItemName,
    ExchangePair,
    ExchangePrice,
    ExchangeTrend,
} from "~/components/market-exchange";
import { MarketExchangeChart } from "~/components/market-exchange-chart";
import { marketUtc } from "~/components/market-filters";
import { RouteError } from "~/components/route-error";
import { Button } from "~/components/ui/button";
import { dbContext } from "~/context";
import { getMarketExchangeItem } from "~/db/queries/market.queries";
import { MARKET_CATEGORIES } from "~/lib/market-categories";
import { MARKET_EXCHANGE_DAYS } from "~/lib/market-exchange";
import { marketCompactNumber as compact, marketNumber as number } from "~/lib/market-number";
import { marketExchangeItemId, marketLink, parseMarketFilters } from "~/schemas/market";
import type { Route } from "./+types/exchange";

export const meta: Route.MetaFunction = ({ loaderData }) => [
    {
        title: `${loaderData?.item ? `${loaderData.item.name} · ` : ""}Season market · POE.BOATS`,
    },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
    const filters = parseMarketFilters(request);
    const data = await getMarketExchangeItem(context.get(dbContext), {
        realm: filters.realm,
        league: filters.league,
        days: filters.days,
        itemId: marketExchangeItemId(params["*"] ?? ""),
    });
    const { item } = data;
    if (!item) throw new Response("Unknown exchange item", { status: 404 });
    return { ...data, item, filters: { ...filters, league: data.league } };
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return <RouteError error={error} />;
}

const CHAOS = exchangeCurrencyId("chaos")!;
const CHAOS_VALUE = "chaos";

export default function MarketExchangeItem({
    loaderData,
}: Pick<Route.ComponentProps, "loaderData">) {
    const { filters, item, divine, history, latestHour } = loaderData;
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
    const [display, setDisplay] = useState<ExchangeDisplay>("adaptive");
    const [series, setSeries] = useState(CHAOS_VALUE);
    const pair = history.pairs.find((entry) => entry.quoteId === series);
    const points = pair
        ? pair.hours.map(({ rate, ...point }) => ({ ...point, value: rate }))
        : history.chaos.map(({ chaos, ...point }) => ({ ...point, value: chaos }));
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
                <Link to={marketLink(filters)} className="text-sm text-muted-foreground underline">
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
                    {MARKET_CATEGORIES[item.category].label} · {filters.league} · Currency exchange
                    · Data through {marketUtc(latestHour)}
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {summary(
                    "Value",
                    item.chaos === null ? (
                        item.hour === null ? (
                            `No trades in ${MARKET_EXCHANGE_DAYS} days`
                        ) : (
                            "No rate"
                        )
                    ) : (
                        <ExchangePrice
                            chaos={item.chaos}
                            divine={divine ?? undefined}
                            display={display}
                            game={game}
                        />
                    ),
                    <>
                        {item.chaos === null
                            ? null
                            : item.current
                              ? "Traded in the latest hour"
                              : `Last traded ${item.hour === null ? "—" : marketUtc(item.hour)}`}
                        {item.via && item.via.itemId !== CHAOS ? ` · via ${item.via.name}` : ""}
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
                            <CurrencyLabel currency="chaos" game={game} iconOnly />
                        </>
                    ),
                    `Chaos value, averaged over ${MARKET_EXCHANGE_DAYS} days`,
                )}
                {summary("Most traded", <ExchangePair row={item} game={game} />)}
            </div>
            <fieldset className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <legend className="sr-only">Value display</legend>
                Show values in
                {(Object.keys(EXCHANGE_DISPLAYS) as ExchangeDisplay[]).map((option) => (
                    <Button
                        key={option}
                        type="button"
                        size="xs"
                        variant={display === option ? "secondary" : "ghost"}
                        aria-pressed={display === option}
                        onClick={() => setDisplay(option)}
                    >
                        {EXCHANGE_DISPLAYS[option]}
                    </Button>
                ))}
            </fieldset>
            <section aria-label="Price history" className="space-y-3">
                <h3 className="text-sm font-semibold">
                    Hourly price history{" "}
                    <span className="font-normal text-muted-foreground">
                        · last {filters.days} days, lowest to highest rate shaded
                    </span>
                </h3>
                <div className="flex flex-wrap gap-2 text-sm">
                    {[
                        { id: CHAOS_VALUE, label: "Chaos value" },
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
                    valueName={pair ? `${pair.name} per unit` : "Chaos per unit"}
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
