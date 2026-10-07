import {
    adaptiveExchangePolicy,
    type ExchangeQuote,
    quoteExchangeSnapshot,
} from "@poe-tools/market";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { bindExchangePrice } from "~/lib/crafting-exchange";
import {
    type CraftingExchangeResult,
    craftingExchangeHistoryResultSchema,
    craftingExchangeResultSchema,
} from "~/schemas/crafting-exchange";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { graphControl } from "./graph-query-editor";

export function ExchangePricePicker({
    graph,
    entries,
    onChange,
}: {
    graph: CraftingGraph;
    entries: [string, string][];
    onChange: (graph: CraftingGraph) => void;
}) {
    const [realm, setRealm] = useState<"pc" | "xbox" | "sony" | "poe2">(
        graph.game === "poe2" ? "poe2" : "pc",
    );
    const [result, setResult] = useState<CraftingExchangeResult>();
    const [window, setWindow] = useState<"hourly" | "adaptive-v1">("hourly");
    const [history, setHistory] =
        useState<Array<{ hour: number; amount: number | null; volume: number | null }>>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const pending = useRef<AbortController | null>(null);
    const ids = JSON.stringify(entries.map(([id]) => id).toSorted());
    // biome-ignore lint/correctness/useExhaustiveDependencies: Changed market scope or input IDs invalidate pending and displayed results.
    useEffect(() => {
        pending.current?.abort();
        setResult(undefined);
        setHistory(undefined);
        setError("");
        setBusy(false);
        return () => pending.current?.abort();
    }, [graph.game, graph.league, graph.currency, realm, ids, window]);
    async function lookup() {
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/v1/crafting/market/exchange", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    game: graph.game,
                    realm,
                    league: graph.league,
                    currency: graph.currency,
                    itemIds: entries.map(([id]) => id),
                    window: window === "adaptive-v1" ? window : undefined,
                }),
            });
            if (!response.ok)
                throw new Error(
                    "Exchange prices are unavailable. Manual and saved prices have not changed.",
                );
            const next = craftingExchangeResultSchema.parse(await response.json());
            if (!controller.signal.aborted) setResult(next);
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "Exchange lookup failed.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    async function showHistory(quote: ExchangeQuote) {
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setBusy(false);
        setError("");
        try {
            const response = await fetch("/api/v1/crafting/market/exchange/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    realm: quote.realm,
                    league: quote.league,
                    itemId: quote.itemId,
                    quoteId: quote.quoteId,
                    limit: 168,
                }),
            });
            if (!response.ok) throw new Error("Exchange history is unavailable.");
            const next = craftingExchangeHistoryResultSchema.parse(await response.json());
            if (!controller.signal.aborted)
                setHistory(
                    next.history.map((row) => {
                        const price = quoteExchangeSnapshot(row, quote.itemId, quote.quoteId);
                        return {
                            hour: row.hour,
                            amount: price?.amount ?? null,
                            volume: price?.itemVolume ?? null,
                        };
                    }),
                );
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "History lookup failed.");
        }
    }
    return (
        <details className="mt-3 rounded border border-border p-3 text-xs">
            <summary className="cursor-pointer font-medium">
                Currency & essence exchange prices
            </summary>
            <div className="mt-3 space-y-3">
                <p className="text-muted-foreground">
                    Estimates use captured traded volumes for each direct pair. These are historical
                    trades, not current buy offers. Selecting a price enables refresh; editing its
                    amount restores a manual override. Gold and trading time are excluded.
                </p>
                <label className="block">
                    Exchange estimate window
                    <select
                        className={graphControl}
                        value={window}
                        onChange={(event) => setWindow(event.target.value as typeof window)}
                    >
                        <option value="hourly">Latest captured hour</option>
                        <option value="adaptive-v1">Adaptive: 1, 6 or 24 hours</option>
                    </select>
                </label>
                {window === "adaptive-v1" && (
                    <p className="text-muted-foreground">
                        Widens while fewer than {adaptiveExchangePolicy.minimumItemVolume} input
                        units traded and hourly estimates vary by at most{" "}
                        {adaptiveExchangePolicy.maximumMovement * 100}%. Requires every hour to be
                        captured. A latest hour with no trades stays unknown. This is a fixed
                        estimation policy, not calibrated confidence.
                    </p>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                    <label>
                        Exchange league
                        <input
                            className={graphControl}
                            value={graph.league ?? ""}
                            onChange={(event) =>
                                onChange({ ...graph, league: event.target.value || undefined })
                            }
                        />
                    </label>
                    <label>
                        Exchange realm
                        <select
                            className={graphControl}
                            value={realm}
                            onChange={(event) => setRealm(event.target.value as typeof realm)}
                        >
                            {graph.game === "poe2" ? (
                                <option value="poe2">PoE 2</option>
                            ) : (
                                <>
                                    <option value="pc">PC</option>
                                    <option value="xbox">Xbox</option>
                                    <option value="sony">PlayStation</option>
                                </>
                            )}
                        </select>
                    </label>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !graph.league?.trim() || entries.length === 0}
                    onClick={() => void lookup()}
                >
                    {busy ? "Loading exchange…" : "Find exchange prices"}
                </Button>
                {error && <p role="alert">{error}</p>}
                {result && (
                    <div className="space-y-2">
                        <p>
                            {Object.keys(result.quotes).length} of {entries.length} inputs priced.
                            Missing inputs remain unknown.
                        </p>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={!Object.keys(result.quotes).some((id) => !graph.prices[id])}
                            onClick={() => {
                                try {
                                    let next = graph;
                                    for (const [id, quote] of Object.entries(result.quotes))
                                        if (!graph.prices[id])
                                            next = bindExchangePrice(next, id, quote);
                                    onChange(next);
                                } catch (error) {
                                    setError(
                                        error instanceof Error
                                            ? error.message
                                            : "Cannot use these quotes.",
                                    );
                                }
                            }}
                        >
                            Use estimates for unpriced inputs
                        </Button>
                    </div>
                )}
                {result &&
                    entries.map(([id, name]) => {
                        const quote = result.quotes[id];
                        return (
                            <section
                                key={id}
                                aria-label={`Exchange price for ${name}`}
                                className="space-y-2 rounded bg-muted/30 p-3"
                            >
                                <p className="font-medium">{name}</p>
                                {quote ? (
                                    <>
                                        <p>
                                            {quote.amount.toLocaleString(undefined, {
                                                maximumSignificantDigits: 6,
                                            })}{" "}
                                            {graph.currency} per unit ·{" "}
                                            {quote.estimator === "currency-unit-v1"
                                                ? "accounting currency"
                                                : "traded-volume estimate"}
                                        </p>
                                        {quote.hour !== null && (
                                            <p>
                                                Observed{" "}
                                                {new Date(quote.hour * 1000).toLocaleString()} ·{" "}
                                                {quote.itemVolume?.toLocaleString()} units traded ·{" "}
                                                {quote.low === null
                                                    ? "range unavailable"
                                                    : `${quote.low.toPrecision(4)}–${quote.high!.toPrecision(4)} ${graph.currency} observed range`}{" "}
                                                · confidence uncalibrated
                                            </p>
                                        )}
                                        {quote.windowStart !== undefined && quote.hour !== null && (
                                            <p>
                                                Estimate window:{" "}
                                                {(quote.hour - quote.windowStart) / 3600 + 1} hours
                                                ·{" "}
                                                {new Date(
                                                    quote.windowStart * 1000,
                                                ).toLocaleString()}{" "}
                                                to{" "}
                                                {new Date(
                                                    (quote.hour + 3600) * 1000,
                                                ).toLocaleString()}
                                                . Refresh keeps the adaptive policy.
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    try {
                                                        onChange(
                                                            bindExchangePrice(graph, id, quote),
                                                        );
                                                    } catch (error) {
                                                        setError(
                                                            error instanceof Error
                                                                ? error.message
                                                                : "Cannot use this quote.",
                                                        );
                                                    }
                                                }}
                                            >
                                                Use exchange estimate
                                            </Button>
                                            {quote.hour !== null && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => void showHistory(quote)}
                                                >
                                                    View exchange history
                                                </Button>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <p>
                                        {result.missing[id] ??
                                            "No captured exchange price. Enter a manual amount."}
                                    </p>
                                )}
                            </section>
                        );
                    })}
                {history && (
                    <section aria-label="Exchange price history" className="max-h-64 overflow-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr>
                                    <th>Observed hour (unaggregated)</th>
                                    <th>Price ({graph.currency})</th>
                                    <th>Units traded</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((row) => (
                                    <tr key={row.hour}>
                                        <td>{new Date(row.hour * 1000).toLocaleString()}</td>
                                        <td>{row.amount?.toPrecision(5) ?? "Unknown"}</td>
                                        <td>{row.volume ?? "Unknown"}</td>
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
