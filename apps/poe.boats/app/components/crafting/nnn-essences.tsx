import { type ReactNode, useMemo } from "react";
import { CatalogItemArt } from "~/components/item-art";
import { Button } from "~/components/ui/button";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { nonNativeEssenceSources } from "~/lib/crafting-recombination";
import type { CraftingItem } from "~/schemas/crafting";

export function NnnEssences({
    engine,
    item,
    other,
    prices,
    currency = "chaos",
    onSelect,
    priceControls,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    other?: CraftingItem;
    prices: Record<string, number | undefined>;
    currency?: string;
    onSelect: (id: string) => void;
    priceControls?: (sources: ReturnType<typeof nonNativeEssenceSources>) => ReactNode;
}) {
    const result = useMemo(() => {
        try {
            return { sources: nonNativeEssenceSources(engine, item, other), error: null };
        } catch (error) {
            return { sources: [], error: error instanceof Error ? error.message : String(error) };
        }
    }, [engine, item, other]);
    if (engine.catalog.game !== "poe1") return null;
    const sources = result.sources.toSorted(
        (a, b) =>
            (prices[a.id] ?? Infinity) - (prices[b.id] ?? Infinity) || a.name.localeCompare(b.name),
    );
    return (
        <details className="rounded border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">
                Non-native natural essences ({sources.length})
            </summary>
            <p className="my-2 text-xs text-muted-foreground">
                These modifiers count toward recombination's affix pool but cannot survive on this
                base. Eligibility on the other base matters. Known prices sort first; selecting a
                recipe does not guarantee the other modifiers you want.
            </p>
            {result.error && (
                <p role="alert" className="text-xs">
                    {result.error}
                </p>
            )}
            {priceControls?.(sources)}
            {!sources.length && !result.error && (
                <p className="text-xs">No extracted NNN essence recipes for this base.</p>
            )}
            <ul className="max-h-80 space-y-2 overflow-y-auto">
                {sources.map((source) => (
                    <li
                        key={source.id}
                        className="flex items-start gap-2 border-t border-border pt-2 text-xs"
                    >
                        <CatalogItemArt
                            id={source.id}
                            game={engine.catalog.game}
                            className="size-10"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="font-medium">{source.name}</p>
                            <p className="text-muted-foreground">
                                {source.side}: {engine.mod(source.modId).text}
                            </p>
                            <p>
                                {source.rerollsRare ? "Normal or rare input" : "Normal input only"}
                                {source.itemLevelLimit
                                    ? ` · rolling level capped at ${source.itemLevelLimit}`
                                    : ""}
                            </p>
                            {source.nativeOnOther !== null && (
                                <p>
                                    {source.nativeOnOther
                                        ? "Can survive on the other base"
                                        : "Cannot survive on either base"}
                                </p>
                            )}
                            <p className="font-mono">
                                {prices[source.id] === undefined
                                    ? "Price unknown"
                                    : `${prices[source.id]} ${currency}`}
                            </p>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Use ${source.name}`}
                            onClick={() => onSelect(source.id)}
                        >
                            Use
                        </Button>
                    </li>
                ))}
            </ul>
        </details>
    );
}
