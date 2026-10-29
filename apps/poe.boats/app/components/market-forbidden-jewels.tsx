import { Link } from "react-router";
import { MarketListingPrice, MarketListingPrices } from "~/components/market-listing-price";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import type { MarketPriceSummary } from "~/db/schema/stash.unique-hourly";
import { type ForbiddenJewelPair, forbiddenJewelClasses } from "~/lib/forbidden-jewels";
import { marketListingPrices, marketMostListedPrice } from "~/lib/market-listing-prices";
import { marketNumber as number } from "~/lib/market-number";
import type { MarketPriceRates } from "~/lib/market-price-currencies";
import { type MarketFilters, marketLink } from "~/schemas/market";

type Game = "poe1" | "poe2";

type ForbiddenRow = NonNullable<Parameters<typeof marketLink>[1]> & {
    name: string | null;
    prices: Record<string, MarketPriceSummary> | null;
    periodSales: number;
};

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
            <p className="text-xs text-muted-foreground">
                {number(row.periodSales)} sales in {filters.days} days
            </p>
        </Link>
    );
}

/**
 * Forbidden Flame and Flesh paired by notable, grouped by class and ascendancy, with each pair's
 * combined price: both jewels must allocate the same notable.
 */
export function MarketForbiddenJewels({
    rows,
    filters,
    game,
    prices,
}: {
    rows: ForbiddenRow[];
    filters: MarketFilters;
    game: Game;
    prices: Prices;
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
                    {ascendancies.map(({ ascendancy, pairs }) => {
                        const sorted = pairs
                            .map((pair) => ({ pair, value: pairValue(pair, prices.chaosRates) }))
                            .sort(
                                (a, b) =>
                                    (b.value ?? Number.NEGATIVE_INFINITY) -
                                        (a.value ?? Number.NEGATIVE_INFINITY) ||
                                    a.pair.notable.localeCompare(b.pair.notable),
                            );
                        return (
                            <div key={ascendancy} className="border-b border-border last:border-0">
                                <h4 className="bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">
                                    {ascendancy}
                                </h4>
                                <Table aria-label={`${ascendancy} notables`} className="text-sm">
                                    <TableHeader className="text-xs text-muted-foreground">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead>Notable</TableHead>
                                            <TableHead>Forbidden Flame</TableHead>
                                            <TableHead>Forbidden Flesh</TableHead>
                                            <TableHead>Pair</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sorted.map(({ pair, value }) => (
                                            <TableRow
                                                key={`${pair.notable}|${pair.corrupted}`}
                                                className="align-top"
                                            >
                                                <TableCell className="font-medium">
                                                    {pair.notable}
                                                    {pair.corrupted ? (
                                                        <span className="block text-xs font-normal text-muted-foreground">
                                                            Corrupted
                                                        </span>
                                                    ) : null}
                                                </TableCell>
                                                <TableCell className="tabular-nums">
                                                    <JewelCell
                                                        row={pair.flame}
                                                        filters={filters}
                                                        game={game}
                                                        prices={prices}
                                                    />
                                                </TableCell>
                                                <TableCell className="tabular-nums">
                                                    <JewelCell
                                                        row={pair.flesh}
                                                        filters={filters}
                                                        game={game}
                                                        prices={prices}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-semibold tabular-nums">
                                                    {value === undefined ? (
                                                        <span className="text-xs font-normal text-muted-foreground">
                                                            —
                                                        </span>
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
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        );
                    })}
                </section>
            ))}
        </div>
    );
}
