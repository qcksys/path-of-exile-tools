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
import { marketNumber as number } from "~/lib/market-number";
import { marketTableState } from "~/lib/market-table";
import {
    type MarketFilters,
    marketCategorySchema,
    marketLink,
    parseMarketFilters,
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

export async function loader({ request, context, params }: Route.LoaderArgs) {
    if (params.category && !marketCategorySchema.safeParse(params.category).success)
        throw new Response("Unknown market category", { status: 404 });
    const filters = parseMarketFilters(request, { category: params.category });
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
    if (new URL(request.url).searchParams.has("category"))
        return redirect(marketLink(filters), 308);
    return getMarketData(context.get(dbContext), filters, "list");
}

type MarketRow = Awaited<ReturnType<typeof getMarketData>>["rows"][number];
type Game = "poe1" | "poe2";

const column = dataTableColumns<MarketRow>();

function marketColumns(filters: MarketFilters, game: Game) {
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
                const prices = Object.entries(row.prices ?? {});
                if (!prices.length) return "Unpriced";
                return prices.map(([currency, price]) => (
                    <p
                        key={currency}
                        className={
                            currency === filters.currency
                                ? "font-semibold"
                                : "text-muted-foreground"
                        }
                    >
                        {number(price.median)} <CurrencyLabel currency={currency} game={game} />
                        <span className="ml-2 text-xs text-muted-foreground">n={price.count}</span>
                    </p>
                ));
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
    server,
    empty,
}: {
    label: string;
    rows: MarketRow[];
    filters: MarketFilters;
    game: Game;
    server: DataTableServerState;
    empty?: ReactNode;
}) {
    const columns = useMemo(() => marketColumns(filters, game), [filters, game]);
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
    const { filters, seasons, season, rows, hasMore } = loaderData;
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
                    if (!entries.length) return null;
                    return (
                        <section
                            key={category}
                            aria-label={MARKET_CATEGORIES[category].label}
                            className="overflow-hidden rounded-xl border border-border bg-card"
                        >
                            <h3 className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-semibold">
                                {MARKET_CATEGORIES[category].label}
                                <span className="text-xs font-normal text-muted-foreground">
                                    {entries.length} variants
                                </span>
                            </h3>
                            <MarketTable
                                label={`${MARKET_CATEGORIES[category].label} markets`}
                                rows={entries}
                                filters={filters}
                                game={game}
                                server={server}
                            />
                        </section>
                    );
                })}
                {!rows.length ? (
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                        <MarketTable
                            label="Item markets"
                            rows={[]}
                            filters={filters}
                            game={game}
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
