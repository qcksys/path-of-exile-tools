import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { bindCraftingSourcePrice } from "~/lib/crafting-sources";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { type CraftingSourceResult, craftingSourceResultSchema } from "~/schemas/crafting-sources";

export function SourcePricePicker({
    graph,
    engine,
    entries,
    onChange,
}: {
    graph: CraftingGraph;
    engine: CraftingEngine;
    entries: [string, string][];
    onChange: (graph: CraftingGraph) => void;
}) {
    const [assumption, setAssumption] = useState(false);
    const [result, setResult] = useState<CraftingSourceResult>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const pending = useRef<AbortController | null>(null);
    const inputs = entries.filter(([id]) => !id.startsWith("Metadata/Items/"));
    const scope = JSON.stringify([
        graph.game,
        graph.league,
        graph.currency,
        graph.ruleset,
        inputs.map(([id]) => id),
        assumption,
    ]);
    useEffect(() => {
        pending.current?.abort();
        setResult(undefined);
        setError("");
        setBusy(false);
        return () => pending.current?.abort();
    }, [scope]);
    if (graph.game !== "poe1" || !inputs.length) return null;
    async function lookup() {
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/v1/crafting/market/sources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    graph,
                    ids: inputs.map(([id]) => id),
                    realm: "pc",
                    assumption: assumption ? "rare-beast-mountain-lynx-v1" : undefined,
                }),
            });
            if (!response.ok)
                throw new Error(
                    "Supplemental price sources are unavailable. Saved prices have not changed.",
                );
            const next = craftingSourceResultSchema.parse(await response.json());
            if (!controller.signal.aborted) setResult(next);
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Source lookup failed.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    function apply(ids: string[]) {
        try {
            let next = graph;
            for (const id of ids)
                if (result?.quotes[id])
                    next = bindCraftingSourcePrice(next, engine, id, result.quotes[id]);
            onChange(next);
        } catch (error) {
            setError(error instanceof Error ? error.message : "Cannot apply source quote.");
        }
    }
    return (
        <details className="mt-3 rounded border border-border p-3 text-xs">
            <summary className="cursor-pointer font-medium">Beast & temple prices</summary>
            <div className="mt-3 space-y-3">
                <p className="text-muted-foreground">
                    PoE 1 PC listing estimates from poe.ninja for the project league. Beast prices
                    include all four sacrifices; temple prices buy one Locus of Corruption. Listing
                    counts are not unique sellers, and confidence is uncalibrated. Historical
                    process estimates need manual assumptions for these sources.
                </p>
                <Label className="flex items-center gap-2">
                    <Checkbox checked={assumption} onCheckedChange={setAssumption} />
                    Use Mountain Lynx listing prices for the extra rare beasts
                </Label>
                <p className="text-muted-foreground">
                    Level-specific beasts and non-tradeable gold/dust remain manual. The date shown
                    is retrieval time, not a guaranteed sale or source update time.
                </p>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !graph.league?.trim()}
                    onClick={() => void lookup()}
                >
                    {busy ? "Loading sources…" : "Find beast & temple prices"}
                </Button>
                {error && <p role="alert">{error}</p>}
                {result && (
                    <>
                        <p>
                            {Object.keys(result.quotes).length} of {inputs.length} inputs priced.
                        </p>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!Object.keys(result.quotes).some((id) => !graph.prices[id])}
                            onClick={() =>
                                apply(Object.keys(result.quotes).filter((id) => !graph.prices[id]))
                            }
                        >
                            Use source estimates for unpriced inputs
                        </Button>
                        {inputs.map(([id, name]) => {
                            const quote = result.quotes[id];
                            return (
                                <section
                                    key={id}
                                    aria-label={`Source price for ${name}`}
                                    className="space-y-2 rounded bg-muted/30 p-3"
                                >
                                    <p className="font-medium">{name}</p>
                                    {quote ? (
                                        <>
                                            <p>
                                                {quote.amount.toLocaleString(undefined, {
                                                    maximumSignificantDigits: 6,
                                                })}{" "}
                                                {quote.currency} per recipe · retrieved{" "}
                                                {new Date(quote.fetchedAt).toLocaleString()}
                                            </p>
                                            <ul>
                                                {quote.components.map((component) => (
                                                    <li key={component.detailsId}>
                                                        {component.quantity} × {component.name}:{" "}
                                                        {component.unitPrice} {quote.currency} each
                                                        · {component.listingCount} listings ·{" "}
                                                        <a
                                                            className="underline"
                                                            href={component.sourceUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            Source
                                                        </a>
                                                    </li>
                                                ))}
                                            </ul>
                                            <Button size="sm" onClick={() => apply([id])}>
                                                Use source estimate
                                            </Button>
                                        </>
                                    ) : (
                                        <p>{result.missing[id]}</p>
                                    )}
                                </section>
                            );
                        })}
                    </>
                )}
            </div>
        </details>
    );
}
