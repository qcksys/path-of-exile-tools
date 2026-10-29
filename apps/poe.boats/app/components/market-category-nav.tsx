import { LoaderCircleIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigation } from "react-router";
import { ItemArt } from "~/components/item-art";
import { Button } from "~/components/ui/button";
import { useItemPresentations } from "~/hooks/use-item-presentations";
import { findItemPresentation } from "~/lib/item-presentation";
import { cn } from "~/lib/utils";

type CategoryDefinition = { label: string; group: string; icon: string };

/** A category's item art, or an empty slot of the same size until the art catalog loads. */
function CategoryIcon({ art }: { art: string | undefined }) {
    return art ? (
        <ItemArt src={art} name="" className="size-6 border-0 bg-transparent p-0" decorative />
    ) : (
        <span aria-hidden="true" className="size-6 shrink-0" />
    );
}

/** The path a navigation in progress is loading, if any. */
function usePendingPath() {
    const navigation = useNavigation();
    return navigation.state === "loading" ? navigation.location.pathname : undefined;
}

/**
 * A market's category links with their icons, grouped, collapsing behind a toggle on small
 * screens. The link being loaded is highlighted with a spinner until its page arrives.
 */
export function MarketCategoryNav<Category extends string>({
    categories,
    current,
    link,
    game,
}: {
    categories: Record<Category, CategoryDefinition>;
    current: Category;
    link: (category: Category) => string;
    game: "poe1" | "poe2";
}) {
    const [open, setOpen] = useState(false);
    const pendingPath = usePendingPath();
    const items = useItemPresentations(game);
    const art = (name: string) => findItemPresentation(items, undefined, name)?.art;
    const entries = Object.entries(categories) as [Category, CategoryDefinition][];
    const groups = [...new Set(entries.map(([, category]) => category.group))];
    const pending = entries.find(
        ([id]) => id !== current && link(id).split("?")[0] === pendingPath,
    )?.[0];
    const selected = pending ?? current;
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
                Categories: {categories[selected].label}
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
                                        aria-busy={pending === id || undefined}
                                        onClick={() => setOpen(false)}
                                        className={cn(
                                            "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
                                            selected === id
                                                ? "bg-primary/10 font-medium text-primary"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                        )}
                                    >
                                        <CategoryIcon art={art(category.icon)} />
                                        <span className="min-w-0 flex-1">{category.label}</span>
                                        {pending === id ? (
                                            <LoaderCircleIcon
                                                className="size-4 shrink-0 animate-spin"
                                                aria-label="Loading"
                                            />
                                        ) : null}
                                    </Link>
                                ))}
                        </div>
                    ))}
                </div>
            </div>
        </nav>
    );
}

/**
 * A market page's content, marked busy while another market page loads. Everything but the
 * filter form dims, and every control stays usable, so a filter changed while an earlier change
 * loads replaces that navigation.
 */
export function MarketPageContent({ prefix, children }: { prefix: string; children: ReactNode }) {
    const pendingPath = usePendingPath();
    const loading = pendingPath?.startsWith(prefix) ?? false;
    return (
        <div
            aria-busy={loading || undefined}
            className={cn(
                "relative min-w-0 space-y-5 *:transition-opacity",
                loading && "[&>:not(form,[aria-hidden])]:opacity-50",
            )}
        >
            <div
                aria-hidden="true"
                data-loading={loading || undefined}
                className="absolute inset-x-0 -top-3 h-0.5 rounded-full bg-primary opacity-0 transition-opacity data-loading:animate-pulse data-loading:opacity-100"
            />
            {children}
        </div>
    );
}
