import { useMemo } from "react";
import { Link } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { DataTable, dataTableColumns } from "~/components/data-table";
import {
    ExchangeItemName,
    ExchangePair,
    ExchangePrice,
    ExchangeTrend,
} from "~/components/market-exchange";
import { marketUtc } from "~/components/market-filters";
import {
    MARKET_EXCHANGE_DAYS,
    type MarketExchangeRow,
    type MarketExchangeUnit,
    marketExchangeUnitId,
} from "~/lib/market-exchange";
import { marketCompactNumber as compact } from "~/lib/market-number";
import type { MarketPriceRates } from "~/lib/market-price-currencies";

type Game = "poe1" | "poe2";

const column = dataTableColumns<MarketExchangeRow>();

function exchangeColumns(
    game: Game,
    unit: MarketExchangeUnit,
    rates: MarketPriceRates,
    itemLink: (itemId: string) => string,
) {
    return column.columns([
        column.accessor("name", {
            id: "item",
            header: "Item",
            sortDescFirst: false,
            meta: { filter: "text" },
            cell: ({ row: { original: row } }) => (
                <Link
                    to={itemLink(row.itemId)}
                    className="font-medium text-primary hover:underline"
                >
                    <ExchangeItemName
                        itemId={row.itemId}
                        name={row.name}
                        game={game}
                        className="gap-3"
                    />
                </Link>
            ),
        }),
        column.accessor((row) => row.price ?? undefined, {
            id: "price",
            header: "Value",
            sortDescFirst: true,
            sortUndefined: "last",
            enableColumnFilter: false,
            meta: { className: "tabular-nums" },
            cell: ({ row: { original: row } }) => {
                if (row.price === null)
                    return row.hour === null
                        ? `No trades in ${MARKET_EXCHANGE_DAYS} days`
                        : "No rate";
                return (
                    <>
                        <p className={row.current ? "font-semibold" : "text-muted-foreground"}>
                            <ExchangePrice price={row.price} rates={rates} game={game} />
                        </p>
                        {row.current ? null : (
                            <p className="text-xs text-muted-foreground">
                                Last traded {row.hour === null ? "—" : marketUtc(row.hour)}
                            </p>
                        )}
                        {row.via && row.via.itemId !== marketExchangeUnitId(unit) ? (
                            <p className="text-xs text-muted-foreground">
                                via{" "}
                                <ExchangeItemName
                                    itemId={row.via.itemId}
                                    name={row.via.name}
                                    game={game}
                                    className="gap-1"
                                    artClassName="size-4 rounded-none bg-transparent p-0"
                                />
                            </p>
                        ) : null}
                    </>
                );
            },
        }),
        column.accessor((row) => row.change ?? undefined, {
            id: "change",
            header: `Last ${MARKET_EXCHANGE_DAYS} days`,
            sortDescFirst: true,
            sortUndefined: "last",
            enableColumnFilter: false,
            cell: ({ row: { original: row } }) => (
                <ExchangeTrend history={row.history} change={row.change} />
            ),
        }),
        column.accessor((row) => row.volume ?? undefined, {
            id: "volume",
            header: "Volume / hour",
            sortDescFirst: true,
            sortUndefined: "last",
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ getValue }) => {
                const volume = getValue();
                return volume === undefined ? (
                    "—"
                ) : (
                    <>
                        {compact(volume)} <CurrencyLabel currency={unit} game={game} iconOnly />
                    </>
                );
            },
        }),
        column.display({
            id: "pair",
            header: "Most traded",
            cell: ({ row: { original: row } }) => <ExchangePair row={row} game={game} />,
        }),
    ]);
}

/**
 * Exchange items with their value (in the shared value display, see ExchangeDisplayPicker),
 * trend, volume and most traded pair.
 */
export function MarketExchangeTable({
    label,
    rows,
    game,
    unit,
    rates,
    itemLink,
}: {
    label: string;
    rows: MarketExchangeRow[];
    game: Game;
    unit: MarketExchangeUnit;
    rates: MarketPriceRates;
    itemLink: (itemId: string) => string;
}) {
    const columns = useMemo(
        () => exchangeColumns(game, unit, rates, itemLink),
        [game, unit, rates, itemLink],
    );
    return <DataTable label={label} data={rows} columns={columns} getRowId={(row) => row.itemId} />;
}
