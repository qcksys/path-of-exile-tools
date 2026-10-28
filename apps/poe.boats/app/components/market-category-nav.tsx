import { useState } from "react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";

/** A market's category links, grouped, collapsing behind a toggle on small screens. */
export function MarketCategoryNav<Category extends string>({
    categories,
    current,
    link,
}: {
    categories: Record<Category, { label: string; group: string }>;
    current: Category;
    link: (category: Category) => string;
}) {
    const [open, setOpen] = useState(false);
    const entries = Object.entries(categories) as [Category, { label: string; group: string }][];
    const groups = [...new Set(entries.map(([, category]) => category.group))];
    return (
        <nav aria-label="Market categories" className="rounded-xl border border-border bg-card p-3">
            <Button
                type="button"
                variant="ghost"
                className="w-full justify-between lg:hidden"
                aria-expanded={open}
                aria-controls="market-category-links"
                onClick={() => setOpen(!open)}
            >
                Categories: {categories[current].label}
                <span aria-hidden="true">{open ? "−" : "+"}</span>
            </Button>
            <div id="market-category-links" className={open ? "block" : "hidden lg:block"}>
                <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3 lg:grid-cols-1">
                    {groups.map((group) => (
                        <div key={group} className="mt-4">
                            <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {group}
                            </h2>
                            {entries
                                .filter(([, category]) => category.group === group)
                                .map(([id, category]) => (
                                    <Link
                                        key={id}
                                        to={link(id)}
                                        aria-current={current === id ? "page" : undefined}
                                        onClick={() => setOpen(false)}
                                        className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${current === id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                                    >
                                        {category.label}
                                    </Link>
                                ))}
                        </div>
                    ))}
                </div>
            </div>
        </nav>
    );
}
