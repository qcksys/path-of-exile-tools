import { Link, redirect } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { ItemArt } from "~/components/item-art";
import { MarketFiltersForm, marketUtc } from "~/components/market-filters";
import { dbContext } from "~/context";
import { getMarketData } from "~/db/queries/market.queries";
import { marketItemArtUrl } from "~/lib/item-presentation";
import { MARKET_CATEGORIES, type MarketCategory } from "~/lib/market-categories";
import { marketNumber as number } from "~/lib/market-number";
import { marketLink, parseMarketFilters } from "~/schemas/market";
import type { Route } from "./+types/index";

export async function loader({ request, context }: Route.LoaderArgs) {
    const filters = parseMarketFilters(request);
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
    return getMarketData(context.get(dbContext), filters, "list");
}

const cellClass = "px-4 py-3 text-left";

export default function MarketIndex({ loaderData }: Pick<Route.ComponentProps, "loaderData">) {
    const { filters, seasons, season, rows, hasMore } = loaderData;
    const categories = Object.keys(MARKET_CATEGORIES) as MarketCategory[];
    const game = filters.realm === "poe2" ? "poe2" : "poe1";
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
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                                        <tr>
                                            <th className={cellClass}>Item / variant</th>
                                            <th className={cellClass}>Median asking price</th>
                                            <th className={cellClass}>Listings / sellers</th>
                                            <th className={cellClass}>Likely sales</th>
                                            <th className={cellClass}>Last observed</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entries.map((row) => (
                                            <tr
                                                key={marketLink(filters, row)}
                                                className="border-t border-border hover:bg-muted/30"
                                            >
                                                <td className={cellClass}>
                                                    <Link
                                                        to={marketLink(filters, row)}
                                                        className="flex items-center gap-3 font-medium text-primary hover:underline"
                                                    >
                                                        <ItemArt
                                                            src={marketItemArtUrl(
                                                                row.iconAsset,
                                                                game,
                                                            )}
                                                            name={row.name || row.baseType}
                                                            decorative
                                                        />
                                                        {row.name || row.itemKey}
                                                    </Link>
                                                    <p className="mt-1 max-w-md break-words text-xs text-muted-foreground">
                                                        {row.baseType} ·{" "}
                                                        {row.identified
                                                            ? "Identified"
                                                            : "Unidentified"}
                                                        {row.corrupted ? " · Corrupted" : ""}
                                                        {row.foilVariation >= 0
                                                            ? ` · Foil ${row.foilVariation}`
                                                            : ""}
                                                        {row.signatureKind
                                                            ? ` · ${row.signatureValue}`
                                                            : ""}
                                                    </p>
                                                </td>
                                                <td className={`${cellClass} tabular-nums`}>
                                                    {Object.entries(row.prices ?? {}).length
                                                        ? Object.entries(row.prices ?? {}).map(
                                                              ([currency, price]) => (
                                                                  <p
                                                                      key={currency}
                                                                      className={
                                                                          currency ===
                                                                          filters.currency
                                                                              ? "font-semibold"
                                                                              : "text-muted-foreground"
                                                                      }
                                                                  >
                                                                      {number(price.median)}{" "}
                                                                      <CurrencyLabel
                                                                          currency={currency}
                                                                          game={game}
                                                                      />
                                                                      <span className="ml-2 text-xs text-muted-foreground">
                                                                          n={price.count}
                                                                      </span>
                                                                  </p>
                                                              ),
                                                          )
                                                        : "Unpriced"}
                                                </td>
                                                <td className={`${cellClass} tabular-nums`}>
                                                    {number(row.listingCount)} /{" "}
                                                    {number(row.uniqueSellers)}
                                                </td>
                                                <td className={`${cellClass} tabular-nums`}>
                                                    <span className="font-semibold">
                                                        {number(row.periodSales)}
                                                    </span>
                                                    <p className="text-xs text-muted-foreground">
                                                        {number(row.periodPending)} pending
                                                    </p>
                                                </td>
                                                <td
                                                    className={`${cellClass} whitespace-nowrap text-xs text-muted-foreground`}
                                                >
                                                    {marketUtc(row.hour)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    );
                })}
                {!rows.length ? (
                    <div
                        role="status"
                        className="rounded-xl border border-border bg-card px-6 py-16 text-center"
                    >
                        <h3 className="text-lg font-medium">
                            {seasons.length
                                ? "No markets match these filters"
                                : "No season data yet"}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {seasons.length
                                ? "Try another category, season or search term."
                                : "Markets appear after the first completed hour is ingested."}
                        </p>
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
