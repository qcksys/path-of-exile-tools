import { Outlet, useParams, useSearchParams } from "react-router";
import { MarketCategoryNav, MarketPageContent } from "~/components/market-category-nav";
import { MarketDisplayProvider } from "~/components/market-exchange";
import { MARKET_CATEGORIES, type MarketCategory } from "~/lib/market-categories";
import { MARKET_AXIS_DEFAULTS } from "~/lib/market-kinds";
import type { SiteHandle } from "~/routes/layouts/site";
import {
    MARKET_DEFAULT_CATEGORY,
    marketCorruption,
    marketFiltersSchema,
    marketLink,
} from "~/schemas/market";
import type { Route } from "./+types/market";

export const meta: Route.MetaFunction = () => [{ title: "Season market · POE.BOATS" }];

export const handle = { section: "Season market", sectionBadge: "Estimates" } satisfies SiteHandle;

export default function Market() {
    const [searchParams] = useSearchParams();
    const { category } = useParams();
    const parsed = marketFiltersSchema.safeParse({
        ...Object.fromEntries(searchParams),
        ...(category ? { category } : {}),
    });
    const filters = parsed.success ? parsed.data : marketFiltersSchema.parse({});
    const current = filters.category === "all" ? MARKET_DEFAULT_CATEGORY : filters.category;
    // A corruption choice other than this category's default carries to the next category.
    const corruption =
        filters.corruption === marketCorruption({ category: filters.category })
            ? undefined
            : filters.corruption;
    return (
        <main className="container mx-auto flex-1 space-y-6 px-4 py-8">
            <header>
                <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground">
                    PUBLIC STASH DATA
                </p>
                <h1 className="font-heading text-3xl font-bold tracking-tight">
                    Prices &amp; likely sales
                </h1>
                <p className="mt-2 text-muted-foreground">
                    Browse items by category and compare asking prices across seasons.
                </p>
            </header>
            <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
                <MarketCategoryNav
                    categories={MARKET_CATEGORIES}
                    current={current}
                    link={(category: MarketCategory) =>
                        marketLink({
                            ...filters,
                            ...MARKET_AXIS_DEFAULTS,
                            category,
                            page: 1,
                            q: "",
                            corruption,
                        })
                    }
                    game="poe1"
                />
                <MarketPageContent prefix="/1/market">
                    <MarketDisplayProvider>
                        <Outlet />
                    </MarketDisplayProvider>
                </MarketPageContent>
            </div>
            <details className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">
                    About prices &amp; likely sales
                </summary>
                <p className="mt-3 max-w-4xl">
                    Likely sales are estimates, not confirmed trades. An item must disappear for at
                    least one hour of continuous caught-up observation, have no matching relist by
                    the same seller, and be priced within 25% of the median from at least three
                    other recent sellers. Whole-stash withdrawals are excluded. Later relists can
                    retract estimates. Prices are shown in the chosen value display, converted at
                    the currency exchange rate, and note their listed currency. Listing counts are
                    observations, not total market supply.
                </p>
            </details>
        </main>
    );
}
