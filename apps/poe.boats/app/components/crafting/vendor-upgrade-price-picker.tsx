import { useEffect, useMemo, useRef, useState } from "react";
import { CurrencyLabel } from "~/components/currency-label";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Label } from "~/components/ui/label";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { bindCraftingSourcePrice } from "~/lib/crafting-sources";
import { craftingVendorUpgradePaths } from "~/lib/crafting-vendor-upgrades";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { craftingSourceResultSchema, type VendorUpgradeQuote } from "~/schemas/crafting-sources";

const number = (value: number) => value.toLocaleString(undefined, { maximumSignificantDigits: 6 });

export function VendorUpgradeQuoteDetails({ quote }: { quote: VendorUpgradeQuote }) {
    return (
        <>
            <p>
                {number(quote.amount)} <CurrencyLabel currency={quote.currency} /> per output ·
                vendor-upgrade ingredient estimate
            </p>
            <p>
                {quote.path.quantity} × {quote.path.inputName} at {number(quote.ingredient.amount)}{" "}
                <CurrencyLabel currency={quote.currency} /> each.
            </p>
            <ul>
                {quote.path.steps.map((step) => (
                    <li key={step.recipeId}>
                        {step.inputQuantity} {step.inputName} → {step.outputQuantity}{" "}
                        {step.outputName}{" "}
                        <a
                            className="underline"
                            href={
                                step.sourceUrl ??
                                `https://www.poewiki.net/wiki/${encodeURIComponent(step.outputName.replaceAll(" ", "_"))}`
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            Recipe
                        </a>
                        {step.method === "purchase" && <p>{step.instructions}</p>}
                    </li>
                ))}
            </ul>
            <p>
                Ingredient observed{" "}
                {quote.ingredient.hour === null
                    ? "unknown"
                    : new Date(quote.ingredient.hour * 1000).toLocaleString()}{" "}
                · {quote.ingredient.itemVolume ?? "unknown"} ingredient units traded ·{" "}
                {quote.ingredient.quoteVolume ?? "unknown"} quote-currency units traded.
            </p>
            {quote.ingredient.legs && (
                <p>
                    Converted through two matching-hour exchange markets (
                    {quote.ingredient.legs
                        .map(
                            (leg) =>
                                `${leg.itemVolume === null ? "unknown" : number(leg.itemVolume)} input units / ${leg.quoteVolume === null ? "unknown" : number(leg.quoteVolume)} quote units`,
                        )
                        .join("; ")}
                    ).
                </p>
            )}
            <p>
                Confidence is unknown. Traded volume is not available stock. This prices
                ingredients, excluding acquisition gold and time; it is not a direct market quote
                for the output.
            </p>
        </>
    );
}

export function VendorUpgradePricePicker({
    graph,
    engine,
    id,
    name,
    onChange,
}: {
    graph: CraftingGraph;
    engine: CraftingEngine;
    id: string;
    name: string;
    onChange: (graph: CraftingGraph) => void;
}) {
    const paths = useMemo(() => craftingVendorUpgradePaths(engine, id), [engine, id]);
    const [inputId, setInputId] = useState("");
    const path = paths.find((entry) => entry.inputId === inputId) ?? paths[0];
    const [convert, setConvert] = useState(false);
    const [quote, setQuote] = useState<VendorUpgradeQuote>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const pending = useRef<AbortController | null>(null);
    const scope = JSON.stringify([
        graph.game,
        graph.league,
        graph.currency,
        graph.ruleset,
        id,
        path,
        convert,
    ]);
    useEffect(() => {
        pending.current?.abort();
        setQuote(undefined);
        setError("");
        setBusy(false);
        return () => pending.current?.abort();
    }, [scope]);
    if (!path) return null;
    async function lookup() {
        if (!path) return;
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true);
        setError("");
        setQuote(undefined);
        try {
            const response = await fetch("/api/v1/crafting/market/sources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    graph,
                    ids: [id],
                    realm: "pc",
                    vendorUpgrade: {
                        inputId: path.inputId,
                        conversion: convert ? "reference-currency-v1" : undefined,
                    },
                }),
            });
            if (!response.ok)
                throw new Error(
                    "Vendor ingredient prices are unavailable. Saved prices have not changed.",
                );
            const result = craftingSourceResultSchema.parse(await response.json());
            const next = result.quotes[id];
            if (!next || next.source !== "vendor-upgrade")
                throw new Error(
                    result.missing[id] ?? "The selected vendor ingredient is unpriced.",
                );
            if (!controller.signal.aborted) setQuote(next);
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Vendor lookup failed.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    return (
        <section
            aria-label={`Vendor-upgrade price for ${name}`}
            className="space-y-2 rounded border border-border p-3"
        >
            <p className="font-medium">Make {name} with a vendor recipe</p>
            {path.steps
                .filter((step) => step.method === "purchase")
                .map((step) => (
                    <p key={step.recipeId}>{step.instructions}</p>
                ))}
            <FormSelect
                aria-label={`Vendor ingredient for ${name}`}
                value={path.inputId}
                onValueChange={setInputId}
            >
                {paths.map((entry) => (
                    <FormSelectItem key={entry.inputId} value={entry.inputId}>
                        {entry.quantity} × {entry.inputName}
                    </FormSelectItem>
                ))}
            </FormSelect>
            <Label className="flex items-center gap-2">
                <Checkbox checked={convert} onCheckedChange={setConvert} />
                Allow matching-hour reference-currency conversion for the ingredient
            </Label>
            <Button
                size="sm"
                variant="outline"
                disabled={busy || !graph.league?.trim()}
                onClick={() => void lookup()}
            >
                {busy ? "Loading vendor estimate…" : "Find vendor-upgrade estimate"}
            </Button>
            {error && <p role="alert">{error}</p>}
            {quote && (
                <>
                    <VendorUpgradeQuoteDetails quote={quote} />
                    <Button
                        size="sm"
                        onClick={() => {
                            try {
                                onChange(bindCraftingSourcePrice(graph, engine, id, quote));
                            } catch (error) {
                                setError(
                                    error instanceof Error
                                        ? error.message
                                        : "Cannot apply vendor estimate.",
                                );
                            }
                        }}
                    >
                        Use vendor-upgrade estimate
                    </Button>
                </>
            )}
        </section>
    );
}
