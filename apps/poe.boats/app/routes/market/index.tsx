import { type ReactNode, useMemo } from "react";
import { Link, redirect, useNavigate } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { DataTable, type DataTableServerState, dataTableColumns } from "~/components/data-table";
import { ItemArt } from "~/components/item-art";
import { MarketFiltersForm, marketUtc } from "~/components/market-filters";
import { dbContext } from "~/context";
import { getMarketData } from "~/db/queries/market.queries";
import { marketItemArtUrl } from "~/lib/item-presentation";
import { MARKET_CATEGORIES, type MarketCategory } from "~/lib/market-categories";
import {
    MARKET_OUTLIER_FACTOR,
    type MarketListingPrice,
    marketChaosPrice,
    marketListingPrices,
} from "~/lib/market-listing-prices";
import { marketNumber as number } from "~/lib/market-number";
import { marketTableState } from "~/lib/market-table";
import { type MarketFilters, marketLink, parseMarketFilters } from "~/schemas/market";
import type { Route } from "./+types/index";

export async function loader({ request, context }: Route.LoaderArgs) {
    const filters = parseMarketFilters(request);
    if (filters.item)
        return redirect(
            marketLink(filters, {
                itemKey: filters.item,
                identified: filters.identified === "true",
                corrupted: filters.corrupted === "true",
                foilVariation: filters.foil,
                signatureKind: filters.kind,
                signatureValue: filters.value,
            }),
            308,
        );
    return getMarketData(context.get(dbContext), filters, "list");
}

type MarketRow = Awaited<ReturnType<typeof getMarketData>>["rows"][number];
type ExchangeRow = Awaited<ReturnType<typeof getMarketData>>["exchange"][number];
type Game = "poe1" | "poe2";

const column = dataTableColumns<MarketRow>();
const exchangeColumn = dataTableColumns<ExchangeRow>();

function exchangeColumns(game: Game, divine: number | undefined) {
    return exchangeColumn.columns([
        exchangeColumn.accessor("name", {
            id: "item",
            header: "Item",
            sortDescFirst: false,
            meta: { filter: "text" },
            cell: ({ row: { original: row } }) => (
                <CurrencyLabel
                    currency={row.itemId}
                    label={row.name}
                    game={game}
                    className="font-medium"
                />
            ),
        }),
        exchangeColumn.accessor((row) => row.chaos ?? undefined, {
            id: "price",
            header: "Exchange price",
            sortDescFirst: true,
            sortUndefined: "last",
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ row: { original: row } }) => {
                if (row.chaos === null) return row.volume ? "No rate" : "No trades in 24h";
                const price = marketChaosPrice(row.chaos, divine);
                return (
                    <p className="font-semibold">
                        {number(price.amount)}{" "}
                        <CurrencyLabel currency={price.currency} game={game} />
                        {price.equivalent ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                                ≈ {number(price.equivalent.amount)}{" "}
                                <CurrencyLabel
                                    currency={price.equivalent.currency}
                                    game={game}
                                    iconOnly
                                />
                            </span>
                        ) : null}
                    </p>
                );
            },
        }),
        exchangeColumn.accessor("volume", {
            id: "volume",
            header: "Traded (latest hour)",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ getValue }) => number(getValue()),
        }),
        exchangeColumn.accessor((row) => row.hour ?? undefined, {
            id: "traded",
            header: "Last traded",
            sortDescFirst: true,
            sortUndefined: "last",
            enableColumnFilter: false,
            meta: { className: "whitespace-nowrap text-xs text-muted-foreground" },
            cell: ({ getValue }) => {
                const hour = getValue();
                return hour === undefined ? "—" : marketUtc(hour);
            },
        }),
    ]);
}

function ExchangeTable({
    label,
    rows,
    game,
    divine,
}: {
    label: string;
    rows: ExchangeRow[];
    game: Game;
    divine: number | undefined;
}) {
    const columns = useMemo(() => exchangeColumns(game, divine), [game, divine]);
    return <DataTable label={label} data={rows} columns={columns} getRowId={(row) => row.itemId} />;
}

function ListingPrice({
    price,
    selected,
    game,
}: {
    price: MarketListingPrice;
    selected: boolean;
    game: Game;
}) {
    return (
        <p className={selected ? "font-semibold" : "text-muted-foreground"}>
            {number(price.median)} <CurrencyLabel currency={price.currency} game={game} />
            {price.equivalent ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ≈ {number(price.equivalent.amount)}{" "}
                    <CurrencyLabel currency={price.equivalent.currency} game={game} iconOnly />
                </span>
            ) : null}
            <span className="ml-2 text-xs text-muted-foreground">n={price.count}</span>
        </p>
    );
}

function marketColumns(filters: MarketFilters, game: Game, chaosRates: Record<string, number>) {
    return column.columns([
        column.accessor((row) => row.name || row.itemKey, {
            id: "item",
            header: "Item / variant",
            sortDescFirst: false,
            meta: { filter: "text" },
            cell: ({ row: { original: row } }) => (
                <>
                    <Link
                        to={marketLink(filters, row)}
                        className="flex items-center gap-3 font-medium text-primary hover:underline"
                    >
                        <ItemArt
                            src={marketItemArtUrl(row.iconAsset, game)}
                            name={row.name || row.baseType}
                            decorative
                        />
                        {row.name || row.itemKey}
                    </Link>
                    <p className="mt-1 max-w-md break-words text-xs text-muted-foreground">
                        {row.baseType} · {row.identified ? "Identified" : "Unidentified"}
                        {row.corrupted ? " · Corrupted" : ""}
                        {row.foilVariation >= 0 ? ` · Foil ${row.foilVariation}` : ""}
                        {row.signatureKind ? ` · ${row.signatureValue}` : ""}
                    </p>
                </>
            ),
        }),
        column.accessor((row) => row.prices?.[filters.currency]?.median, {
            id: "price",
            header: "Median asking price",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ row: { original: row } }) => {
                const prices = marketListingPrices(row.prices, chaosRates);
                if (!prices.length) return "Unpriced";
                const line = (price: MarketListingPrice) => (
                    <ListingPrice
                        key={price.currency}
                        price={price}
                        selected={price.currency === filters.currency}
                        game={game}
                    />
                );
                const outliers = prices.filter((price) => price.outlier);
                return (
                    <>
                        {prices.filter((price) => !price.outlier).map(line)}
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
            },
        }),
        column.accessor("listingCount", {
            id: "listings",
            header: "Listings",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ getValue }) => number(getValue()),
        }),
        column.accessor("uniqueSellers", {
            id: "sellers",
            header: "Sellers",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ getValue }) => number(getValue()),
        }),
        column.accessor("periodSales", {
            id: "sales",
            header: "Likely sales",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ row: { original: row } }) => (
                <>
                    <span className="font-semibold">{number(row.periodSales)}</span>
                    <p className="text-xs text-muted-foreground">
                        {number(row.periodPending)} pending
                    </p>
                </>
            ),
        }),
        column.accessor("hour", {
            id: "observed",
            header: "Last observed",
            sortDescFirst: true,
            enableColumnFilter: false,
            meta: { className: "whitespace-nowrap text-xs text-muted-foreground" },
            cell: ({ getValue }) => marketUtc(getValue()),
        }),
    ]);
}

function MarketTable({
    label,
    rows,
    filters,
    game,
    chaosRates,
    server,
    empty,
}: {
    label: string;
    rows: MarketRow[];
    filters: MarketFilters;
    game: Game;
    chaosRates: Record<string, number>;
    server: DataTableServerState;
    empty?: ReactNode;
}) {
    const columns = useMemo(
        () => marketColumns(filters, game, chaosRates),
        [filters, game, chaosRates],
    );
    return (
        <DataTable
            label={label}
            data={rows}
            columns={columns}
            getRowId={(row) => marketLink(filters, row)}
            server={server}
            empty={empty}
        />
    );
}

export default function MarketIndex({ loaderData }: Pick<Route.ComponentProps, "loaderData">) {
    const { filters, seasons, season, rows, hasMore, chaosRates, exchange } = loaderData;
    const navigate = useNavigate();
    const categories = Object.keys(MARKET_CATEGORIES) as MarketCategory[];
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
    const server = marketTableState(filters, (to) => navigate(to, { preventScrollReset: true }));
    return (
        <>
            <MarketFiltersForm filters={filters} seasons={seasons} />
            <section aria-label="Item markets" className="space-y-4">
                <header className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <h2 className="text-xl font-semibold">
                            {filters.category === "all"
                                ? "All items"
                                : MARKET_CATEGORIES[filters.category].label}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {filters.league || "Season"} · {rows.length} variants on this page
                        </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {season?.latestHour
                            ? `Data through ${marketUtc(Number(season.latestHour))}`
                            : "Awaiting season data"}
                    </p>
                </header>
                {categories.map((category) => {
                    const entries = rows.filter((row) => row.category === category);
                    const traded = exchange.filter((row) => row.category === category);
                    if (!entries.length && !traded.length) return null;
                    const { label } = MARKET_CATEGORIES[category];
                    return (
                        <section
                            key={category}
                            aria-label={label}
                            className="overflow-hidden rounded-xl border border-border bg-card"
                        >
                            <h3 className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-semibold">
                                {label}
                                <span className="text-xs font-normal text-muted-foreground">
                                    {[
                                        traded.length ? `${traded.length} on the exchange` : "",
                                        entries.length ? `${entries.length} variants` : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                </span>
                            </h3>
                            {traded.length ? (
                                <ExchangeTable
                                    label={`${label} exchange`}
                                    rows={traded}
                                    game={game}
                                    divine={chaosRates.divine}
                                />
                            ) : null}
                            {entries.length ? (
                                <MarketTable
                                    label={`${label} markets`}
                                    rows={entries}
                                    filters={filters}
                                    game={game}
                                    chaosRates={chaosRates}
                                    server={server}
                                />
                            ) : null}
                        </section>
                    );
                })}
                {!rows.length && (!exchange.length || server.columnFilters.length) ? (
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                        <MarketTable
                            label="Item markets"
                            rows={[]}
                            filters={filters}
                            game={game}
                            chaosRates={chaosRates}
                            server={server}
                            empty={
                                <div role="status" className="py-6">
                                    <h3 className="text-lg font-medium text-foreground">
                                        {seasons.length
                                            ? "No markets match these filters"
                                            : "No season data yet"}
                                    </h3>
                                    <p className="mt-2 text-sm">
                                        {seasons.length
                                            ? "Try another category, season, search term or column filter."
                                            : "Markets appear after the first completed hour is ingested."}
                                    </p>
                                </div>
                            }
                        />
                    </div>
                ) : null}
                <nav
                    aria-label="Market pages"
                    className="flex items-center justify-between py-3 text-sm"
                >
                    <span className="text-muted-foreground">Page {filters.page}</span>
                    <div className="flex gap-4">
                        {filters.page > 1 ? (
                            <Link
                                to={marketLink({ ...filters, page: filters.page - 1 })}
                                className="text-primary"
                            >
                                Previous
                            </Link>
                        ) : null}
                        {hasMore ? (
                            <Link
                                to={marketLink({ ...filters, page: filters.page + 1 })}
                                className="text-primary"
                            >
                                Next
                            </Link>
                        ) : null}
                    </div>
                </nav>
            </section>
        </>
    );
}
