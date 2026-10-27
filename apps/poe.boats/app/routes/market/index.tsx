import { exchangeCurrencyId } from "@poe-tools/market";
import { type ReactNode, useMemo, useState } from "react";
import { Link, redirect, useNavigate } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { DataTable, type DataTableServerState, dataTableColumns } from "~/components/data-table";
import { ItemArt } from "~/components/item-art";
import {
    EXCHANGE_DISPLAYS,
    type ExchangeDisplay,
    ExchangeItemName,
    ExchangePair,
    ExchangePrice,
    ExchangeTrend,
} from "~/components/market-exchange";
import { MarketFiltersForm, marketUtc } from "~/components/market-filters";
import { Button } from "~/components/ui/button";
import { dbContext } from "~/context";
import { getMarketData } from "~/db/queries/market.queries";
import type { MarketPriceSummary } from "~/db/schema/stash.unique-hourly";
import { marketItemArtUrl } from "~/lib/item-presentation";
import { type MarketBaseRow, marketBaseVariant } from "~/lib/market-bases";
import { MARKET_CATEGORIES, type MarketCategory } from "~/lib/market-categories";
import { MARKET_EXCHANGE_DAYS } from "~/lib/market-exchange";
import {
    MARKET_OUTLIER_FACTOR,
    type MarketListingPrice,
    marketListingPrices,
} from "~/lib/market-listing-prices";
import { marketCompactNumber as compact, marketNumber as number } from "~/lib/market-number";
import { marketTableState } from "~/lib/market-table";
import { marketSignatureLabel } from "~/lib/mod-pools";
import {
    type MarketFilters,
    marketCategorySchema,
    marketExchangeLink,
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

const CHAOS = exchangeCurrencyId("chaos")!;
const DIVINE = exchangeCurrencyId("divine")!;

const column = dataTableColumns<MarketRow>();
const exchangeColumn = dataTableColumns<ExchangeRow>();
const baseColumn = dataTableColumns<MarketBaseRow>();

function exchangeColumns(
    filters: MarketFilters,
    game: Game,
    divine: number | undefined,
    display: ExchangeDisplay,
) {
    return exchangeColumn.columns([
        exchangeColumn.accessor("name", {
            id: "item",
            header: "Item",
            sortDescFirst: false,
            meta: { filter: "text" },
            cell: ({ row: { original: row } }) => (
                <Link
                    to={marketExchangeLink(filters, row.itemId)}
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
        exchangeColumn.accessor((row) => row.chaos ?? undefined, {
            id: "price",
            header: "Value",
            sortDescFirst: true,
            sortUndefined: "last",
            enableColumnFilter: false,
            meta: { className: "tabular-nums" },
            cell: ({ row: { original: row } }) => {
                if (row.chaos === null)
                    return row.hour === null
                        ? `No trades in ${MARKET_EXCHANGE_DAYS} days`
                        : "No rate";
                return (
                    <>
                        <p className={row.current ? "font-semibold" : "text-muted-foreground"}>
                            <ExchangePrice
                                chaos={row.chaos}
                                divine={divine}
                                display={display}
                                game={game}
                            />
                        </p>
                        {row.current ? null : (
                            <p className="text-xs text-muted-foreground">
                                Last traded {row.hour === null ? "—" : marketUtc(row.hour)}
                            </p>
                        )}
                        {row.via && row.via.itemId !== CHAOS ? (
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
        exchangeColumn.accessor((row) => row.change ?? undefined, {
            id: "change",
            header: `Last ${MARKET_EXCHANGE_DAYS} days`,
            sortDescFirst: true,
            sortUndefined: "last",
            enableColumnFilter: false,
            cell: ({ row: { original: row } }) => (
                <ExchangeTrend history={row.history} change={row.change} />
            ),
        }),
        exchangeColumn.accessor((row) => row.volume ?? undefined, {
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
                        {compact(volume)} <CurrencyLabel currency="chaos" game={game} iconOnly />
                    </>
                );
            },
        }),
        exchangeColumn.display({
            id: "pair",
            header: "Most traded",
            cell: ({ row: { original: row } }) => <ExchangePair row={row} game={game} />,
        }),
    ]);
}

function ExchangeTable({
    label,
    rows,
    filters,
    game,
    divine,
}: {
    label: string;
    rows: ExchangeRow[];
    filters: MarketFilters;
    game: Game;
    divine: number | undefined;
}) {
    const [display, setDisplay] = useState<ExchangeDisplay>("adaptive");
    const columns = useMemo(
        () => exchangeColumns(filters, game, divine, display),
        [filters, game, divine, display],
    );
    return (
        <>
            <fieldset className="flex flex-wrap items-center gap-2 px-4 pt-3 text-xs text-muted-foreground">
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
            <DataTable label={label} data={rows} columns={columns} getRowId={(row) => row.itemId} />
        </>
    );
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

function PriceLines({
    prices,
    currency,
    game,
    chaosRates,
}: {
    prices: Record<string, MarketPriceSummary> | null;
    currency: string;
    game: Game;
    chaosRates: Record<string, number>;
}) {
    const listed = marketListingPrices(prices, chaosRates);
    if (!listed.length) return "Unpriced";
    const line = (price: MarketListingPrice) => (
        <ListingPrice
            key={price.currency}
            price={price}
            selected={price.currency === currency}
            game={game}
        />
    );
    const outliers = listed.filter((price) => price.outlier);
    return (
        <>
            {listed.filter((price) => !price.outlier).map(line)}
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
}

function baseColumns(filters: MarketFilters, game: Game, chaosRates: Record<string, number>) {
    return baseColumn.columns([
        baseColumn.accessor((row) => `${row.baseType} ${marketBaseVariant(row)}`, {
            id: "item",
            header: "Base / variant",
            sortDescFirst: false,
            meta: { filter: "text" },
            cell: ({ row: { original: row } }) => (
                <>
                    <p className="font-medium">{row.baseType}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{marketBaseVariant(row)}</p>
                </>
            ),
        }),
        baseColumn.accessor((row) => row.prices[filters.currency]?.median, {
            id: "price",
            header: "Median asking price",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ row: { original: row } }) => (
                <PriceLines
                    prices={row.prices}
                    currency={filters.currency}
                    game={game}
                    chaosRates={chaosRates}
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
    chaosRates,
    server,
}: {
    label: string;
    rows: MarketBaseRow[];
    filters: MarketFilters;
    game: Game;
    chaosRates: Record<string, number>;
    server: DataTableServerState;
}) {
    const columns = useMemo(
        () => baseColumns(filters, game, chaosRates),
        [filters, game, chaosRates],
    );
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
                        {marketSignatureLabel(row) ? ` · ${marketSignatureLabel(row)}` : ""}
                    </p>
                </>
            ),
        }),
        column.accessor((row) => row.prices?.[filters.currency]?.median, {
            id: "price",
            header: "Median asking price",
            sortDescFirst: true,
            meta: { filter: "range", className: "tabular-nums" },
            cell: ({ row: { original: row } }) => (
                <PriceLines
                    prices={row.prices}
                    currency={filters.currency}
                    game={game}
                    chaosRates={chaosRates}
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
    const { filters, seasons, season, rows, bases, hasMore, chaosRates, exchange } = loaderData;
    const navigate = useNavigate();
    const categories = Object.keys(MARKET_CATEGORIES) as MarketCategory[];
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
    const server = marketTableState(filters, (to) => navigate(to, { preventScrollReset: true }));
    // Stash prices convert only at the latest hour's divine rate; exchange values may use an earlier day's.
    const exchangeDivine =
        chaosRates.divine ?? exchange.find((row) => row.itemId === DIVINE)?.chaos ?? undefined;
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
                                    filters={filters}
                                    game={game}
                                    divine={exchangeDivine}
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
                                Normal, magic and rare items together; uncorrupted, unfractured and
                                uninfluenced. Crafting bases have no likely-sale estimates.
                            </p>
                        </header>
                        <BaseTable
                            label={`${MARKET_CATEGORIES[filters.category].label} markets`}
                            rows={bases}
                            filters={filters}
                            game={game}
                            chaosRates={chaosRates}
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
