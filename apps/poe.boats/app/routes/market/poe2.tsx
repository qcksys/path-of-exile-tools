import { useCallback } from "react";
import { redirect } from "react-router";
import { ExchangeDisplayPicker } from "~/components/market-exchange";
import { MarketExchangeTable } from "~/components/market-exchange-table";
import { marketUtc } from "~/components/market-filters";
import { MarketListForm } from "~/components/market-form";
import { RouteError } from "~/components/route-error";
import { dbContext } from "~/context";
import { getPoe2MarketExchange } from "~/db/queries/market.queries";
import { POE2_EXCHANGE_CATEGORIES } from "~/lib/market-categories";
import {
    parsePoe2MarketFilters,
    poe2ExchangeCategorySchema,
    poe2MarketExchangeLink,
    poe2MarketLink,
} from "~/schemas/market";
import type { Route } from "./+types/poe2";

export const meta: Route.MetaFunction = ({ params }) => {
    const category = poe2ExchangeCategorySchema.safeParse(params.category);
    return [
        {
            title: `${category.success ? `${POE2_EXCHANGE_CATEGORIES[category.data].label} · ` : ""}PoE 2 market · POE.BOATS`,
        },
    ];
};

export async function loader({ request, context, params }: Route.LoaderArgs) {
    if (params.category && !poe2ExchangeCategorySchema.safeParse(params.category).success)
        throw new Response("Unknown market category", { status: 404 });
    const filters = parsePoe2MarketFilters(request, { category: params.category });
    if (!params.category || new URL(request.url).searchParams.has("category"))
        return redirect(poe2MarketLink(filters), 308);
    return getPoe2MarketExchange(context.get(dbContext), filters);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return <RouteError error={error} />;
}

export default function Poe2MarketIndex({ loaderData }: Pick<Route.ComponentProps, "loaderData">) {
    const { filters, seasons, season, rows, unit, priceRates } = loaderData;
    const category = filters.category === "all" ? null : POE2_EXCHANGE_CATEGORIES[filters.category];
    const itemLink = useCallback(
        (itemId: string) => poe2MarketExchangeLink(filters, itemId),
        [filters],
    );
    return (
        <>
            <MarketListForm
                action={poe2MarketLink(filters).split("?")[0]!}
                hidden={{ days: filters.days }}
                league={filters.league}
                seasons={seasons}
                game="poe2"
                q={filters.q}
                placeholder="Item name…"
            />
            <section
                aria-label={category?.label ?? "All items"}
                className="overflow-hidden rounded-xl border border-border bg-card"
            >
                <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-4 py-3">
                    <div>
                        <h2 className="text-xl font-semibold">{category?.label ?? "All items"}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {filters.league || "Season"} · {rows.length} on the exchange
                        </p>
                    </div>
                    <div className="grid justify-items-end gap-1">
                        <p className="text-xs text-muted-foreground">
                            {season
                                ? `Data through ${marketUtc(season.latestHour)}`
                                : "Awaiting season data"}
                        </p>
                        <ExchangeDisplayPicker game="poe2" />
                    </div>
                </header>
                {rows.length ? (
                    <MarketExchangeTable
                        label={`${category?.label ?? "All items"} exchange`}
                        rows={rows}
                        game="poe2"
                        unit={unit}
                        rates={priceRates}
                        itemLink={itemLink}
                    />
                ) : (
                    <div role="status" className="px-4 py-6 text-center">
                        <h3 className="text-lg font-medium text-foreground">
                            {seasons.length ? "No exchange items match" : "No season data yet"}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {seasons.length
                                ? "Try another category, season or search term."
                                : "Items appear after the first completed exchange hour is ingested."}
                        </p>
                    </div>
                )}
            </section>
        </>
    );
}
