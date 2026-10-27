import { Outlet, useParams, useSearchParams } from "react-router";
import { MarketCategoryNav } from "~/components/market-category-nav";
import { POE2_EXCHANGE_CATEGORIES, type Poe2ExchangeCategory } from "~/lib/market-categories";
import type { SiteHandle } from "~/routes/layouts/site";
import {
    POE2_MARKET_DEFAULT_CATEGORY,
    poe2MarketFiltersSchema,
    poe2MarketLink,
} from "~/schemas/market";
import type { Route } from "./+types/market-poe2";

export const meta: Route.MetaFunction = () => [{ title: "PoE 2 market · POE.BOATS" }];

export const handle = { section: "Season market", sectionBadge: "PoE 2" } satisfies SiteHandle;

export default function Poe2Market() {
    const [searchParams] = useSearchParams();
    const { category } = useParams();
    const parsed = poe2MarketFiltersSchema.safeParse({
        ...Object.fromEntries(searchParams),
        ...(category ? { category } : {}),
    });
    const filters = parsed.success ? parsed.data : poe2MarketFiltersSchema.parse({});
    const current = filters.category === "all" ? POE2_MARKET_DEFAULT_CATEGORY : filters.category;
    return (
        <main className="container mx-auto flex-1 space-y-6 px-4 py-8">
            <header>
                <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground">
                    CURRENCY EXCHANGE DATA
                </p>
                <h1 className="font-heading text-3xl font-bold tracking-tight">
                    Path of Exile 2 exchange prices
                </h1>
                <p className="mt-2 text-muted-foreground">
                    Browse currency exchange items by category, valued in exalted orbs.
                </p>
            </header>
            <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
                <MarketCategoryNav
                    categories={POE2_EXCHANGE_CATEGORIES}
                    current={current}
                    link={(category: Poe2ExchangeCategory) =>
                        poe2MarketLink({ ...filters, category })
                    }
                />
                <div className="min-w-0 space-y-5">
                    <Outlet />
                </div>
            </div>
            <details className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">
                    About exchange prices
                </summary>
                <p className="mt-3 max-w-4xl">
                    Values come from the official currency exchange's hourly trade totals. An item
                    priced in the latest hour uses that hour's volume-weighted rate against exalted
                    orbs, or through divine orbs, chaos orbs or another item when it has no exalted
                    pair. Without a trade in the latest hour, the value is the newest of the last 7
                    days' rates and shows when it last traded. PoE 2 has no public stash data, so
                    only exchange items are listed.
                </p>
            </details>
        </main>
    );
}
