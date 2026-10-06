import { type ReactNode, useState } from "react";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { PoolEntry } from "~/lib/crafting-engine";
import type { ModifierLayout } from "./display-settings";

export const initialModifierPages = { all: 0, prefix: 0, suffix: 0 };
type PageGroup = keyof typeof initialModifierPages;
const sides = ["prefix", "suffix"] as const;
const labels = { all: "Modifiers", prefix: "Prefixes", suffix: "Suffixes" };

export function ModifierPoolLayout({
    entries,
    layout,
    pages,
    onPage,
    children,
}: {
    entries: PoolEntry[];
    layout: ModifierLayout | "list";
    pages: typeof initialModifierPages;
    onPage: (group: PageGroup, page: number) => void;
    children: (entry: PoolEntry) => ReactNode;
}) {
    const [tab, setTab] = useState("prefix");
    const groups = {
        all: entries,
        prefix: entries.filter((entry) => entry.mod.generation_type === "prefix"),
        suffix: entries.filter((entry) => entry.mod.generation_type === "suffix"),
    };
    function page(group: PageGroup) {
        const entries = groups[group];
        const count = Math.max(1, Math.ceil(entries.length / 30));
        const current = Math.min(pages[group], count - 1);
        return (
            <>
                <div className="max-h-[660px] overflow-y-auto">
                    {entries.slice(current * 30, (current + 1) * 30).map(children)}
                    {!entries.length ? (
                        <p className="p-6 text-sm text-muted-foreground">
                            No {labels[group].toLowerCase()} match these filters.
                        </p>
                    ) : null}
                </div>
                <nav
                    aria-label={`${labels[group]} pages`}
                    className="flex items-center justify-between gap-2 p-3"
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={current === 0}
                        onClick={() => onPage(group, current - 1)}
                    >
                        Previous
                    </Button>
                    <span className="text-xs text-muted-foreground" aria-live="polite">
                        {current + 1} / {count}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={current + 1 >= count}
                        onClick={() => onPage(group, current + 1)}
                    >
                        Next
                    </Button>
                </nav>
            </>
        );
    }
    if (layout === "list") return page("all");
    if (layout === "tabs")
        return (
            <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
                <TabsList aria-label="Modifier affixes" className="mx-4 mt-3" activateOnFocus>
                    {sides.map((side) => (
                        <TabsTrigger key={side} value={side}>
                            {labels[side]} ({groups[side].length})
                        </TabsTrigger>
                    ))}
                </TabsList>
                {sides.map((side) => (
                    <TabsContent key={side} value={side}>
                        {page(side)}
                    </TabsContent>
                ))}
            </Tabs>
        );
    return (
        <div className="grid grid-cols-1 divide-y @min-[40rem]:grid-cols-2 @min-[40rem]:divide-x @min-[40rem]:divide-y-0">
            {sides.map((side) => (
                <section key={side} aria-label={labels[side]} className="min-w-0">
                    <h3 className="border-b px-4 py-2 text-sm font-medium">
                        {labels[side]}{" "}
                        <span className="text-muted-foreground">({groups[side].length})</span>
                    </h3>
                    {page(side)}
                </section>
            ))}
        </div>
    );
}
