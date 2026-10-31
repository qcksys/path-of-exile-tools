import type { ReactNode } from "react";
import { Link } from "react-router";
import { dataTableColumns } from "~/components/data-table";
import { marketUtc } from "~/components/market-filters";
import { MarketListingPrices } from "~/components/market-listing-price";
import { MarketRecentSales } from "~/components/market-recent-sales";
import type { MarketPriceSummary } from "~/db/schema/stash.unique-hourly";
import { marketNumber as number } from "~/lib/market-number";
import type { MarketPriceRates } from "~/lib/market-price-currencies";
import type { MarketFilters } from "~/schemas/market";

type Game = "poe1" | "poe2";

export type MarketListPrices = { chaosRates: Record<string, number>; rates: MarketPriceRates };

type MarketListRow = {
    prices: Record<string, Pick<MarketPriceSummary, "count" | "min" | "median" | "max">> | null;
    listingCount: number;
    uniqueSellers: number;
    hour: number;
};

/** How a list shows its rows' items. */
export type MarketListColumnSettings<Row> = {
    itemText: (row: Row) => string;
    item: (row: Row) => { name: string; to: string; art: ReactNode; details: ReactNode };
    sales: (row: Row) => {
        period: number;
        pending: number;
        recent: { hourly: number[]; daily: number[] };
    };
};

export function marketListColumns<Row extends MarketListRow>(
    filters: MarketFilters,
    game: Game,
    { chaosRates, rates }: MarketListPrices,
    { itemText, item, sales }: MarketListColumnSettings<Row>,
) {
    const column = dataTableColumns<Row>();
    return column.columns([
        column.accessor(itemText, {
            id: "item",
            header: "Item / variant",
            sortDescFirst: false,
            meta: { filter: "text" },
            cell: ({ row: { original: row } }) => {
                const { name, to, art, details } = item(row);
                return (
                    <div className="flex items-center gap-3">
                        {art}
                        <div className="min-w-0">
                            <Link to={to} className="font-medium text-primary hover:underline">
                                {name}
                            </Link>
                            <p className="mt-1 max-w-md break-words text-xs text-muted-foreground">
                                {details}
                            </p>
                        </div>
                    </div>
                );
            },
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
        column.accessor((row) => row.listingCount, {
            id: "listings",
            header: "Listings",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ getValue }) => number(getValue()),
        }),
        column.accessor((row) => row.uniqueSellers, {
            id: "sellers",
            header: "Sellers",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ getValue }) => number(getValue()),
        }),
        column.accessor((row) => sales(row).period, {
            id: "sales",
            header: "Likely sales",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ row: { original: row } }) => {
                const { period, pending, recent } = sales(row);
                return (
                    <>
                        <MarketRecentSales sales={recent} />
                        <p className="mt-1 text-xs text-muted-foreground">
                            {number(period)} in {filters.days} days · {number(pending)} pending
                        </p>
                    </>
                );
            },
        }),
        column.accessor((row) => row.hour, {
            id: "observed",
            header: "Last observed",
            sortDescFirst: true,
            enableColumnFilter: false,
            meta: { className: "whitespace-nowrap text-xs text-muted-foreground" },
            cell: ({ getValue }) => marketUtc(getValue()),
        }),
    ]);
}
