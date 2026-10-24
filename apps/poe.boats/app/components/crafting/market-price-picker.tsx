import type { ItemQuery, SourcePreparationProfile } from "@poe-tools/item-query";
import { decodeCohortPriceReference } from "@poe-tools/market";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { CraftingEngine } from "~/lib/crafting-engine";
import { createCraftingItemQuery } from "~/lib/crafting-item-query";
import { craftingMarketItemIssue, selectCraftingMarketPrice } from "~/lib/crafting-market";
import type { CraftingItem } from "~/schemas/crafting";
import type { CraftingPrice } from "~/schemas/crafting-economy";
import {
    type CraftingMarketCandidate,
    type CraftingMarketResult,
    craftingMarketHistoryResultSchema,
    craftingMarketResultSchema,
} from "~/schemas/crafting-market";
import { graphControl } from "./graph-query-editor";

export function MarketPricePicker({
    engine,
    item,
    requirements,
    sourcePreparation,
    league,
    currency,
    price,
    onLeagueChange,
    onSelect,
}: {
    engine: CraftingEngine;
    item: CraftingItem;
    requirements: ItemQuery;
    sourcePreparation?: SourcePreparationProfile;
    league?: string;
    currency: string;
    price: CraftingPrice | null;
    onLeagueChange: (league: string) => void;
    onSelect: (candidate: CraftingMarketCandidate) => void;
}) {
    const reference = decodeCohortPriceReference(price?.cohortId);
    const [realm, setRealm] = useState(reference?.realm ?? "pc");
    const [window, setWindow] = useState<"hourly" | "adaptive-v1">(reference?.window ?? "hourly");
    const [convert, setConvert] = useState(reference?.conversion === "exchange-v1");
    const [result, setResult] = useState<CraftingMarketResult>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [history, setHistory] = useState<{
        name: string;
        currency: string;
        rows: Array<{ hour: number; amount?: number; samples: number }>;
    }>();
    const pending = useRef<AbortController | null>(null);
    const record = useMemo(() => createCraftingItemQuery(engine).record(item), [engine, item]);
    const scope = JSON.stringify([record, requirements, sourcePreparation]);
    const [representative, setRepresentative] = useState({
        scope,
        enabled: reference?.assumption === "display-equivalent-v1",
    });
    if (representative.scope !== scope) setRepresentative({ scope, enabled: false });
    const assumption =
        representative.scope === scope && representative.enabled
            ? "display-equivalent-v1"
            : undefined;
    // biome-ignore lint/correctness/useExhaustiveDependencies: Changed search inputs invalidate the result and cancel the pending request.
    useEffect(() => {
        pending.current?.abort();
        setResult(undefined);
        setHistory(undefined);
        setError("");
        setBusy(false);
        return () => pending.current?.abort();
    }, [scope, league, currency, realm, window, assumption, convert]);
    async function lookup() {
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/v1/crafting/market/cohorts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    item: record,
                    requirements,
                    sourcePreparation,
                    league,
                    realm,
                    currency,
                    window: window === "hourly" ? undefined : window,
                    assumption,
                    conversion: convert ? "exchange-v1" : undefined,
                }),
                signal: controller.signal,
            });
            if (!response.ok)
                throw new Error("Market data is unavailable. Your saved price has not changed.");
            const next = craftingMarketResultSchema.parse(await response.json());
            if (!controller.signal.aborted) setResult(next);
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Could not load market prices.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    async function showHistory(candidate: CraftingMarketCandidate) {
        pending.current?.abort();
        setBusy(false);
        const controller = new AbortController();
        pending.current = controller;
        setError("");
        try {
            const response = await fetch("/api/v1/crafting/market/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    realm,
                    league,
                    cohortId: candidate.definition.id,
                    revision: candidate.definition.revision,
                    limit: 168,
                }),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error("Price history is unavailable.");
            const next = craftingMarketHistoryResultSchema.parse(await response.json());
            const listingCurrency = candidate.exchange?.currency ?? currency;
            if (!controller.signal.aborted)
                setHistory({
                    name: candidate.definition.name,
                    currency: listingCurrency,
                    rows: next.history.map((row) => ({
                        hour: row.hour,
                        amount: row.prices[listingCurrency]?.median,
                        samples: row.prices[listingCurrency]?.count ?? 0,
                    })),
                });
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Could not load history.");
        }
    }
    if (engine.catalog.game === "poe2")
        return (
            <p className="text-xs text-muted-foreground">
                PoE 2 equipment prices are entered manually using trade searches.
            </p>
        );
    const itemIssue = craftingMarketItemIssue(engine, item);
    if (itemIssue) return <p className="text-xs text-muted-foreground">{itemIssue}</p>;
    return (
        <details className="rounded border border-border p-3 text-xs">
            <summary className="cursor-pointer font-medium">Equipment market price</summary>
            <div className="mt-3 space-y-3">
                <p className="text-muted-foreground">
                    {sourcePreparation?.kind === "scour-v1"
                        ? "This price buys a Magic or Rare source requiring Scouring. Its explicit modifiers are removed; its base, item level, influences and native implicits are preserved. Required craft and enchantment removal, followed by one Orb of Scouring, are charged separately by the acquisition. "
                        : sourcePreparation
                          ? "This price buys a fractured source requiring preparation. Its extra affixes and Eldritch implicits are replaced. Cleanup, the first fossil roll and Eldritch currencies are charged separately by the acquisition. "
                          : "Choose a cohort that covers the configured item. Include any scouring, identification or other preparation in your process. "}
                    These are asking-price estimates, not completed sales.
                </p>
                <div className="grid grid-cols-2 gap-2">
                    <Label>
                        Market league
                        <Input
                            className={graphControl}
                            value={league ?? ""}
                            onChange={(event) => onLeagueChange(event.target.value)}
                        />
                    </Label>
                    <Label>
                        Market realm
                        <FormSelect
                            className={graphControl}
                            value={realm}
                            onValueChange={(selectedValue) =>
                                setRealm(selectedValue as typeof realm)
                            }
                        >
                            <FormSelectItem value="pc">PC</FormSelectItem>
                            <FormSelectItem value="xbox">Xbox</FormSelectItem>
                            <FormSelectItem value="sony">PlayStation</FormSelectItem>
                        </FormSelect>
                    </Label>
                </div>
                <Label className="block">
                    Equipment price window
                    <FormSelect
                        className={graphControl}
                        value={window}
                        onValueChange={(selectedValue) => setWindow(selectedValue as typeof window)}
                    >
                        <FormSelectItem value="hourly">Latest hour</FormSelectItem>
                        <FormSelectItem value="adaptive-v1">
                            Adaptive (1, 6 or 24 hours)
                        </FormSelectItem>
                    </FormSelect>
                </Label>
                {window === "adaptive-v1" && (
                    <p className="text-muted-foreground">
                        Below 10 sellers, widen when all source hours are present and hourly medians
                        vary by at most 10%. Repeated listings count once, using their latest
                        observation. These policy thresholds and confidence scores are uncalibrated.
                    </p>
                )}
                <Label className="flex items-start gap-2">
                    <Checkbox checked={convert} onCheckedChange={setConvert} />
                    Convert other listing currencies using the exchange
                </Label>
                {convert && (
                    <p className="text-muted-foreground">
                        Prefer prices in {currency}; otherwise convert a supported listing currency
                        using an exchange observation from the same hour. Converted estimates use
                        one hour, even when the adaptive window is selected.
                    </p>
                )}
                <Label className="flex items-start gap-2">
                    <Checkbox
                        checked={assumption !== undefined}
                        onCheckedChange={(checked) =>
                            setRepresentative({ scope, enabled: checked })
                        }
                    />
                    Use donor-family prices with this item as the representative
                </Label>
                <p className="text-muted-foreground">
                    Family listings can have indistinguishable modifier text but different modifier
                    identities or crafting eligibility. Choosing a family price saves the assumption
                    that your configured item represents the purchase.
                </p>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={!league?.trim() || busy}
                    onClick={() => void lookup()}
                >
                    {busy ? "Loading market…" : "Find market prices"}
                </Button>
                {error && <p role="alert">{error}</p>}
                {result?.message && <p>{result.message}</p>}
                {result?.truncated && (
                    <p>
                        Results were limited. Narrow the item requirements before choosing a price.
                    </p>
                )}
                {result?.candidates.map((candidate) => {
                    const quote = selectCraftingMarketPrice(candidate, currency);
                    return (
                        <div
                            key={`${candidate.definition.revision}:${candidate.definition.id}`}
                            className="space-y-2 rounded bg-muted/30 p-3"
                        >
                            <p className="flex items-center gap-2 font-medium">
                                <CatalogItemArt id={item.baseId} game={engine.catalog.game} />
                                {candidate.definition.name}
                            </p>
                            <p>
                                {quote
                                    ? `${quote.median} ${currency} median · ${quote.count} listings · ${quote.sellers} sellers · ${(quote.confidence * 100).toFixed(0)}% data confidence`
                                    : `No price in ${currency}`}
                            </p>
                            <p className="text-muted-foreground">
                                Observed {new Date(candidate.latest.hour * 1000).toLocaleString()} ·{" "}
                                {quote?.unknownCount ?? candidate.latest.unknownCount} unknown
                                matches
                            </p>
                            {candidate.exchange && (
                                <p className="text-muted-foreground">
                                    Converted from{" "}
                                    {candidate.latest.prices[candidate.exchange.currency]?.median}{" "}
                                    {candidate.exchange.currency} at{" "}
                                    {candidate.exchange.quote.amount} {currency} per{" "}
                                    {candidate.exchange.currency}. Confidence above describes the
                                    listing sample; combined conversion confidence is unknown. Price
                                    history shows the original listing currency.
                                </p>
                            )}
                            {quote && candidate.window && (
                                <p className="text-muted-foreground">
                                    {quote.hours}-hour estimate from{" "}
                                    {new Date(quote.windowStart * 1000).toLocaleString()}. Source
                                    observations do not establish current inventory or sales.
                                </p>
                            )}
                            {candidate.reasons.map((reason) => (
                                <p key={reason}>{reason}</p>
                            ))}
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    size="sm"
                                    disabled={!candidate.covered || result.truncated}
                                    onClick={() => onSelect(candidate)}
                                >
                                    Use live median
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void showHistory(candidate)}
                                >
                                    View price history
                                </Button>
                            </div>
                        </div>
                    );
                })}
                {history && (
                    <section
                        className="max-h-64 overflow-auto"
                        aria-label="Equipment price history"
                    >
                        <p className="mb-2 flex items-center gap-2 font-medium">
                            <CatalogItemArt id={item.baseId} game={engine.catalog.game} />
                            {history.name} · latest 168 hourly observations (unaggregated)
                        </p>
                        <table className="w-full text-left">
                            <thead>
                                <tr>
                                    <th>Observed hour</th>
                                    <th>Median ({history.currency})</th>
                                    <th>Listings</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.rows.map((row) => (
                                    <tr key={row.hour}>
                                        <td>{new Date(row.hour * 1000).toLocaleString()}</td>
                                        <td>{row.amount ?? "Unknown"}</td>
                                        <td>{row.samples}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                )}
            </div>
        </details>
    );
}

import { CatalogItemArt } from "~/components/item-art";
