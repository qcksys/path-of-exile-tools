import { useState } from "react";
import { Link, Outlet, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { MARKET_CATEGORIES, type MarketCategory } from "~/lib/market-categories";
import type { SiteHandle } from "~/routes/layouts/site";
import { marketFiltersSchema, marketLink } from "~/schemas/market";
import type { Route } from "./+types/market";

export const meta: Route.MetaFunction = () => [{ title: "Season market · POE.BOATS" }];

export const handle = { section: "Season market", sectionBadge: "Estimates" } satisfies SiteHandle;

export default function Market() {
    const [categoriesOpen, setCategoriesOpen] = useState(false);
    const [searchParams] = useSearchParams();
    const parsed = marketFiltersSchema.safeParse(Object.fromEntries(searchParams));
    const filters = parsed.success ? parsed.data : marketFiltersSchema.parse({});
    const categories = Object.entries(MARKET_CATEGORIES) as [
        MarketCategory,
        (typeof MARKET_CATEGORIES)[MarketCategory],
    ][];
    const groups = [...new Set(categories.map(([, category]) => category.group))];
    const categoryLink = (category: typeof filters.category, label: string) => (
        <Link
            key={category}
            to={marketLink({ ...filters, category, page: 1 })}
            aria-current={filters.category === category ? "page" : undefined}
            onClick={() => setCategoriesOpen(false)}
            className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${filters.category === category ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
            {label}
        </Link>
    );
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
                <nav
                    aria-label="Market categories"
                    className="rounded-xl border border-border bg-card p-3"
                >
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-between lg:hidden"
                        aria-expanded={categoriesOpen}
                        aria-controls="market-category-links"
                        onClick={() => setCategoriesOpen(!categoriesOpen)}
                    >
                        Categories:{" "}
                        {filters.category === "all"
                            ? "All items"
                            : MARKET_CATEGORIES[filters.category].label}
                        <span aria-hidden="true">{categoriesOpen ? "−" : "+"}</span>
                    </Button>
                    <div
                        id="market-category-links"
                        className={categoriesOpen ? "block" : "hidden lg:block"}
                    >
                        {categoryLink("all", "All items")}
                        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3 lg:grid-cols-1">
                            {groups.map((group) => (
                                <div key={group} className="mt-4">
                                    <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        {group}
                                    </h2>
                                    {categories
                                        .filter(([, category]) => category.group === group)
                                        .map(([id, category]) => categoryLink(id, category.label))}
                                </div>
                            ))}
                        </div>
                    </div>
                </nav>
                <div className="min-w-0 space-y-5">
                    <Outlet />
                </div>
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
                    retract estimates. Prices remain in their original currency. Listing counts are
                    observations, not total market supply.
                </p>
            </details>
        </main>
    );
}
