import { Link } from "react-router";
import { ItemArt } from "~/components/item-art";
import { MarketFiltersForm, marketUtc } from "~/components/market-filters";
import { MarketPriceChart } from "~/components/market-price-chart";
import { dbContext } from "~/context";
import { getMarketData } from "~/db/queries/market.queries";
import { marketItemArtUrl } from "~/lib/item-presentation";
import { marketNumber as number } from "~/lib/market-number";
import { marketLink, parseMarketFilters } from "~/schemas/market";
import type { Route } from "./+types/item";

export function loader({ request, context, params }: Route.LoaderArgs) {
    return getMarketData(
        context.get(dbContext),
        parseMarketFilters(request, params.item),
        "history",
    );
}

const cellClass = "px-4 py-3 text-left";

export default function MarketItem({ loaderData }: Pick<Route.ComponentProps, "loaderData">) {
    const { filters, seasons, history } = loaderData;
    const selected = history.at(-1);
    const currencies = [
        ...new Set([filters.currency, ...history.flatMap((row) => Object.keys(row.prices ?? {}))]),
    ].sort();
    const periodSales = history.reduce((sum, row) => sum + row.likelySales, 0);
    return (
        <>
            <MarketFiltersForm filters={filters} seasons={seasons} />
            {!selected ? (
                <Link to={marketLink(filters)} className="text-sm text-primary">
                    ← Back to markets
                </Link>
            ) : null}
            {selected ? (
                <section
                    className="space-y-4 rounded-xl border border-border bg-card p-5"
                    aria-label="Item price history"
                >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <Link
                                to={marketLink(filters)}
                                className="text-sm text-muted-foreground underline"
                            >
                                ← Back to markets
                            </Link>
                            <h2 className="mt-2 flex items-center gap-3 text-2xl font-semibold">
                                <ItemArt
                                    src={marketItemArtUrl(
                                        selected.iconAsset,
                                        filters.realm === "poe2" ? "poe2" : "poe1",
                                    )}
                                    name={selected.name || selected.baseType}
                                    className="size-16"
                                    decorative
                                />
                                {selected.name || selected.itemKey}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                {selected.identified ? "Identified" : "Unidentified"}
                                {selected.corrupted ? " · Corrupted" : ""}
                                {selected.foilVariation >= 0
                                    ? ` · Foil ${selected.foilVariation}`
                                    : ""}
                                {selected.signatureKind ? ` · ${selected.signatureValue}` : ""}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-semibold tabular-nums">
                                {number(periodSales)}
                            </p>
                            <p className="text-sm text-muted-foreground">likely sales in period</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                            Show prices from all listing currencies in
                        </span>
                        {currencies.map((currency) => (
                            <Link
                                key={currency}
                                to={marketLink({ ...filters, currency }, selected)}
                                aria-current={currency === filters.currency ? "true" : undefined}
                                className={`rounded-full border px-3 py-1 ${currency === filters.currency ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                            >
                                {currency}
                            </Link>
                        ))}
                    </div>
                    <MarketPriceChart points={history} currency={filters.currency} />
                    <details>
                        <summary className="cursor-pointer text-sm">
                            Hourly observations and inferred sale prices (latest 72 hours with data)
                        </summary>
                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className={cellClass}>Hour (UTC)</th>
                                        <th className={cellClass}>Median ask</th>
                                        <th className={cellClass}>Listings observed</th>
                                        <th className={cellClass}>Likely sales</th>
                                        <th className={cellClass}>
                                            Median last ask of likely sales
                                        </th>
                                        <th className={cellClass}>Pending</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history
                                        .slice(-72)
                                        .reverse()
                                        .map((row) => (
                                            <tr
                                                key={row.hour}
                                                className="border-b border-border/60"
                                            >
                                                <td className={cellClass}>{marketUtc(row.hour)}</td>
                                                <td className={cellClass}>
                                                    {row.merged
                                                        ? `${number(row.merged.median)} ${filters.currency}`
                                                        : "—"}
                                                </td>
                                                <td className={cellClass}>
                                                    {number(row.listingCount)}
                                                </td>
                                                <td className={cellClass}>
                                                    {number(row.likelySales)}
                                                </td>
                                                <td className={cellClass}>
                                                    {row.mergedSales
                                                        ? `${number(row.mergedSales.median)} ${filters.currency}`
                                                        : "—"}
                                                </td>
                                                <td className={cellClass}>
                                                    {number(row.pendingCount)}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </section>
            ) : filters.item ? (
                <p role="status">No observations for this variant in the selected period.</p>
            ) : null}
        </>
    );
}
