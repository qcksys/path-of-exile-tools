import { ArrowUpRight } from "lucide-react";
import { Form, Link } from "react-router";
import { ItemArt } from "~/components/item-art";
import { RouteError } from "~/components/route-error";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { collectorFilters, listCollectorItems } from "~/lib/collector-items.server";
import type { SiteHandle } from "~/routes/layouts/site";
import type { Route } from "./+types/collectors";

export const handle = { section: "PoE 1" } satisfies SiteHandle;

export function meta() {
    return [{ title: "Collector Gallery · POE.BOATS" }];
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return <RouteError error={error} />;
}

export function loader({ request }: Route.LoaderArgs) {
    const parsed = collectorFilters.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) throw new Response("Invalid gallery filters", { status: 400 });
    return { filters: parsed.data, ...listCollectorItems(parsed.data) };
}

const linkStyle = "text-primary underline underline-offset-4 hover:no-underline";

export default function CollectorGallery({ loaderData }: Route.ComponentProps) {
    const { filters, items, provenanceNote } = loaderData;
    const artworkCount = items.reduce((sum, item) => sum + item.artworks.length, 0);
    return (
        <main className="container mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8">
            <header className="space-y-2">
                <h1 className="font-heading text-4xl font-bold tracking-tight">
                    Collector Gallery
                </h1>
                <p className="text-muted-foreground">
                    Browse{" "}
                    <a className={linkStyle} href="https://www.poewiki.net/wiki/Alternate_art_item">
                        alternate-art items
                    </a>{" "}
                    and{" "}
                    <a className={linkStyle} href="https://www.poewiki.net/wiki/Demigod_unique">
                        Demigod uniques
                    </a>{" "}
                    from the PoE Wiki.
                </p>
            </header>
            <Form
                method="get"
                role="search"
                key={JSON.stringify(filters)}
                className="flex flex-wrap items-end gap-3"
            >
                <label
                    htmlFor="collector-search"
                    className="grid min-w-48 flex-1 gap-1 text-sm font-medium sm:max-w-sm"
                >
                    Search gallery
                    <Input
                        id="collector-search"
                        type="search"
                        name="q"
                        maxLength={100}
                        defaultValue={filters.q}
                        placeholder="Item, base type or season"
                    />
                </label>
                <div className="grid gap-1 text-sm font-medium">
                    <label htmlFor="collection">Collection</label>
                    <FormSelect id="collection" name="collection" defaultValue={filters.collection}>
                        <FormSelectItem value="all">All items</FormSelectItem>
                        <FormSelectItem value="alternate">Alternate art</FormSelectItem>
                        <FormSelectItem value="demigod">Demigod uniques</FormSelectItem>
                        <FormSelectItem value="base">Base items</FormSelectItem>
                    </FormSelect>
                </div>
                <Button type="submit">Search</Button>
                {(filters.q || filters.collection !== "all") && (
                    <Link to="/1/collectors" className={`self-end py-2 text-sm ${linkStyle}`}>
                        Clear filters
                    </Link>
                )}
            </Form>
            <aside className="max-w-4xl border-l-2 border-primary/50 pl-3 text-sm text-muted-foreground">
                Standard trade links show asking prices. An alternate-art search includes every
                season for that item. {provenanceNote}
            </aside>
            <section aria-label="Gallery results">
                <p className="mb-3 text-sm font-medium tabular-nums" role="status">
                    {items.length} {items.length === 1 ? "item" : "items"} · {artworkCount}{" "}
                    {artworkCount === 1 ? "artwork" : "artworks"}
                </p>
                {items.length === 0 ? (
                    <p className="rounded-lg border border-border p-6 text-muted-foreground">
                        No matching items. Try another name or season.
                    </p>
                ) : (
                    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {items.map((item) => (
                            <li
                                key={item.name}
                                className="flex flex-col rounded-xl border border-border bg-card"
                            >
                                <div className="p-4 pb-2">
                                    <h2 className="font-heading text-lg font-semibold">
                                        <a
                                            href={item.wikiUrl}
                                            className="hover:text-primary hover:underline"
                                        >
                                            {item.name}
                                        </a>
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        {item.group === "base" ? "Base item" : item.baseType}
                                    </p>
                                </div>
                                <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(65px,1fr))] gap-1 px-3 pb-3">
                                    {item.artworks.map(({ labels, icon }) => (
                                        <figure
                                            key={icon}
                                            className="flex flex-col items-center gap-2 rounded-md bg-muted/40 px-1 py-3"
                                        >
                                            <ItemArt
                                                src={icon}
                                                name={`${item.name}, ${labels.join(", ")}`}
                                                className="h-24 w-full border-0 bg-transparent"
                                            />
                                            <figcaption className="text-center text-xs font-medium">
                                                {labels.join(" · ")}
                                            </figcaption>
                                        </figure>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-sm">
                                    {item.originalListings && (
                                        <a className={linkStyle} href={item.originalListings}>
                                            Original listings
                                            <ArrowUpRight
                                                className="inline size-3"
                                                aria-hidden="true"
                                            />
                                        </a>
                                    )}
                                    {item.alternateListings && (
                                        <a className={linkStyle} href={item.alternateListings}>
                                            Alternate-art listings
                                            <ArrowUpRight
                                                className="inline size-3"
                                                aria-hidden="true"
                                            />
                                        </a>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
