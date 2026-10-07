import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { FormSelect, FormSelectItem } from "~/components/ui/form-select";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { liveExchangePrices } from "~/lib/crafting-exchange";
import { livePurchasePrices } from "~/lib/crafting-market";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import {
    type CraftingGraphResult,
    craftingGraphResultSchema,
} from "~/schemas/crafting-graph-result";
import { craftingMarketSnapshotsResultSchema } from "~/schemas/crafting-market";
import { graphControl } from "./graph-query-editor";

interface CostPoint {
    at: number;
    result: CraftingGraphResult | null;
    issues: string[];
    oldestObservation?: string;
    itemConfidence: number | null;
}

function calculateSnapshot(graph: CraftingGraph, signal: AbortSignal) {
    return new Promise<CraftingGraphResult>((resolve, reject) => {
        const worker = new Worker("/game-data/history/worker.mjs", { type: "module" });
        const finish = (result?: CraftingGraphResult, error?: string) => {
            worker.terminate();
            signal.removeEventListener("abort", cancel);
            if (result) resolve(result);
            else reject(new Error(error ?? "Historical calculation failed."));
        };
        const cancel = () => finish(undefined, "History calculation cancelled.");
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) {
            cancel();
            return;
        }
        worker.onerror = (event) => finish(undefined, event.message);
        worker.onmessage = ({ data }) => {
            if (data.type === "error") finish(undefined, data.error);
            if (data.type === "done") {
                const parsed = craftingGraphResultSchema.safeParse(data.result);
                if (parsed.success) finish(parsed.data);
                else finish(undefined, "Invalid historical calculation result.");
            }
        };
        worker.postMessage({
            type: "calculate",
            graph,
            options: { estimateIterations: 100, workLimit: 50_000 },
        });
    });
}

function cost(point: CostPoint) {
    return point.result?.complete ? point.result.meanCost : null;
}

function HistoryChart({ points, currency }: { points: CostPoint[]; currency: string }) {
    const values = points.flatMap((point) => (cost(point) === null ? [] : [cost(point)!]));
    if (!values.length) return null;
    const maximum = Math.max(...values, 1);
    const start = points[0]!.at;
    const duration = Math.max(1, points.at(-1)!.at - start);
    const segments: string[][] = [[]];
    for (const point of points) {
        const value = cost(point);
        if (value === null) segments.push([]);
        else
            segments
                .at(-1)!
                .push(
                    `${20 + ((point.at - start) / duration) * 560},${150 - (value / maximum) * 130}`,
                );
    }
    return (
        <svg
            viewBox="0 0 600 175"
            className="h-44 w-full text-primary"
            role="img"
            aria-label={`Historical expected process cost in ${currency}; values are listed below`}
        >
            <path d="M20 10V150H580" fill="none" stroke="currentColor" opacity="0.2" />
            {segments
                .filter((segment) => segment.length)
                .map((segment) => (
                    <polyline
                        key={segment.join(" ")}
                        points={segment.join(" ")}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    />
                ))}
            {points.map((point) =>
                cost(point) === null ? null : (
                    <circle
                        key={point.at}
                        cx={20 + ((point.at - start) / duration) * 560}
                        cy={150 - (cost(point)! / maximum) * 130}
                        r="3"
                        fill="currentColor"
                    />
                ),
            )}
            <text x="24" y="15" fontSize="11" fill="currentColor">
                {maximum.toFixed(2)} {currency}
            </text>
            <text x="24" y="165" fontSize="11" fill="currentColor">
                0
            </text>
        </svg>
    );
}

export function ProcessCostHistory({ graph }: { graph: CraftingGraph }) {
    const [points, setPoints] = useState<CostPoint[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const active = useRef<AbortController | null>(null);
    // biome-ignore lint/correctness/useExhaustiveDependencies: Any project edit invalidates these historical estimates and cancels their worker.
    useEffect(() => {
        setPoints([]);
        setBusy(false);
        setError("");
        return () => active.current?.abort();
    }, [graph]);
    async function run(form: HTMLFormElement) {
        active.current?.abort();
        const controller = new AbortController();
        active.current = controller;
        setPoints([]);
        setBusy(true);
        setError("");
        try {
            const data = new FormData(form);
            const start = Date.parse(`${data.get("start")}T00:00:00Z`) / 1000;
            const end = Date.parse(`${data.get("end")}T00:00:00Z`) / 1000;
            const count = Number(data.get("points"));
            if (!Number.isFinite(start) || !Number.isFinite(end) || start > end)
                throw new Error("Choose a valid start and end date.");
            const hours = [
                ...new Set(
                    Array.from(
                        { length: count },
                        (_, index) =>
                            Math.floor((start + ((end - start) * index) / (count - 1)) / 3600) *
                            3600,
                    ),
                ),
            ];
            const response = await fetch("/api/v1/crafting/market/snapshots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ graph, hours }),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error("Historical prices could not be loaded.");
            const snapshots = craftingMarketSnapshotsResultSchema.parse(await response.json());
            for (const snapshot of snapshots.points) {
                if (controller.signal.aborted) return;
                const point: CostPoint = {
                    at: snapshot.at,
                    result: null,
                    issues: snapshot.issues,
                    itemConfidence: null,
                };
                if (snapshot.graph) {
                    const itemPrices = livePurchasePrices(snapshot.graph).flatMap(
                        ({ alternative }) => (alternative.price ? [alternative.price] : []),
                    );
                    const prices = [
                        ...itemPrices,
                        ...liveExchangePrices(snapshot.graph).flatMap(({ id }) =>
                            snapshot.graph!.prices[id] ? [snapshot.graph!.prices[id]!] : [],
                        ),
                    ];
                    point.oldestObservation = prices
                        .flatMap((price) => (price.observedAt ? [price.observedAt] : []))
                        .sort()[0];
                    const confidence = itemPrices.flatMap((price) =>
                        price.confidence === null ? [] : [price.confidence],
                    );
                    point.itemConfidence = confidence.length ? Math.min(...confidence) : null;
                    try {
                        point.result = await calculateSnapshot(snapshot.graph, controller.signal);
                        if (!point.result.complete)
                            point.issues.push("Calculation incomplete; no cost plotted.");
                        if (point.result.missingPrices.length)
                            point.issues.push(
                                `Missing prices: ${point.result.missingPrices.join(", ")}`,
                            );
                        if (Object.keys(point.result.errors).length)
                            point.issues.push(...Object.keys(point.result.errors));
                    } catch (error) {
                        point.issues.push(
                            error instanceof Error ? error.message : "Calculation failed.",
                        );
                    }
                }
                if (controller.signal.aborted) return;
                setPoints((previous) => [...previous, point]);
            }
        } catch (error) {
            if (!controller.signal.aborted)
                setError(error instanceof Error ? error.message : "History failed.");
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    return (
        <details className="rounded-lg border p-4 text-sm">
            <summary className="cursor-pointer font-medium">Process cost history</summary>
            <p className="my-3 text-xs text-muted-foreground">
                Recalculate this process with observations at or before each sampled UTC hour.
                Manual prices, sale assumptions and crafting rules stay fixed. Missing market data
                creates a gap. Observations may be older than the sample date; asking-price
                confidence is a heuristic, and exchange confidence is uncalibrated. Costs are
                sampled estimates; their sampling intervals do not include market-price uncertainty.
            </p>
            <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    void run(event.currentTarget);
                }}
            >
                <Label>
                    History start (UTC)
                    <Input
                        className={graphControl}
                        type="date"
                        name="start"
                        required
                        defaultValue={new Date(Date.now() - 7 * 86400000)
                            .toISOString()
                            .slice(0, 10)}
                    />
                </Label>
                <Label>
                    History end (UTC)
                    <Input
                        className={graphControl}
                        type="date"
                        name="end"
                        required
                        defaultValue={new Date().toISOString().slice(0, 10)}
                    />
                </Label>
                <Label>
                    History samples
                    <FormSelect className={graphControl} name="points" defaultValue="8">
                        <FormSelectItem value="2">2</FormSelectItem>
                        <FormSelectItem value="8">8</FormSelectItem>
                        <FormSelectItem value="24">24</FormSelectItem>
                    </FormSelect>
                </Label>
                <Button type="submit" disabled={busy}>
                    Calculate cost history
                </Button>
                {busy && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            active.current?.abort();
                            setBusy(false);
                        }}
                    >
                        Stop history calculation
                    </Button>
                )}
            </form>
            {busy && (
                <p role="status" className="mt-3">
                    Calculating historical samples…
                </p>
            )}
            {error && (
                <p role="alert" className="mt-3 text-destructive">
                    {error}
                </p>
            )}
            {points.length > 0 && (
                <section aria-label="Historical process costs" className="mt-4 overflow-x-auto">
                    <HistoryChart points={points} currency={graph.currency} />
                    <table className="w-full text-left text-xs">
                        <caption className="sr-only">
                            Expected cost per process using historical market observations and fixed
                            manual assumptions
                        </caption>
                        <thead>
                            <tr>
                                <th className="p-2">UTC hour</th>
                                <th className="p-2">Expected cost ({graph.currency})</th>
                                <th className="p-2">Cost sampling interval</th>
                                <th className="p-2">Oldest price observation</th>
                                <th className="p-2">Lowest item confidence</th>
                                <th className="p-2">Issues</th>
                            </tr>
                        </thead>
                        <tbody>
                            {points.map((point) => (
                                <tr key={point.at} className="border-t">
                                    <td className="p-2 whitespace-nowrap">
                                        {new Date(point.at * 1000)
                                            .toISOString()
                                            .slice(0, 16)
                                            .replace("T", " ")}
                                    </td>
                                    <td className="p-2">
                                        {cost(point)?.toFixed(2) ?? "Unavailable"}
                                    </td>
                                    <td className="p-2">
                                        {point.result?.complete && point.result.costInterval
                                            ? point.result.costInterval
                                                  .map((value) => value.toFixed(2))
                                                  .join("–")
                                            : "Unavailable"}
                                    </td>
                                    <td className="p-2">
                                        {point.oldestObservation?.slice(0, 16).replace("T", " ") ??
                                            "No market observation"}
                                    </td>
                                    <td className="p-2">
                                        {point.itemConfidence === null
                                            ? "Uncalibrated / not applicable"
                                            : `${(point.itemConfidence * 100).toFixed(0)}%`}
                                    </td>
                                    <td className="p-2">{point.issues.join(" ") || "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
        </details>
    );
}
