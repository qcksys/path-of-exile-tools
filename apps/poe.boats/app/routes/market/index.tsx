import { type ReactNode, useCallback, useMemo } from "react";
import { Link, redirect, useNavigate } from "react-router";
import { DataTable, type DataTableServerState } from "~/components/data-table";
import { ItemArt } from "~/components/item-art";
import { ExchangeDisplayPicker } from "~/components/market-exchange";
import { MarketExchangeTable } from "~/components/market-exchange-table";
import { MarketFiltersForm, marketUtc } from "~/components/market-filters";
import { MarketForbiddenJewels } from "~/components/market-forbidden-jewels";
import { type MarketListPrices, marketListColumns } from "~/components/market-list-table";
import { RouteError } from "~/components/route-error";
import { dbContext } from "~/context";
import { getMarketData } from "~/db/queries/market.queries";
import { marketItemArtUrl } from "~/lib/item-presentation";
import { MARKET_BASE_NOTE } from "~/lib/market-bases";
import { MARKET_CATEGORIES, type MarketCategory } from "~/lib/market-categories";
import { marketSettings } from "~/lib/market-kinds";
import type { MarketPriceRates } from "~/lib/market-price-currencies";
import { marketTableState } from "~/lib/market-table";
import {
    type MarketFilters,
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

type ListTableProps<Row> = {
    label: string;
    rows: Row[];
    filters: MarketFilters;
    game: Game;
    prices: MarketListPrices;
    server: DataTableServerState;
    empty?: ReactNode;
};

/** A crafting base's bands and description, or an item's base type and state. */
function rowDetails(row: MarketRow) {
    if (row.signatureKind === "base")
        return [row.signatureValue, row.baseDescription].filter(Boolean).join(" · ");
    return [
        row.baseType,
        row.identified ? "Identified" : "Unidentified",
        row.corrupted ? "Corrupted" : "",
        row.signatureValue,
    ]
        .filter(Boolean)
        .join(" · ");
}

function StashTable({
    label,
    rows,
    filters,
    game,
    prices,
    server,
    empty,
}: ListTableProps<MarketRow>) {
    const columns = useMemo(
        () =>
            marketListColumns<MarketRow>(filters, game, prices, {
                itemText: (row) => row.name || row.itemKey,
                item: (row) => ({
                    name: row.name || row.itemKey,
                    to: marketLink(filters, row),
                    art: (
                        <ItemArt
                            src={marketItemArtUrl(row.iconAsset, game)}
                            name={row.name || row.baseType}
                            className="size-16"
                            decorative
                        />
                    ),
                    details: rowDetails(row),
                }),
                sales: (row) => ({
                    period: row.periodSales,
                    pending: row.periodPending,
                    recent: row.recentSales,
                }),
            }),
        [filters, game, prices],
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
    const { filters, seasons, season, rows, hasMore, chaosRates, priceRates, exchange } =
        loaderData;
    const navigate = useNavigate();
    const categories = Object.keys(MARKET_CATEGORIES) as MarketCategory[];
    const game: Game = filters.realm === "poe2" ? "poe2" : "poe1";
    const server = marketTableState(filters, (to) => navigate(to, { preventScrollReset: true }));
    const prices = useMemo(() => ({ chaosRates, rates: priceRates }), [chaosRates, priceRates]);
    const settings = marketSettings(filters.category);
    const table = { filters, game, prices, server };
    const empty = (
        <div role="status" className="py-6">
            <h3 className="text-lg font-medium text-foreground">
                {seasons.length ? "No markets match these filters" : "No season data yet"}
            </h3>
            <p className="mt-2 text-sm">
                {seasons.length
                    ? "Try another category, season, search term or column filter."
                    : "Markets appear after the first completed hour is ingested."}
            </p>
        </div>
    );
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
                    <div className="grid justify-items-end gap-1">
                        <p className="text-xs text-muted-foreground">
                            {season?.latestHour
                                ? `Data through ${marketUtc(Number(season.latestHour))}`
                                : "Awaiting season data"}
                        </p>
                        <ExchangeDisplayPicker game={game} />
                    </div>
                </header>
                {settings.layout === "pairs" ? (
                    rows.length ? (
                        <MarketForbiddenJewels
                            rows={rows}
                            filters={filters}
                            game={game}
                            prices={prices}
                            server={server}
                        />
                    ) : null
                ) : (
                    categories.map((category) => {
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
                                <header className="border-b border-border px-4 py-3">
                                    <h3 className="flex items-center justify-between text-sm font-semibold">
                                        {label}
                                        <span className="text-xs font-normal text-muted-foreground">
                                            {[
                                                traded.length
                                                    ? `${traded.length} on the exchange`
                                                    : "",
                                                entries.length ? `${entries.length} variants` : "",
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </span>
                                    </h3>
                                    {settings.kind === "base" ? (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {MARKET_BASE_NOTE}
                                        </p>
                                    ) : null}
                                </header>
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
                                    <StashTable
                                        label={`${label} markets`}
                                        rows={entries}
                                        {...table}
                                    />
                                ) : null}
                            </section>
                        );
                    })
                )}
                {!rows.length && (!exchange.length || server.columnFilters.length) ? (
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                        <StashTable label="Item markets" rows={[]} {...table} empty={empty} />
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
