import { useMemo } from "react";
import { Link } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { DataTable, dataTableColumns } from "~/components/data-table";
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

type HistoryRow = Awaited<ReturnType<typeof getMarketData>>["history"][number];

const column = dataTableColumns<HistoryRow>();

function HourlyTable({
    rows,
    currency,
    game,
}: {
    rows: HistoryRow[];
    currency: string;
    game: "poe1" | "poe2";
}) {
    const columns = useMemo(() => {
        const price = (value: number | undefined) =>
            value === undefined ? (
                "—"
            ) : (
                <>
                    {number(value)} <CurrencyLabel currency={currency} game={game} />
                </>
            );
        const count = { sortDescFirst: true, meta: { filter: "range" } } as const;
        return column.columns([
            column.accessor((row) => marketUtc(row.hour), {
                id: "hour",
                header: "Hour (UTC)",
                sortDescFirst: true,
                meta: { filter: "text", className: "whitespace-nowrap" },
            }),
            column.accessor((row) => row.merged?.median, {
                id: "ask",
                header: "Median ask",
                ...count,
                sortUndefined: "last",
                cell: ({ getValue }) => price(getValue()),
            }),
            column.accessor("listingCount", {
                header: "Listings observed",
                ...count,
                cell: ({ getValue }) => number(getValue()),
            }),
            column.accessor("likelySales", {
                header: "Likely sales",
                ...count,
                cell: ({ getValue }) => number(getValue()),
            }),
            column.accessor((row) => row.mergedSales?.median, {
                id: "salesAsk",
                header: "Median last ask of likely sales",
                ...count,
                sortUndefined: "last",
                cell: ({ getValue }) => price(getValue()),
            }),
            column.accessor("pendingCount", {
                header: "Pending",
                ...count,
                cell: ({ getValue }) => number(getValue()),
            }),
        ]);
    }, [currency, game]);
    return (
        <DataTable
            label="Hourly observations"
            data={rows}
            columns={columns}
            getRowId={(row) => String(row.hour)}
            search
            className="mt-3"
        />
    );
}

export default function MarketItem({ loaderData }: Pick<Route.ComponentProps, "loaderData">) {
    const { filters, seasons, history } = loaderData;
    const selected = history.at(-1);
    const currencies = [
        ...new Set([filters.currency, ...history.flatMap((row) => Object.keys(row.prices ?? {}))]),
    ].sort();
    const periodSales = history.reduce((sum, row) => sum + row.likelySales, 0);
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
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
                                    src={marketItemArtUrl(selected.iconAsset, game)}
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
                                <CurrencyLabel currency={currency} game={game} />
                            </Link>
                        ))}
                    </div>
                    <MarketPriceChart points={history} currency={filters.currency} game={game} />
                    <details>
                        <summary className="cursor-pointer text-sm">
                            Hourly observations and inferred sale prices (latest 72 hours with data)
                        </summary>
                        <HourlyTable
                            rows={history.slice(-72).reverse()}
                            currency={filters.currency}
                            game={game}
                        />
                    </details>
                </section>
            ) : filters.item ? (
                <p role="status">No observations for this variant in the selected period.</p>
            ) : null}
        </>
    );
}
