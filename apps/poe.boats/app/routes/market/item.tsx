import { useCallback, useMemo } from "react";
import { Link } from "react-router";
import { DataTable, dataTableColumns } from "~/components/data-table";
import { ItemArt } from "~/components/item-art";
import { MarketFiltersForm, marketUtc } from "~/components/market-filters";
import { MarketHistory, MarketHistoryPrice } from "~/components/market-history";
import { MarketListingPrice } from "~/components/market-listing-price";
import { MarketModValues } from "~/components/market-mod-values";
import { RouteError } from "~/components/route-error";
import { dbContext } from "~/context";
import { getMarketData } from "~/db/queries/market.queries";
import { forbiddenJewelGroup } from "~/lib/forbidden-jewels";
import { marketItemArtUrl } from "~/lib/item-presentation";
import { marketListingPrices, marketMostListedPrice } from "~/lib/market-listing-prices";
import { marketNumber as number } from "~/lib/market-number";
import type { MarketPriceRates } from "~/lib/market-price-currencies";
import { marketSignatureLabel } from "~/lib/mod-pools";
import { marketLink, parseMarketFilters } from "~/schemas/market";
import type { Route } from "./+types/item";

export function loader({ request, context, params }: Route.LoaderArgs) {
    return getMarketData(
        context.get(dbContext),
        parseMarketFilters(request, { item: params.item }),
        "history",
    );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return <RouteError error={error} />;
}

type HistoryRow = Awaited<ReturnType<typeof getMarketData>>["history"][number];
type VariantRow = Awaited<ReturnType<typeof getMarketData>>["variants"][number];

/** Up to this many variants show as links; more list as a searchable, grouped table. */
const SHOWN_VARIANTS = 20;

/** Uniques split by linked sockets as poe.ninja does: 5L, 6L and everything under 5 links. */
function linksLabel(links: number) {
    return links ? `${links}L` : "0–4L";
}

/** `linkSplit`: the variant's market also lists its link counts, so a merged variant says so. */
function variantLabel(variant: VariantRow, linkSplit: boolean) {
    const parts = [
        marketSignatureLabel(variant),
        variant.identified ? "" : "Unidentified",
        variant.corrupted ? "Corrupted" : "",
        variant.links !== null ? linksLabel(variant.links) : linkSplit ? "Any links" : "",
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Standard";
}

/** The variant table's group: a Forbidden jewel's class and ascendancy, else its state. */
function variantGroup(variant: VariantRow) {
    return (
        forbiddenJewelGroup(variant) ??
        [variant.identified ? "Identified" : "Unidentified", variant.corrupted ? "Corrupted" : ""]
            .filter(Boolean)
            .join(" · ")
    );
}

type Prices = { chaosRates: Record<string, number>; rates: MarketPriceRates };

function VariantPrice({
    variant,
    prices,
    game,
}: {
    variant: VariantRow;
    prices: Prices;
    game: "poe1" | "poe2";
}) {
    const price = marketMostListedPrice(marketListingPrices(variant.prices, prices.chaosRates));
    return price ? <MarketListingPrice price={price} rates={prices.rates} game={game} /> : null;
}

const variantColumn = dataTableColumns<VariantRow>();

/** Many variants list as a searchable table, grouped by class and ascendancy or state. */
function VariantTable({
    variants,
    label,
    link,
    isCurrent,
    prices,
    game,
}: {
    variants: VariantRow[];
    label: (variant: VariantRow) => string;
    link: (variant: VariantRow) => string;
    isCurrent: (variant: VariantRow) => boolean;
    prices: Prices;
    game: "poe1" | "poe2";
}) {
    const columns = useMemo(() => {
        const count = { sortDescFirst: true, meta: { filter: "range" } } as const;
        return variantColumn.columns([
            variantColumn.accessor(variantGroup, {
                id: "group",
                header: "Group",
                meta: { filter: "text", className: "whitespace-nowrap text-muted-foreground" },
            }),
            variantColumn.accessor(label, {
                id: "variant",
                header: "Variant",
                meta: { filter: "text" },
                cell: ({ getValue, row: { original: variant } }) => (
                    <Link
                        to={link(variant)}
                        aria-current={isCurrent(variant) ? "page" : undefined}
                        className={`text-primary hover:underline ${isCurrent(variant) ? "font-semibold" : ""}`}
                    >
                        {getValue()}
                    </Link>
                ),
            }),
            variantColumn.accessor(
                (variant) =>
                    marketMostListedPrice(marketListingPrices(variant.prices, prices.chaosRates))
                        ?.chaos,
                {
                    id: "price",
                    header: "Median ask",
                    ...count,
                    sortUndefined: "last",
                    cell: ({ row: { original: variant } }) => (
                        <VariantPrice variant={variant} prices={prices} game={game} />
                    ),
                },
            ),
            variantColumn.accessor("listingCount", {
                header: "Listings",
                ...count,
                cell: ({ getValue }) => number(getValue()),
            }),
            variantColumn.accessor("periodSales", {
                header: "Likely sales",
                ...count,
                cell: ({ getValue }) => number(getValue()),
            }),
        ]);
    }, [label, link, isCurrent, prices, game]);
    const rows = useMemo(
        () =>
            // Stable: within a group, variants keep their best-selling-first order.
            [...variants].sort((a, b) => variantGroup(a).localeCompare(variantGroup(b))),
        [variants],
    );
    return (
        <DataTable
            label="Item variants"
            data={rows}
            columns={columns}
            getRowId={link}
            search
            className="text-sm"
        />
    );
}

function sameMarket(a: VariantRow, b: VariantRow) {
    return (
        a.itemKey === b.itemKey &&
        a.identified === b.identified &&
        a.corrupted === b.corrupted &&
        a.signatureKind === b.signatureKind &&
        a.signatureValue === b.signatureValue
    );
}

const column = dataTableColumns<HistoryRow>();

function HourlyTable({ rows, game }: { rows: HistoryRow[]; game: "poe1" | "poe2" }) {
    const columns = useMemo(() => {
        const price = (value: number | undefined, row: HistoryRow) => (
            <MarketHistoryPrice value={value} rates={row.priceRates} game={game} />
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
                cell: ({ getValue, row }) => price(getValue(), row.original),
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
                cell: ({ getValue, row }) => price(getValue(), row.original),
            }),
            column.accessor("pendingCount", {
                header: "Pending",
                ...count,
                cell: ({ getValue }) => number(getValue()),
            }),
        ]);
    }, [game]);
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
    const { filters, seasons, history, variants, modValues, chaosRates, priceRates } = loaderData;
    const selected = history.at(-1);
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
    const prices = useMemo(() => ({ chaosRates, rates: priceRates }), [chaosRates, priceRates]);
    const isCurrent = useCallback(
        (variant: VariantRow) =>
            variant.itemKey === filters.item &&
            String(variant.identified) === filters.identified &&
            String(variant.corrupted) === filters.corrupted &&
            variant.signatureKind === filters.kind &&
            variant.signatureValue === filters.value &&
            (variant.links === null ? undefined : String(variant.links)) === filters.links,
        [filters],
    );
    const label = useCallback(
        (variant: VariantRow) =>
            variantLabel(
                variant,
                variants.some((other) => other.links !== null && sameMarket(other, variant)),
            ),
        [variants],
    );
    const link = useCallback((variant: VariantRow) => marketLink(filters, variant), [filters]);
    const variantLink = (variant: VariantRow) => (
        <li key={link(variant)}>
            <Link
                to={link(variant)}
                aria-current={isCurrent(variant) ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${isCurrent(variant) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
            >
                {label(variant)}
                <span className="text-xs text-muted-foreground">
                    {variant.prices ? (
                        <>
                            <VariantPrice variant={variant} prices={prices} game={game} />
                            {" · "}
                        </>
                    ) : null}
                    {number(variant.periodSales)} sales
                </span>
            </Link>
        </li>
    );
    const links = filters.links === undefined ? null : Number(filters.links);
    const otherVariants = variants.some((variant) => !isCurrent(variant));
    const itemName =
        variants.find((variant) => variant.itemKey === filters.item)?.name || filters.item;
    const periodSales = history.reduce((sum, row) => sum + row.likelySales, 0);
    return (
        <>
            <MarketFiltersForm filters={filters} seasons={seasons} />
            {!selected ? (
                <Link to={marketLink(filters)} className="text-sm text-primary">
                    ← Back to markets
                </Link>
            ) : null}
            {otherVariants ? (
                <nav
                    aria-label="Item variants"
                    className="space-y-2 rounded-xl border border-border bg-card p-4"
                >
                    <h2 className="text-sm font-semibold">
                        Variants of {itemName}{" "}
                        <span className="font-normal text-muted-foreground">
                            ({variants.length})
                        </span>
                    </h2>
                    {variants.length > SHOWN_VARIANTS ? (
                        <VariantTable
                            variants={variants}
                            label={label}
                            link={link}
                            isCurrent={isCurrent}
                            prices={prices}
                            game={game}
                        />
                    ) : (
                        <ul className="flex flex-wrap gap-2 text-sm">
                            {variants.map(variantLink)}
                        </ul>
                    )}
                </nav>
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
                                {marketSignatureLabel(selected)
                                    ? ` · ${marketSignatureLabel(selected)}`
                                    : ""}
                                {links !== null ? ` · ${linksLabel(links)}` : ""}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-semibold tabular-nums">
                                {number(periodSales)}
                            </p>
                            <p className="text-sm text-muted-foreground">likely sales in period</p>
                        </div>
                    </div>
                    <MarketHistory
                        points={history}
                        game={game}
                        summary="Hourly observations and inferred sale prices (latest 72 hours with data)"
                    >
                        <HourlyTable rows={history.slice(-72).reverse()} game={game} />
                    </MarketHistory>
                </section>
            ) : filters.item ? (
                <p role="status">No observations for this variant in the selected period.</p>
            ) : null}
            {modValues?.mods.length ? (
                <MarketModValues filters={filters} values={modValues} game={game} />
            ) : null}
        </>
    );
}
