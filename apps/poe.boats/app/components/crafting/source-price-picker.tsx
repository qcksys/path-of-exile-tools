import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { bindCraftingSourcePrice, craftingCommodityIdentity } from "~/lib/crafting-sources";
import { craftingVendorUpgradePaths } from "~/lib/crafting-vendor-upgrades";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { type CraftingSourceResult, craftingSourceResultSchema } from "~/schemas/crafting-sources";
import { VendorUpgradePricePicker, VendorUpgradeQuoteDetails } from "./vendor-upgrade-price-picker";

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
    const [convert, setConvert] = useState(false);
    const [result, setResult] = useState<CraftingSourceResult>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const pending = useRef<AbortController | null>(null);
    const inputs = entries.filter(
        ([id]) => !id.startsWith("Metadata/Items/") || craftingCommodityIdentity(engine, id),
    );
    const hasCommodities = inputs.some(([id]) => craftingCommodityIdentity(engine, id));
    const hasRecipes = inputs.some(([id]) => !id.startsWith("Metadata/Items/"));
    const vendorInputs = entries.filter(
        ([id]) => craftingVendorUpgradePaths(engine, id).length > 0,
    );
    const title = !inputs.length
        ? "Vendor ingredient estimates"
        : hasCommodities
          ? "Essence, beast & temple asking prices"
          : vendorInputs.length > 0
            ? "Vendor, beast & temple prices"
            : "Beast & temple prices";
    const scope = JSON.stringify([
        graph.game,
        graph.league,
        graph.currency,
        graph.ruleset,
        inputs.map(([id]) => id),
        assumption,
        convert,
    ]);
    useEffect(() => {
        pending.current?.abort();
        setResult(undefined);
        setError("");
        setBusy(false);
        return () => pending.current?.abort();
    }, [scope]);
    if (graph.game !== "poe1" || (!inputs.length && !vendorInputs.length)) return null;
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
                    conversion: convert ? "exchange-v1" : undefined,
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
            <summary className="cursor-pointer font-medium">{title}</summary>
            <div className="mt-3 space-y-3">
                {hasCommodities && (
                    <p className="text-muted-foreground">
                        Captured PoE 1 PC essence asks are per item in the project league and
                        currency. These are listing estimates, not completed exchange trades. The
                        observed hour, price range and priced sample count are shown separately from
                        all listings and sellers. Confidence is uncalibrated; sparse asks can vary
                        widely.
                    </p>
                )}
                {hasCommodities && (
                    <Label className="flex items-center gap-2">
                        <Checkbox checked={convert} onCheckedChange={setConvert} />
                        Convert essence asks using matching-hour exchange rates
                    </Label>
                )}
                {hasRecipes && (
                    <>
                        <p className="text-muted-foreground">
                            PoE 1 PC listing estimates from poe.ninja for the project league. Beast
                            prices include all four sacrifices; temple prices buy one Locus of
                            Corruption. Listing counts are not unique sellers, and confidence is
                            uncalibrated. Historical process estimates need manual assumptions for
                            these sources.
                        </p>
                        <Label className="flex items-center gap-2">
                            <Checkbox checked={assumption} onCheckedChange={setAssumption} />
                            Use Mountain Lynx listing prices for the extra rare beasts
                        </Label>
                        <p className="text-muted-foreground">
                            Level-specific beasts and non-tradeable gold/dust remain manual. The
                            date shown is retrieval time, not a guaranteed sale or source update
                            time.
                        </p>
                    </>
                )}
                {inputs.length > 0 && (
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !graph.league?.trim()}
                        onClick={() => void lookup()}
                    >
                        {busy
                            ? "Loading sources…"
                            : hasCommodities
                              ? "Find asking prices"
                              : "Find beast & temple prices"}
                    </Button>
                )}
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
                                            {quote.source === "stash-commodity" ? (
                                                <>
                                                    <p>
                                                        {quote.amount.toLocaleString(undefined, {
                                                            maximumSignificantDigits: 6,
                                                        })}{" "}
                                                        {quote.currency} per item ·{" "}
                                                        {quote.exchange
                                                            ? "converted asking median"
                                                            : "asking median"}{" "}
                                                        · observed{" "}
                                                        {new Date(
                                                            quote.hour * 1000,
                                                        ).toLocaleString()}
                                                    </p>
                                                    <p>
                                                        {quote.low.toLocaleString(undefined, {
                                                            maximumSignificantDigits: 6,
                                                        })}
                                                        –
                                                        {quote.high.toLocaleString(undefined, {
                                                            maximumSignificantDigits: 6,
                                                        })}{" "}
                                                        {quote.currency}{" "}
                                                        {quote.exchange
                                                            ? "converted range"
                                                            : "range"}{" "}
                                                        · {quote.samples} priced samples ·{" "}
                                                        {quote.listingCount} total listings ·{" "}
                                                        {quote.uniqueSellers} total sellers
                                                    </p>
                                                    {quote.exchange && (
                                                        <p>
                                                            Original ask:{" "}
                                                            {quote.exchange.amount.toLocaleString(
                                                                undefined,
                                                                { maximumSignificantDigits: 6 },
                                                            )}{" "}
                                                            {quote.exchange.currency} per item{" "}
                                                            (range{" "}
                                                            {quote.exchange.low.toLocaleString(
                                                                undefined,
                                                                { maximumSignificantDigits: 6 },
                                                            )}
                                                            –
                                                            {quote.exchange.high.toLocaleString(
                                                                undefined,
                                                                { maximumSignificantDigits: 6 },
                                                            )}
                                                            ). Matching-hour exchange: 1{" "}
                                                            {quote.exchange.currency} ={" "}
                                                            {quote.exchange.quote.amount.toLocaleString(
                                                                undefined,
                                                                { maximumSignificantDigits: 6 },
                                                            )}{" "}
                                                            {quote.currency}
                                                            {quote.exchange.quote.legs
                                                                ? " via a two-leg reference-currency conversion"
                                                                : ""}
                                                            . Combined confidence is unknown.
                                                        </p>
                                                    )}
                                                    <a
                                                        className="underline"
                                                        href={`/1/market?${new URLSearchParams({ realm: quote.realm, league: quote.league, q: quote.baseType, item: quote.baseType, currency: quote.exchange?.currency ?? quote.currency })}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Captured asking-price history
                                                    </a>
                                                </>
                                            ) : quote.source === "vendor-upgrade" ? (
                                                <VendorUpgradeQuoteDetails quote={quote} />
                                            ) : (
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
                                                                {component.quantity} ×{" "}
                                                                {component.name}:{" "}
                                                                {component.unitPrice}{" "}
                                                                {quote.currency} each ·{" "}
                                                                {component.listingCount} listings ·{" "}
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
                                                </>
                                            )}
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
                {vendorInputs.length > 0 && (
                    <details className="space-y-3">
                        <summary className="cursor-pointer font-medium">
                            Vendor-upgrade ingredient estimates
                        </summary>
                        {vendorInputs.map(([id, name]) => (
                            <VendorUpgradePricePicker
                                key={id}
                                graph={graph}
                                engine={engine}
                                id={id}
                                name={name}
                                onChange={onChange}
                            />
                        ))}
                    </details>
                )}
            </div>
        </details>
    );
}
