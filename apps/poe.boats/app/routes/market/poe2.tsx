import { useCallback, useEffect, useRef, useState } from "react";
import { Form, redirect, useNavigation, useSubmit } from "react-router";
import { ExchangeDisplayPicker } from "~/components/market-exchange";
import { MarketExchangeTable } from "~/components/market-exchange-table";
import { marketUtc } from "~/components/market-filters";
import { RouteError } from "~/components/route-error";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { dbContext } from "~/context";
import { getPoe2MarketExchange } from "~/db/queries/market.queries";
import { POE2_EXCHANGE_CATEGORIES } from "~/lib/market-categories";
import {
    type Poe2MarketFilters,
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

const APPLY_DELAY_MS = 400;

function Poe2MarketFiltersForm({
    filters,
    seasons,
}: {
    filters: Poe2MarketFilters;
    seasons: { league: string }[];
}) {
    const navigation = useNavigation();
    const submit = useSubmit();
    const form = useRef<HTMLFormElement>(null);
    const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
    const apply = () => {
        clearTimeout(pending.current);
        pending.current = setTimeout(() => {
            if (form.current) submit(form.current);
        }, APPLY_DELAY_MS);
    };
    useEffect(() => () => clearTimeout(pending.current), []);
    // The search box keeps what the user is typing while their earlier text loads.
    const search = useRef<HTMLInputElement>(null);
    const [q, setQ] = useState(filters.q);
    useEffect(() => {
        if (document.activeElement !== search.current) setQ(filters.q);
    }, [filters.q]);
    return (
        <Form
            ref={form}
            method="get"
            action={poe2MarketLink(filters).split("?")[0]}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
        >
            <Input type="hidden" name="days" value={filters.days} />
            <Label className="grid gap-1.5 text-xs text-muted-foreground">
                Season
                <FormSelect
                    key={filters.league}
                    name="league"
                    defaultValue={filters.league}
                    onValueChange={apply}
                    className="min-w-32 bg-background text-sm text-foreground"
                >
                    {[...new Set([filters.league, ...seasons.map(({ league }) => league)])].map(
                        (league) => (
                            <FormSelectItem key={league} value={league}>
                                {league || "Latest available"}
                            </FormSelectItem>
                        ),
                    )}
                </FormSelect>
            </Label>
            <Label className="grid min-w-48 flex-1 gap-1.5 text-xs text-muted-foreground">
                Search items
                <Input
                    ref={search}
                    type="search"
                    name="q"
                    value={q}
                    onChange={(event) => {
                        setQ(event.target.value);
                        apply();
                    }}
                    placeholder="Item name…"
                    maxLength={100}
                    className="bg-background text-foreground"
                />
            </Label>
            <p role="status" className="text-xs text-muted-foreground">
                {navigation.state === "idle" ? null : "Loading…"}
            </p>
        </Form>
    );
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
            <Poe2MarketFiltersForm filters={filters} seasons={seasons} />
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
