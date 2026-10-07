import { Form, Link, useNavigation } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { MarketPriceChart } from "~/components/market-price-chart";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { dbContext } from "~/context";
import { getMarketData } from "~/db/queries/market.queries";
import { marketNumber as number } from "~/lib/market-number";
import { marketFiltersSchema, marketLink } from "~/schemas/market";
import type { Route } from "./+types/market";

export const meta: Route.MetaFunction = () => [{ title: "Season market · POE.BOATS" }];

export async function loader({ request, context }: Route.LoaderArgs) {
    const parsed = marketFiltersSchema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) throw new Response("Invalid market filters", { status: 400 });
    return getMarketData(context.get(dbContext), parsed.data);
}

const fieldClass = "rounded-md border border-border bg-background px-3 py-2 text-sm";
const cellClass = "px-4 py-3 text-left";
const utc = (hour: number) =>
    `${new Date(hour * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export default function Market({ loaderData }: Route.ComponentProps) {
    const { filters, seasons, season, rows, history, hasMore } = loaderData;
    const navigation = useNavigation();
    const selected = history.at(-1);
    const currencies = [...new Set(history.flatMap((row) => Object.keys(row.prices ?? {})))].sort();
    const periodSales = history.reduce((sum, row) => sum + row.likelySales, 0);
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section="Season market" sectionBadge="Estimates" />
            <main className="container mx-auto flex-1 space-y-8 px-4 py-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="mb-2 text-sm text-muted-foreground">PUBLIC STASH DATA</p>
                        <h1 className="font-heading text-3xl font-bold tracking-tight">
                            Prices &amp; likely sales
                        </h1>
                        <p className="mt-2 max-w-2xl text-muted-foreground">
                            Compare asking prices and inferred sales by season and item variant.
                        </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {season?.latestHour
                            ? `Data through ${utc(Number(season.latestHour))}`
                            : "Awaiting season data"}
                    </p>
                </div>
                <Form
                    method="get"
                    className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
                    key={`${filters.realm}:${filters.league}:${filters.days}:${filters.q}`}
                >
                    <Label className="grid gap-1 text-sm">
                        Realm
                        <FormSelect
                            name="realm"
                            defaultValue={filters.realm}
                            className={fieldClass}
                        >
                            <FormSelectItem value="pc">PoE 1 · PC</FormSelectItem>
                            <FormSelectItem value="poe2">PoE 2</FormSelectItem>
                            <FormSelectItem value="xbox">Xbox</FormSelectItem>
                            <FormSelectItem value="sony">PlayStation</FormSelectItem>
                        </FormSelect>
                    </Label>
                    <Label className="grid gap-1 text-sm">
                        Season
                        <FormSelect
                            name="league"
                            defaultValue={filters.league}
                            className={fieldClass}
                        >
                            <FormSelectItem value="">Latest available</FormSelectItem>
                            {seasons.map((entry) => (
                                <FormSelectItem key={entry.league} value={entry.league}>
                                    {entry.league}
                                </FormSelectItem>
                            ))}
                        </FormSelect>
                    </Label>
                    <Label className="grid gap-1 text-sm">
                        Period
                        <FormSelect name="days" defaultValue={filters.days} className={fieldClass}>
                            <FormSelectItem value="7">Last 7 days</FormSelectItem>
                            <FormSelectItem value="30">Last 30 days</FormSelectItem>
                            <FormSelectItem value="90">Last 90 days</FormSelectItem>
                        </FormSelect>
                    </Label>
                    <Label className="grid min-w-48 flex-1 gap-1 text-sm">
                        Item or variant
                        <Input
                            type="search"
                            name="q"
                            defaultValue={filters.q}
                            placeholder="Headhunter, Forbidden Flame…"
                            className={fieldClass}
                            maxLength={100}
                        />
                    </Label>
                    <Button
                        variant="ghost"
                        type="submit"
                        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
                        disabled={navigation.state !== "idle"}
                    >
                        {navigation.state === "idle" ? "Apply filters" : "Loading…"}
                    </Button>
                </Form>
                <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                    Likely sales are estimates, not confirmed trades. An item must disappear for at
                    least one hour of continuous caught-up observation, have no matching relist by
                    the same seller, and be priced within 25% of the median from at least three
                    other recent sellers. Whole-stash withdrawals are excluded. Later relists can
                    retract estimates. Prices remain in their original currency.
                </div>
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
                                    All markets
                                </Link>
                                <h2 className="mt-2 text-2xl font-semibold">
                                    {selected.name || selected.itemKey}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    {selected.identified ? "Identified" : "Unidentified"}
                                    {selected.corrupted ? " · Corrupted" : ""}
                                    {selected.foilVariation >= 0
                                        ? ` · Foil ${selected.foilVariation}`
                                        : ""}
                                    {selected.signatureKind ? ` · ${selected.signatureValue}` : ""}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-3xl font-semibold tabular-nums">
                                    {number(periodSales)}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    likely sales in period
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Asking price currency</span>
                            {currencies.map((currency) => (
                                <Link
                                    key={currency}
                                    to={marketLink({ ...filters, currency }, selected)}
                                    aria-current={
                                        currency === filters.currency ? "true" : undefined
                                    }
                                    className={`rounded-full border px-3 py-1 ${currency === filters.currency ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                                >
                                    {currency}
                                </Link>
                            ))}
                        </div>
                        <MarketPriceChart points={history} currency={filters.currency} />
                        <details>
                            <summary className="cursor-pointer text-sm">
                                Hourly observations and inferred sale prices (latest 72 hours with
                                data)
                            </summary>
                            <div className="mt-3 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border">
                                            <th className={cellClass}>Hour (UTC)</th>
                                            <th className={cellClass}>Median ask</th>
                                            <th className={cellClass}>Listings observed</th>
                                            <th className={cellClass}>Likely sales</th>
                                            <th className={cellClass}>
                                                Median last ask of likely sales
                                            </th>
                                            <th className={cellClass}>Pending</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history
                                            .slice(-72)
                                            .reverse()
                                            .map((row) => (
                                                <tr
                                                    key={row.hour}
                                                    className="border-b border-border/60"
                                                >
                                                    <td className={cellClass}>{utc(row.hour)}</td>
                                                    <td className={cellClass}>
                                                        {row.prices?.[filters.currency]
                                                            ? `${number(row.prices[filters.currency]!.median)} ${filters.currency}`
                                                            : "—"}
                                                    </td>
                                                    <td className={cellClass}>
                                                        {number(row.listingCount)}
                                                    </td>
                                                    <td className={cellClass}>
                                                        {number(row.likelySales)}
                                                    </td>
                                                    <td className={cellClass}>
                                                        {row.salesPrices?.[filters.currency]
                                                            ? `${number(row.salesPrices[filters.currency]!.median)} ${filters.currency}`
                                                            : "—"}
                                                    </td>
                                                    <td className={cellClass}>
                                                        {number(row.pendingCount)}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    </section>
                ) : filters.item ? (
                    <p role="status">No observations for this variant in the selected period.</p>
                ) : null}
                <section
                    className="overflow-hidden rounded-xl border border-border bg-card"
                    aria-label="Item markets"
                >
                    <div className="border-b border-border px-5 py-4">
                        <h2 className="text-lg font-semibold">
                            {filters.league || "Season"} markets
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Latest observed asking prices per variant; sales cover the selected
                            period ending at the latest ingested hour. Listing counts are
                            observations, not total market supply.
                        </p>
                    </div>
                    {rows.length ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-muted-foreground">
                                    <tr>
                                        <th className={cellClass}>Item / variant</th>
                                        <th className={cellClass}>Median asking price</th>
                                        <th className={cellClass}>Listings / sellers</th>
                                        <th className={cellClass}>Likely sales</th>
                                        <th className={cellClass}>Pending</th>
                                        <th className={cellClass}>Last observed</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr
                                            key={marketLink(filters, row)}
                                            className="border-t border-border hover:bg-muted/30"
                                        >
                                            <td className={cellClass}>
                                                <Link
                                                    to={marketLink(filters, row)}
                                                    className="font-medium text-primary hover:underline"
                                                >
                                                    {row.name || row.itemKey}
                                                </Link>
                                                <p className="mt-1 max-w-md break-words text-xs text-muted-foreground">
                                                    {row.identified ? "Identified" : "Unidentified"}
                                                    {row.corrupted ? " · Corrupted" : ""}
                                                    {row.foilVariation >= 0
                                                        ? ` · Foil ${row.foilVariation}`
                                                        : ""}
                                                    {row.signatureKind
                                                        ? ` · ${row.signatureValue}`
                                                        : ""}
                                                </p>
                                            </td>
                                            <td className={cellClass}>
                                                {Object.entries(row.prices ?? {}).length
                                                    ? Object.entries(row.prices ?? {}).map(
                                                          ([currency, price]) => (
                                                              <p
                                                                  key={currency}
                                                                  className="tabular-nums"
                                                              >
                                                                  {number(price.median)} {currency}
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
                                            <td
                                                className={`${cellClass} font-semibold tabular-nums`}
                                            >
                                                {number(row.periodSales)}
                                            </td>
                                            <td className={`${cellClass} tabular-nums`}>
                                                {number(row.periodPending)}
                                            </td>
                                            <td
                                                className={`${cellClass} whitespace-nowrap text-muted-foreground`}
                                            >
                                                {utc(row.hour)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="px-6 py-16 text-center">
                            <h3 className="text-lg font-medium">
                                {seasons.length
                                    ? "No markets match these filters"
                                    : "No season data yet"}
                            </h3>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {seasons.length
                                    ? "Try a different season or search term."
                                    : "Markets appear after the first completed hour is ingested."}
                            </p>
                        </div>
                    )}
                    <nav
                        aria-label="Market pages"
                        className="flex items-center justify-between border-t border-border px-5 py-3 text-sm"
                    >
                        <span>Page {filters.page}</span>
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
            </main>
            <AppFooter />
        </div>
    );
}
