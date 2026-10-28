import { useMemo } from "react";
import { Link } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { DataTable, dataTableColumns } from "~/components/data-table";
import { CatalogItemArt } from "~/components/item-art";
import { marketUtc } from "~/components/market-filters";
import { MarketPriceChart } from "~/components/market-price-chart";
import { RouteError } from "~/components/route-error";
import { dbContext } from "~/context";
import { getMarketBase } from "~/db/queries/market.queries";
import { marketBaseDetails, marketBaseVariant } from "~/lib/market-bases";
import { marketListingPrices } from "~/lib/market-listing-prices";
import { marketNumber as number } from "~/lib/market-number";
import { marketBaseLink, marketLink, parseMarketFilters } from "~/schemas/market";
import type { Route } from "./+types/base";

export const meta: Route.MetaFunction = ({ loaderData }) => [
    {
        title: `${loaderData?.base ? `${loaderData.base.baseType} · ` : ""}Season market · POE.BOATS`,
    },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
    const filters = parseMarketFilters(request);
    const data = await getMarketBase(context.get(dbContext), {
        realm: filters.realm,
        league: filters.league,
        days: filters.days,
        currency: filters.currency,
        baseId: params.base,
    });
    const { base } = data;
    if (!base) throw new Response("Unknown crafting base", { status: 404 });
    return { ...data, base, filters: { ...filters, league: data.league } };
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return <RouteError error={error} />;
}

type HistoryRow = Route.ComponentProps["loaderData"]["history"][number];

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
                cell: ({ getValue }) => {
                    const value = getValue();
                    return value === undefined ? (
                        "—"
                    ) : (
                        <>
                            {number(value)} <CurrencyLabel currency={currency} game={game} />
                        </>
                    );
                },
            }),
            column.accessor("listingCount", {
                header: "Listings observed",
                ...count,
                cell: ({ getValue }) => number(getValue()),
            }),
            column.accessor("uniqueSellers", {
                header: "Sellers",
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

export default function MarketBase({ loaderData }: Pick<Route.ComponentProps, "loaderData">) {
    const { filters, base, history, variants, chaosRates } = loaderData;
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
    const latest = history.at(-1);
    const points = history.map((row) => ({ ...row, mergedSales: null }));
    return (
        <section
            aria-label="Crafting base"
            className="space-y-5 rounded-xl border border-border bg-card p-5"
        >
            <div>
                <Link to={marketLink(filters)} className="text-sm text-muted-foreground underline">
                    ← Back to markets
                </Link>
                <h2 className="mt-2 flex items-center gap-3 text-2xl font-semibold">
                    <CatalogItemArt name={base.baseType} game={game} className="size-16" />
                    {base.baseType}
                </h2>
                <p className="text-sm text-muted-foreground">{marketBaseDetails(base)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                    Normal, magic and rare items together; uncorrupted, unfractured and
                    uninfluenced.
                </p>
            </div>
            {variants.length > 1 ? (
                <nav aria-label="Base variants" className="space-y-2">
                    <h3 className="text-sm font-semibold">
                        Variants of {base.baseType}{" "}
                        <span className="font-normal text-muted-foreground">
                            ({variants.length})
                        </span>
                    </h3>
                    <ul className="flex flex-wrap gap-2 text-sm">
                        {variants.map((variant) => {
                            const price = marketListingPrices(variant.prices, chaosRates).find(
                                (entry) => !entry.outlier,
                            );
                            const current = variant.id === base.id;
                            return (
                                <li key={variant.id}>
                                    <Link
                                        to={marketBaseLink(filters, variant.id)}
                                        aria-current={current ? "page" : undefined}
                                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${current ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                                    >
                                        {marketBaseVariant(variant)}
                                        <span className="text-xs text-muted-foreground">
                                            {price ? (
                                                <>
                                                    {number(price.median)}{" "}
                                                    <CurrencyLabel
                                                        currency={price.currency}
                                                        game={game}
                                                        iconOnly
                                                    />
                                                    {" · "}
                                                </>
                                            ) : null}
                                            {number(variant.listingCount)} listed
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
            ) : null}
            {latest ? (
                <section aria-label="Price history" className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        {number(latest.listingCount)} listings from {number(latest.uniqueSellers)}{" "}
                        sellers at {marketUtc(latest.hour)}
                    </p>
                    <MarketPriceChart points={points} currency={filters.currency} game={game} />
                    <details>
                        <summary className="cursor-pointer text-sm">
                            Hourly observations (latest 72 hours with data)
                        </summary>
                        <HourlyTable
                            rows={history.slice(-72).reverse()}
                            currency={filters.currency}
                            game={game}
                        />
                    </details>
                </section>
            ) : (
                <p role="status">No observations for this base in the selected period.</p>
            )}
        </section>
    );
}
