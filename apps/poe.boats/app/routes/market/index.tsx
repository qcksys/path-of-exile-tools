import { type ReactNode, useCallback, useMemo } from "react";
import { Link, redirect, useNavigate } from "react-router";
import { DataTable, type DataTableServerState, dataTableColumns } from "~/components/data-table";
import { CatalogItemArt, ItemArt } from "~/components/item-art";
import { ExchangeDisplayPicker } from "~/components/market-exchange";
import { MarketExchangeTable } from "~/components/market-exchange-table";
import { MarketFiltersForm, marketUtc } from "~/components/market-filters";
import { MarketForbiddenJewels } from "~/components/market-forbidden-jewels";
import { MarketListingPrices } from "~/components/market-listing-price";
import { MarketRecentSales } from "~/components/market-recent-sales";
import { RouteError } from "~/components/route-error";
import { dbContext } from "~/context";
import { getMarketData } from "~/db/queries/market.queries";
import { marketItemArtUrl } from "~/lib/item-presentation";
import { type MarketBaseRow, marketBaseDetails, marketBaseVariant } from "~/lib/market-bases";
import {
    MARKET_CATEGORIES,
    MARKET_FORBIDDEN_CATEGORY,
    type MarketCategory,
} from "~/lib/market-categories";
import { marketNumber as number } from "~/lib/market-number";
import type { MarketPriceRates } from "~/lib/market-price-currencies";
import { marketTableState } from "~/lib/market-table";
import {
    type MarketFilters,
    marketBaseLink,
    marketCategorySchema,
    marketExchangeLink,
    marketLink,
    parseMarketFilters,
    poe2MarketRedirect,
} from "~/schemas/market";
import type { Route } from "./+types/index";

export const meta: Route.MetaFunction = ({ params }) => {
    const category = marketCategorySchema.safeParse(params.category);
    return [
        {
            title: `${category.success ? `${MARKET_CATEGORIES[category.data].label} · ` : ""}Season market · POE.BOATS`,
        },
    ];
};

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return <RouteError error={error} />;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
    if (params.category && !marketCategorySchema.safeParse(params.category).success)
        throw new Response("Unknown market category", { status: 404 });
    const filters = parseMarketFilters(request, { category: params.category });
    if (filters.realm === "poe2") return redirect(poe2MarketRedirect(filters), 308);
    if (filters.item)
        return redirect(
            marketLink(filters, {
                itemKey: filters.item,
                identified: filters.identified === "true",
                corrupted: filters.corrupted === "true",
                signatureKind: filters.kind,
                signatureValue: filters.value,
            }),
            308,
        );
    if (!params.category || new URL(request.url).searchParams.has("category"))
        return redirect(marketLink(filters), 308);
    return getMarketData(context.get(dbContext), filters, "list");
}

type MarketRow = Awaited<ReturnType<typeof getMarketData>>["rows"][number];
type ExchangeRow = Awaited<ReturnType<typeof getMarketData>>["exchange"][number];
type Game = "poe1" | "poe2";

const column = dataTableColumns<MarketRow>();
const baseColumn = dataTableColumns<MarketBaseRow>();

function ExchangeTable({
    label,
    rows,
    filters,
    game,
    rates,
}: {
    label: string;
    rows: ExchangeRow[];
    filters: MarketFilters;
    game: Game;
    rates: MarketPriceRates;
}) {
    const itemLink = useCallback(
        (itemId: string) => marketExchangeLink(filters, itemId),
        [filters],
    );
    return (
        <MarketExchangeTable
            label={label}
            rows={rows}
            game={game}
            unit="chaos"
            rates={rates}
            itemLink={itemLink}
        />
    );
}

type Prices = { chaosRates: Record<string, number>; rates: MarketPriceRates };

function baseColumns(filters: MarketFilters, game: Game, { chaosRates, rates }: Prices) {
    return baseColumn.columns([
        baseColumn.accessor((row) => `${row.baseType} ${marketBaseVariant(row)}`, {
            id: "item",
            header: "Base / variant",
            sortDescFirst: false,
            meta: { filter: "text" },
            cell: ({ row: { original: row } }) => (
                <div className="flex items-center gap-3">
                    <CatalogItemArt name={row.baseType} game={game} className="size-16" />
                    <div className="min-w-0">
                        <Link
                            to={marketBaseLink(filters, row.id)}
                            className="font-medium text-primary hover:underline"
                        >
                            {row.baseType}
                        </Link>
                        <p className="mt-1 max-w-md break-words text-xs text-muted-foreground">
                            {marketBaseDetails(row)}
                        </p>
                    </div>
                </div>
            ),
        }),
        baseColumn.accessor((row) => row.prices[filters.currency]?.median, {
            id: "price",
            header: "Median asking price",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ row: { original: row } }) => (
                <MarketListingPrices
                    prices={row.prices}
                    game={game}
                    chaosRates={chaosRates}
                    rates={rates}
                />
            ),
        }),
        baseColumn.accessor("listingCount", {
            id: "listings",
            header: "Listings",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ getValue }) => number(getValue()),
        }),
        baseColumn.accessor("uniqueSellers", {
            id: "sellers",
            header: "Sellers",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ getValue }) => number(getValue()),
        }),
        baseColumn.accessor("hour", {
            id: "observed",
            header: "Last observed",
            sortDescFirst: true,
            enableColumnFilter: false,
            meta: { className: "whitespace-nowrap text-xs text-muted-foreground" },
            cell: ({ getValue }) => marketUtc(getValue()),
        }),
    ]);
}

function BaseTable({
    label,
    rows,
    filters,
    game,
    prices,
    server,
}: {
    label: string;
    rows: MarketBaseRow[];
    filters: MarketFilters;
    game: Game;
    prices: Prices;
    server: DataTableServerState;
}) {
    const columns = useMemo(() => baseColumns(filters, game, prices), [filters, game, prices]);
    return (
        <DataTable
            label={label}
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            server={server}
        />
    );
}

function marketColumns(filters: MarketFilters, game: Game, { chaosRates, rates }: Prices) {
    return column.columns([
        column.accessor((row) => row.name || row.itemKey, {
            id: "item",
            header: "Item / variant",
            sortDescFirst: false,
            meta: { filter: "text" },
            cell: ({ row: { original: row } }) => (
                <div className="flex items-center gap-3">
                    <ItemArt
                        src={marketItemArtUrl(row.iconAsset, game)}
                        name={row.name || row.baseType}
                        className="size-16"
                        decorative
                    />
                    <div className="min-w-0">
                        <Link
                            to={marketLink(filters, row)}
                            className="font-medium text-primary hover:underline"
                        >
                            {row.name || row.itemKey}
                        </Link>
                        <p className="mt-1 max-w-md break-words text-xs text-muted-foreground">
                            {row.baseType} · {row.identified ? "Identified" : "Unidentified"}
                            {row.corrupted ? " · Corrupted" : ""}
                            {row.signatureValue ? ` · ${row.signatureValue}` : ""}
                        </p>
                    </div>
                </div>
            ),
        }),
        column.accessor((row) => row.prices?.[filters.currency]?.median, {
            id: "price",
            header: "Median asking price",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ row: { original: row } }) => (
                <MarketListingPrices
                    prices={row.prices}
                    game={game}
                    chaosRates={chaosRates}
                    rates={rates}
                />
            ),
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
                    <MarketRecentSales sales={row.recentSales} />
                    <p className="mt-1 text-xs text-muted-foreground">
                        {number(row.periodSales)} in {filters.days} days ·{" "}
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
    prices,
    server,
    empty,
}: {
    label: string;
    rows: MarketRow[];
    filters: MarketFilters;
    game: Game;
    prices: Prices;
    server: DataTableServerState;
    empty?: ReactNode;
}) {
    const columns = useMemo(() => marketColumns(filters, game, prices), [filters, game, prices]);
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
    const { filters, seasons, season, rows, bases, hasMore, chaosRates, priceRates, exchange } =
        loaderData;
    const navigate = useNavigate();
    const categories = Object.keys(MARKET_CATEGORIES) as MarketCategory[];
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
    const server = marketTableState(filters, (to) => navigate(to, { preventScrollReset: true }));
    const prices = useMemo(() => ({ chaosRates, rates: priceRates }), [chaosRates, priceRates]);
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
                            {filters.league || "Season"} · {rows.length + bases.length} variants on
                            this page
                        </p>
                    </div>
                    <div className="grid justify-items-end gap-1">
                        <p className="text-xs text-muted-foreground">
                            {season?.latestHour
                                ? `Data through ${marketUtc(Number(season.latestHour))}`
                                : "Awaiting season data"}
                        </p>
                        <ExchangeDisplayPicker game={game} />
                    </div>
                </header>
                {filters.category === MARKET_FORBIDDEN_CATEGORY && rows.length ? (
                    <MarketForbiddenJewels
                        rows={rows}
                        filters={filters}
                        game={game}
                        prices={prices}
                        server={server}
                    />
                ) : null}
                {categories.map((category) => {
                    if (filters.category === MARKET_FORBIDDEN_CATEGORY) return null;
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
                                    filters={filters}
                                    game={game}
                                    rates={priceRates}
                                />
                            ) : null}
                            {entries.length ? (
                                <MarketTable
                                    label={`${label} markets`}
                                    rows={entries}
                                    filters={filters}
                                    game={game}
                                    prices={prices}
                                    server={server}
                                />
                            ) : null}
                        </section>
                    );
                })}
                {bases.length > 0 && filters.category !== "all" ? (
                    <section
                        aria-label={MARKET_CATEGORIES[filters.category].label}
                        className="overflow-hidden rounded-xl border border-border bg-card"
                    >
                        <header className="border-b border-border px-4 py-3">
                            <h3 className="flex items-center justify-between text-sm font-semibold">
                                {MARKET_CATEGORIES[filters.category].label}
                                <span className="text-xs font-normal text-muted-foreground">
                                    {bases.length} variants
                                </span>
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Normal, magic and rare items together; uncorrupted, unfractured,
                                uninfluenced and not intangible. Crafting bases have no likely-sale
                                estimates.
                            </p>
                        </header>
                        <BaseTable
                            label={`${MARKET_CATEGORIES[filters.category].label} markets`}
                            rows={bases}
                            filters={filters}
                            game={game}
                            prices={prices}
                            server={server}
                        />
                    </section>
                ) : null}
                {!rows.length &&
                !bases.length &&
                (!exchange.length || server.columnFilters.length) ? (
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                        <MarketTable
                            label="Item markets"
                            rows={[]}
                            filters={filters}
                            game={game}
                            prices={prices}
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
