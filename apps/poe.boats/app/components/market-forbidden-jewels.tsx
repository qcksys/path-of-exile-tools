import { useMemo } from "react";
import { Link } from "react-router";
import { DataTable, type DataTableServerState, dataTableColumns } from "~/components/data-table";
import { MarketListingPrice, MarketListingPrices } from "~/components/market-listing-price";
import { MarketRecentSales } from "~/components/market-recent-sales";
import type { MarketPriceSummary } from "~/db/schema/stash.unique-hourly";
import { type ForbiddenJewelPair, forbiddenJewelClasses } from "~/lib/forbidden-jewels";
import { marketListingPrices, marketMostListedPrice } from "~/lib/market-listing-prices";
import { marketNumber as number } from "~/lib/market-number";
import type { MarketPriceRates } from "~/lib/market-price-currencies";
import { type MarketFilters, type MarketSortColumn, marketLink } from "~/schemas/market";

type Game = "poe1" | "poe2";

type ForbiddenRow = NonNullable<Parameters<typeof marketLink>[1]> & {
    name: string | null;
    prices: Record<string, MarketPriceSummary> | null;
    periodSales: number;
    periodPending: number;
    recentSales: { hourly: number[]; daily: number[] };
    listingCount: number;
    uniqueSellers: number;
    hour: number;
};

type PairRow = { pair: ForbiddenJewelPair<ForbiddenRow>; value: number | undefined };

const column = dataTableColumns<PairRow>();

type Prices = { chaosRates: Record<string, number>; rates: MarketPriceRates };

/** A market's most listed currency's median in chaos; undefined when unlisted or unrated. */
function chaosValue(row: ForbiddenRow | undefined, chaosRates: Record<string, number>) {
    return row && marketMostListedPrice(marketListingPrices(row.prices, chaosRates))?.chaos;
}

function pairValue(pair: ForbiddenJewelPair<ForbiddenRow>, chaosRates: Record<string, number>) {
    const flame = chaosValue(pair.flame, chaosRates);
    const flesh = chaosValue(pair.flesh, chaosRates);
    return flame === undefined || flesh === undefined ? undefined : flame + flesh;
}

function pairTotal(pair: ForbiddenJewelPair<ForbiddenRow>, value: (row: ForbiddenRow) => number) {
    return (pair.flame ? value(pair.flame) : 0) + (pair.flesh ? value(pair.flesh) : 0);
}

const PAIR_ORDER_VALUES: Partial<Record<MarketSortColumn, (row: PairRow) => number | undefined>> = {
    price: ({ value }) => value,
    sales: ({ pair }) => pairTotal(pair, (row) => row.periodSales),
    listings: ({ pair }) => pairTotal(pair, (row) => row.listingCount),
    sellers: ({ pair }) => pairTotal(pair, (row) => row.uniqueSellers),
    observed: ({ pair }) => Math.max(pair.flame?.hour ?? 0, pair.flesh?.hour ?? 0),
};

/** A notable's rows in the table's order, with unpriced pairs last in either direction. */
function sortPairs(rows: PairRow[], sort: { id: string; desc: boolean } | undefined) {
    const direction = sort?.desc ? -1 : 1;
    const byNotable = (a: PairRow, b: PairRow) => a.pair.notable.localeCompare(b.pair.notable);
    const metric = sort && PAIR_ORDER_VALUES[sort.id as MarketSortColumn];
    if (!metric) return rows.toSorted((a, b) => direction * byNotable(a, b));
    return rows.toSorted((a, b) => {
        const [first, second] = [metric(a), metric(b)];
        if (first === undefined || second === undefined)
            return (
                (first === undefined ? 1 : 0) - (second === undefined ? 1 : 0) || byNotable(a, b)
            );
        return direction * (first - second) || byNotable(a, b);
    });
}

function slug(text: string) {
    return `forbidden-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function JewelCell({
    row,
    filters,
    game,
    prices,
}: {
    row: ForbiddenRow | undefined;
    filters: MarketFilters;
    game: Game;
    prices: Prices;
}) {
    if (!row) return <span className="text-xs text-muted-foreground">Not listed</span>;
    return (
        <Link to={marketLink(filters, row)} className="block rounded-md hover:bg-muted/60">
            <MarketListingPrices
                prices={row.prices}
                game={game}
                chaosRates={prices.chaosRates}
                rates={prices.rates}
            />
            <div className="mt-2">
                <MarketRecentSales sales={row.recentSales} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {number(row.periodSales)} in {filters.days} days · {number(row.periodPending)}{" "}
                pending
            </p>
        </Link>
    );
}

function pairColumns(filters: MarketFilters, game: Game, prices: Prices) {
    return column.columns([
        column.display({
            id: "notable",
            header: "Notable",
            cell: ({ row: { original: row } }) => (
                <span className="font-medium">
                    {row.pair.notable}
                    {row.pair.corrupted ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                            Corrupted
                        </span>
                    ) : null}
                </span>
            ),
        }),
        column.display({
            id: "flame",
            header: "Forbidden Flame",
            meta: { className: "tabular-nums" },
            cell: ({ row: { original: row } }) => (
                <JewelCell row={row.pair.flame} filters={filters} game={game} prices={prices} />
            ),
        }),
        column.display({
            id: "flesh",
            header: "Forbidden Flesh",
            meta: { className: "tabular-nums" },
            cell: ({ row: { original: row } }) => (
                <JewelCell row={row.pair.flesh} filters={filters} game={game} prices={prices} />
            ),
        }),
        column.accessor("value", {
            id: "price",
            header: "Pair",
            sortDescFirst: true,
            enableColumnFilter: false,
            meta: { className: "font-semibold tabular-nums" },
            cell: ({ getValue }) => {
                const value = getValue();
                return value === undefined ? (
                    <span className="text-xs font-normal text-muted-foreground">—</span>
                ) : (
                    <MarketListingPrice
                        price={{
                            currency: "chaos",
                            median: value,
                            count: 0,
                            chaos: value,
                            outlier: false,
                        }}
                        rates={prices.rates}
                        game={game}
                    />
                );
            },
        }),
        column.accessor((row) => pairTotal(row.pair, (jewel) => jewel.periodSales), {
            id: "sales",
            header: "Likely sales",
            sortDescFirst: true,
            enableColumnFilter: false,
            meta: { className: "tabular-nums" },
            cell: ({ getValue }) => number(getValue()),
        }),
    ]);
}

function AscendancyTable({
    ascendancy,
    pairs,
    filters,
    game,
    prices,
    server,
}: {
    ascendancy: string;
    pairs: ForbiddenJewelPair<ForbiddenRow>[];
    filters: MarketFilters;
    game: Game;
    prices: Prices;
    server: DataTableServerState;
}) {
    const columns = useMemo(() => pairColumns(filters, game, prices), [filters, game, prices]);
    const rows = sortPairs(
        pairs.map((pair) => ({ pair, value: pairValue(pair, prices.chaosRates) })),
        server.sorting[0],
    );
    return (
        <DataTable
            label={`${ascendancy} notables`}
            data={rows}
            columns={columns}
            getRowId={({ pair }) => `${pair.notable}|${pair.corrupted}`}
            server={server}
        />
    );
}

/**
 * Forbidden Flame and Flesh paired by notable, grouped by class and ascendancy, with each pair's
 * combined price and likely sales: both jewels must allocate the same notable. Each ascendancy's
 * pairs follow the table's order.
 */
export function MarketForbiddenJewels({
    rows,
    filters,
    game,
    prices,
    server,
}: {
    rows: ForbiddenRow[];
    filters: MarketFilters;
    game: Game;
    prices: Prices;
    server: DataTableServerState;
}) {
    const classes = forbiddenJewelClasses(rows);
    return (
        <div className="space-y-4">
            <nav aria-label="Classes" className="flex flex-wrap gap-2 text-sm">
                {classes.map(({ className }) => (
                    <a
                        key={className}
                        href={`#${slug(className)}`}
                        className="rounded-full border border-border px-3 py-1 hover:bg-muted"
                    >
                        {className}
                    </a>
                ))}
            </nav>
            {classes.map(({ className, ascendancies }) => (
                <section
                    key={className}
                    id={slug(className)}
                    aria-label={className}
                    className="overflow-hidden rounded-xl border border-border bg-card"
                >
                    <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
                        {className}
                    </h3>
                    {ascendancies.map(({ ascendancy, pairs }) => (
                        <div key={ascendancy} className="border-b border-border last:border-0">
                            <h4 className="bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">
                                {ascendancy}
                            </h4>
                            <AscendancyTable
                                ascendancy={ascendancy}
                                pairs={pairs}
                                filters={filters}
                                game={game}
                                prices={prices}
                                server={server}
                            />
                        </div>
                    ))}
                </section>
            ))}
        </div>
    );
}
