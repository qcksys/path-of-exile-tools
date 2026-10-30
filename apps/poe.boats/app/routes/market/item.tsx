import {
    MAP_DELIRIUM_BANDS,
    MAP_DELIRIUM_LABELS,
    MAP_INFLUENCE_LABELS,
    MAP_INFLUENCES,
    MAP_MOD_BANDS,
    MAP_MOD_LABELS,
    MAP_QUANTITY_BANDS,
    MAP_QUANTITY_LABELS,
    mapVariantValues,
    parseMapVariantValue,
} from "@poe-tools/market";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, type ShouldRevalidateFunctionArgs, useSearchParams } from "react-router";
import { DataTable, dataTableColumns } from "~/components/data-table";
import { ItemArt } from "~/components/item-art";
import { MarketFiltersForm, marketUtc } from "~/components/market-filters";
import { FlagToggle } from "~/components/market-gem-filters";
import { MarketHistory, MarketHistoryPrice } from "~/components/market-history";
import { MarketListingPrice } from "~/components/market-listing-price";
import { MarketMapFilters } from "~/components/market-map-filters";
import { MarketModValues } from "~/components/market-mod-values";
import { RouteError } from "~/components/route-error";
import { dbContext } from "~/context";
import { getMarketData } from "~/db/queries/market.queries";
import { forbiddenJewelGroup } from "~/lib/forbidden-jewels";
import { marketItemArtUrl } from "~/lib/item-presentation";
import { marketListingPrices, marketMostListedPrice } from "~/lib/market-listing-prices";
import { marketNumber as number } from "~/lib/market-number";
import type { MarketPriceRates } from "~/lib/market-price-currencies";
import {
    MARKET_ITEM_VIEW_PARAMS,
    type MarketFilters,
    marketItemViewFilters,
    marketLink,
    parseMarketFilters,
} from "~/schemas/market";
import type { Route } from "./+types/item";

export const meta: Route.MetaFunction = ({ params }) => [
    { title: `${params.item} · Season market · POE.BOATS` },
];

export function loader({ request, context, params }: Route.LoaderArgs) {
    return getMarketData(
        context.get(dbContext),
        parseMarketFilters(request, { item: params.item }),
        "history",
    );
}

/** The variant table's filters narrow rows already loaded, so they skip the loader. */
export function shouldRevalidate({
    currentUrl,
    nextUrl,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
    const withoutView = (url: URL) => {
        const params = new URLSearchParams(url.search);
        for (const param of MARKET_ITEM_VIEW_PARAMS) params.delete(param);
        return `${url.pathname}?${params}`;
    };
    return withoutView(currentUrl) === withoutView(nextUrl) ? false : defaultShouldRevalidate;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return <RouteError error={error} />;
}

type HistoryRow = Awaited<ReturnType<typeof getMarketData>>["history"][number];
type VariantRow = Awaited<ReturnType<typeof getMarketData>>["variants"][number];

/** Up to this many variants show as links; more list as a searchable, grouped table. */
const SHOWN_VARIANTS = 20;
/** The variant table's best sellers, shown until "Show all" is pressed. */
const SHOWN_TABLE_VARIANTS = 10;

/** Uniques split by linked sockets as poe.ninja does: 5L, 6L and everything under 5 links. */
function linksLabel(links: number) {
    return links ? `${links}L` : "0–4L";
}

/** `linkSplit`: the variant's market also lists its link counts, so a merged variant says so. */
function variantLabel(variant: VariantRow, linkSplit: boolean) {
    const parts = [
        variant.signatureValue,
        // A map's signature already says it is unidentified.
        variant.identified || variant.signatureKind === "map" ? "" : "Unidentified",
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

type VariantLinks = {
    label: (variant: VariantRow) => string;
    link: (variant: VariantRow) => string;
    isCurrent: (variant: VariantRow) => boolean;
};

function VariantLink({
    variant,
    links: { label, link, isCurrent },
    children,
}: {
    variant: VariantRow;
    links: VariantLinks;
    children: string;
}) {
    return (
        <Link
            to={link(variant)}
            aria-label={label(variant)}
            aria-current={isCurrent(variant) ? "page" : undefined}
            className={`text-primary hover:underline ${isCurrent(variant) ? "font-semibold" : ""}`}
        >
            {children}
        </Link>
    );
}

/** Variants arrive best selling first, which is what "top" means until a column is sorted. */
function VariantTable({
    variants,
    identity,
    links,
    prices,
    game,
    search = false,
}: {
    variants: VariantRow[];
    identity: ReturnType<typeof variantColumn.columns>;
    links: VariantLinks;
    prices: Prices;
    game: "poe1" | "poe2";
    search?: boolean;
}) {
    const columns = useMemo(() => {
        const count = { sortDescFirst: true, meta: { filter: "range" } } as const;
        return [
            ...identity,
            ...variantColumn.columns([
                variantColumn.accessor(
                    (variant) =>
                        marketMostListedPrice(
                            marketListingPrices(variant.prices, prices.chaosRates),
                        )?.chaos,
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
            ]),
        ];
    }, [identity, prices, game]);
    return (
        <DataTable
            label="Item variants"
            data={variants}
            columns={columns}
            getRowId={links.link}
            search={search}
            maxRows={SHOWN_TABLE_VARIANTS}
            keepRow={links.isCurrent}
            className="text-sm"
        />
    );
}

/** Many variants list as a searchable table, with their class and ascendancy or state. */
function GroupedVariantTable({
    variants,
    links,
    prices,
    game,
}: {
    variants: VariantRow[];
    links: VariantLinks;
    prices: Prices;
    game: "poe1" | "poe2";
}) {
    const identity = useMemo(
        () =>
            variantColumn.columns([
                variantColumn.accessor(variantGroup, {
                    id: "group",
                    header: "Group",
                    meta: { filter: "text", className: "whitespace-nowrap text-muted-foreground" },
                }),
                variantColumn.accessor(links.label, {
                    id: "variant",
                    header: "Variant",
                    meta: { filter: "text" },
                    cell: ({ getValue, row: { original: variant } }) => (
                        <VariantLink variant={variant} links={links}>
                            {getValue()}
                        </VariantLink>
                    ),
                }),
            ]),
        [links],
    );
    return (
        <VariantTable
            variants={variants}
            identity={identity}
            links={links}
            prices={prices}
            game={game}
            search
        />
    );
}

type MapFields = NonNullable<ReturnType<typeof parseMapVariantValue>>;

const mapFields = (variant: VariantRow) => parseMapVariantValue(variant.signatureValue);

/** A column holding a band's position, so it sorts in band order rather than by its label. */
function mapBandColumn<Band extends string>(
    header: string,
    bands: readonly Band[],
    labels: readonly string[],
    band: (fields: MapFields) => Band | undefined,
) {
    return variantColumn.accessor(
        (variant) => {
            const fields = mapFields(variant);
            const value = fields && band(fields);
            return value ? bands.indexOf(value) : undefined;
        },
        {
            id: header,
            header,
            enableColumnFilter: false,
            sortDescFirst: false,
            sortUndefined: "last",
            meta: { className: "whitespace-nowrap" },
            cell: ({ getValue }) => {
                const index = getValue();
                return index === undefined ? "—" : labels[index];
            },
        },
    );
}

/** Whether the variant table's filters, the same ones the map list has, allow a variant. */
function mapVariantMatcher(filters: MarketFilters) {
    const values = mapVariantValues(filters);
    const allowed = values && new Set(values);
    const { identification, corruption = "all" } = filters;
    return (variant: VariantRow) =>
        (!allowed || allowed.has(variant.signatureValue)) &&
        (identification === "all" || String(variant.identified) === identification) &&
        (corruption === "all" || String(variant.corrupted) === corruption);
}

/** A map's variants, one column per part of their signature, narrowed by toggles. */
function MapVariantTable({
    variants,
    filters,
    onFilter,
    links,
    prices,
    game,
}: {
    variants: VariantRow[];
    filters: MarketFilters;
    onFilter: (name: string, value: string) => void;
    links: VariantLinks;
    prices: Prices;
    game: "poe1" | "poe2";
}) {
    const identity = useMemo(
        () =>
            variantColumn.columns([
                variantColumn.accessor(
                    (variant) => {
                        const mods = mapFields(variant)?.mods;
                        return mods ? MAP_MOD_BANDS.indexOf(mods) : MAP_MOD_BANDS.length;
                    },
                    {
                        id: "Mods",
                        header: "Mods",
                        enableColumnFilter: false,
                        sortDescFirst: false,
                        meta: { className: "whitespace-nowrap" },
                        cell: ({ getValue, row: { original: variant } }) => (
                            <VariantLink variant={variant} links={links}>
                                {MAP_MOD_LABELS[getValue()] ?? "Unidentified"}
                            </VariantLink>
                        ),
                    },
                ),
                mapBandColumn(
                    "Quantity",
                    MAP_QUANTITY_BANDS,
                    MAP_QUANTITY_LABELS,
                    ({ quantity }) => quantity,
                ),
                mapBandColumn(
                    "Delirium",
                    MAP_DELIRIUM_BANDS,
                    MAP_DELIRIUM_LABELS,
                    ({ delirium }) => delirium,
                ),
                mapBandColumn(
                    "Influence",
                    MAP_INFLUENCES,
                    MAP_INFLUENCE_LABELS,
                    ({ influence }) => influence,
                ),
                variantColumn.accessor((variant) => Number(variant.corrupted), {
                    id: "Corrupted",
                    header: "Corrupted",
                    enableColumnFilter: false,
                    sortDescFirst: true,
                    cell: ({ getValue }) => (getValue() ? "Corrupted" : "—"),
                }),
            ]),
        [links],
    );
    const shown = useMemo(() => {
        const fields = variants.flatMap((variant) => mapFields(variant) ?? []);
        return {
            mapMods: new Set(fields.flatMap(({ mods }) => mods ?? [])),
            mapQuantity: new Set(fields.flatMap(({ quantity }) => quantity ?? [])),
            mapDelirium: new Set(fields.map(({ delirium }) => delirium)),
            mapInfluence: new Set(fields.map(({ influence }) => influence ?? "none")),
        };
    }, [variants]);
    const rows = useMemo(() => variants.filter(mapVariantMatcher(filters)), [variants, filters]);
    return (
        <>
            <MarketMapFilters filters={filters} shown={shown} onChange={onFilter}>
                <FlagToggle
                    name="identification"
                    legend="Identification"
                    label="Identified"
                    value={filters.identification}
                    onChange={(value) => onFilter("identification", value)}
                />
                <FlagToggle
                    name="corruption"
                    legend="Corruption"
                    label="Corrupted"
                    value={filters.corruption ?? "all"}
                    onChange={(value) => onFilter("corruption", value)}
                />
            </MarketMapFilters>
            {rows.length < variants.length ? (
                <p role="status" className="text-xs text-muted-foreground">
                    {rows.length} of {variants.length} variants match these filters
                </p>
            ) : null}
            <VariantTable
                variants={rows}
                identity={identity}
                links={links}
                prices={prices}
                game={game}
            />
        </>
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
    const { seasons, history, variants, modValues, chaosRates, priceRates } = loaderData;
    const [searchParams, setSearchParams] = useSearchParams();
    const filters = useMemo(
        () => ({ ...loaderData.filters, ...marketItemViewFilters(searchParams) }),
        [loaderData.filters, searchParams],
    );
    // setSearchParams reads the rendered params, which would lose a toggle made before the last
    // one's navigation lands.
    const latestParams = useRef(searchParams);
    useEffect(() => {
        latestParams.current = searchParams;
    }, [searchParams]);
    const setViewFilter = useCallback(
        (name: string, value: string) => {
            const next = new URLSearchParams(latestParams.current);
            next.delete("page");
            if (value && value !== "all") next.set(name, value);
            else next.delete(name);
            latestParams.current = next;
            setSearchParams(next, { replace: true, preventScrollReset: true });
        },
        [setSearchParams],
    );
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
    const links = useMemo(() => ({ label, link, isCurrent }), [label, link, isCurrent]);
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
    const selectedLinks = filters.links === undefined ? null : Number(filters.links);
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
                        variants.every(mapFields) ? (
                            <MapVariantTable
                                variants={variants}
                                filters={filters}
                                onFilter={setViewFilter}
                                links={links}
                                prices={prices}
                                game={game}
                            />
                        ) : (
                            <GroupedVariantTable
                                variants={variants}
                                links={links}
                                prices={prices}
                                game={game}
                            />
                        )
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
                                {/* A map's signature already says it is unidentified. */}
                                {[
                                    selected.identified
                                        ? "Identified"
                                        : selected.signatureKind === "map"
                                          ? ""
                                          : "Unidentified",
                                    selected.corrupted ? "Corrupted" : "",
                                    selected.signatureValue,
                                    selectedLinks !== null ? linksLabel(selectedLinks) : "",
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
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
            {modValues?.length ? (
                <MarketModValues filters={filters} values={modValues} game={game} />
            ) : null}
        </>
    );
}
