import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { CurrencyLabel } from "~/components/currency-label";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "~/components/ui/table";
import {
    type BuyInStageSearch,
    buyInEntry,
    buyInFreshness,
    buyInStages,
    buyInTradeSearches,
    setBuyInIncludeInPerson,
} from "~/lib/crafting-buy-in";
import {
    type BuyInRunState,
    type BuyInStageStep,
    createBuyInRun,
    fetchListingRates,
    type PricedStage,
    stagesToSearch,
} from "~/lib/crafting-buy-in-run";
import { loadCraftingTradeMetadata } from "~/lib/crafting-trade";
import { createTradeExtensionClient } from "~/lib/trade-extension";
import type { CraftingCatalog } from "~/schemas/crafting";
import {
    type BuyInComparison,
    type BuyInRates,
    type BuyInStage,
    buyInComparisonSchema,
} from "~/schemas/crafting-buy-in";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { graphControl } from "./graph-query-editor";

const WORKER_URL = "/game-data/history/worker.mjs";

const stepLabels: Record<BuyInStageStep, string> = {
    queued: "Queued",
    waiting: "Waiting for the trade site's rate limit",
    searching: "Searching",
    fetching: "Fetching listings",
    checking: "Checking listings",
    priced: "Priced",
    "no-listings": "No matching listings",
    failed: "Failed",
};

function workerRequest<T>(
    worker: Worker,
    message: Record<string, unknown>,
    done: string,
    onMessage?: (data: Record<string, unknown>) => void,
) {
    return new Promise<T>((resolve, reject) => {
        const requestId = crypto.randomUUID();
        const listener = ({ data }: MessageEvent) => {
            if (data?.requestId !== requestId) return;
            if (data.type === "error") {
                worker.removeEventListener("message", listener);
                reject(new Error(String(data.error)));
            } else if (data.type === done) {
                worker.removeEventListener("message", listener);
                resolve(data as T);
            } else onMessage?.(data);
        };
        worker.addEventListener("message", listener);
        worker.postMessage({ ...message, requestId });
    });
}

function Money({
    amount,
    currency,
    game,
}: {
    amount: number;
    currency: string;
    game: CraftingGraph["game"];
}) {
    return (
        <span className="inline-flex items-center gap-1 tabular-nums">
            {amount.toLocaleString(undefined, { maximumFractionDigits: amount < 10 ? 2 : 0 })}
            <CurrencyLabel currency={currency} game={game} iconOnly />
        </span>
    );
}

function age(observedAt: string, now: number) {
    const hours = Math.floor((now - Date.parse(observedAt)) / 3_600_000);
    return hours < 1
        ? "under an hour ago"
        : hours < 48
          ? `${hours} h ago`
          : `${Math.floor(hours / 24)} days ago`;
}

function priceDetails(entry: BuyInStage) {
    const { counts } = entry;
    const parts = [
        `${counts.matching} matching of ${counts.fetched} checked`,
        `${counts.nearPrice} within 20%`,
    ];
    if (counts.notMatching) parts.push(`${counts.notMatching} not matching`);
    if (counts.unreadable) parts.push(`${counts.unreadable} unreadable`);
    if (counts.unconverted) parts.push(`${counts.unconverted} without an exchange rate`);
    if (counts.bait) parts.push(`${counts.bait} dropped as bait`);
    return parts.join(", ");
}

export function GraphBuyIn({
    graph,
    catalog,
    onChange,
}: {
    graph: CraftingGraph;
    catalog?: CraftingCatalog;
    onChange: (graph: CraftingGraph) => void;
}) {
    const latest = useRef(graph);
    latest.current = graph;
    const change = useRef(onChange);
    change.current = onChange;
    const [extension, setExtension] = useState<string | null | undefined>(undefined);
    const [searches, setSearches] = useState<BuyInStageSearch[]>();
    const [run, setRun] = useState<BuyInRunState | null>(null);
    const [comparison, setComparison] = useState<BuyInComparison>();
    const [comparing, setComparing] = useState<string>();
    const [error, setError] = useState("");
    const [now, setNow] = useState(() => Date.now());
    const priceWorker = useRef<Worker | null>(null);
    const compareWorker = useRef<Worker | null>(null);
    const runner = useRef<ReturnType<typeof createBuyInRun> | null>(null);
    const running = Boolean(run && !run.finished);

    const save = (next: CraftingGraph) => {
        latest.current = next;
        change.current(next);
    };

    useEffect(() => {
        const bridge = createTradeExtensionClient();
        runner.current = createBuyInRun({
            send: bridge.send,
            graph: () => latest.current,
            save,
            rates: (currencies) => fetchListingRates(latest.current, currencies),
            price: (current, stageId, instant, inPerson, rates: BuyInRates) => {
                priceWorker.current ??= new Worker(WORKER_URL, { type: "module" });
                return workerRequest<PricedStage>(
                    priceWorker.current,
                    {
                        type: "buy-in-price",
                        graph: current,
                        stageId,
                        instant,
                        inPerson,
                        rates,
                    },
                    "buy-in-priced",
                );
            },
            onState: setRun,
        });
        const stop = bridge.subscribe((message) => void runner.current?.handle(message));
        let active = true;
        void bridge.detect().then((version) => {
            if (!active) return;
            setExtension(version);
            if (version) bridge.send({ kind: "collect", graphId: latest.current.id });
        });
        const timer = window.setInterval(() => {
            setNow(Date.now());
            runner.current?.checkStalled(Date.now());
        }, 30_000);
        return () => {
            active = false;
            runner.current?.cancel();
            stop();
            bridge.close();
            window.clearInterval(timer);
            priceWorker.current?.terminate();
            compareWorker.current?.terminate();
        };
    }, [graph.id]);

    const searchKey = JSON.stringify([
        graph.game,
        graph.league,
        graph.buyIn?.includeInPerson,
        buyInStages(graph).map((node) => [node.id, node.name, node.output]),
    ]);
    useEffect(() => {
        setSearches(undefined);
        if (!catalog) return;
        let active = true;
        void loadCraftingTradeMetadata(graph.game)
            .then((metadata) => {
                if (active) setSearches(buyInTradeSearches(latest.current, catalog, metadata));
            })
            .catch(() => active && setError("Could not load trade definitions. Try again."));
        return () => {
            active = false;
        };
    }, [catalog, searchKey]);

    const pending = useMemo(
        () => (searches ? stagesToSearch(graph, searches, false, now) : []),
        [graph, searches, now],
    );

    function start(refreshAll: boolean) {
        if (!searches || !runner.current) return;
        setError("");
        setComparison(undefined);
        try {
            runner.current.start(stagesToSearch(latest.current, searches, refreshAll, Date.now()));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Cannot start pricing.");
        }
    }

    async function compare() {
        compareWorker.current?.terminate();
        const worker = new Worker(WORKER_URL, { type: "module" });
        compareWorker.current = worker;
        setError("");
        setComparing("Calculating…");
        try {
            const result = await workerRequest<{ comparison: unknown }>(
                worker,
                {
                    type: "buy-in-compare",
                    graph: latest.current,
                    options: { estimateIterations: 100, workLimit: 50_000 },
                },
                "buy-in-compared",
                (data) =>
                    data.type === "buy-in-progress" &&
                    setComparing(`Calculating ${data.completed} of ${data.total}…`),
            );
            setComparison(buyInComparisonSchema.parse(result.comparison));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The comparison failed.");
        } finally {
            if (compareWorker.current === worker) {
                worker.terminate();
                compareWorker.current = null;
                setComparing(undefined);
            }
        }
    }

    useEffect(() => {
        if (run?.finished?.outcome === "done") void compare();
    }, [run?.finished]);

    const stages = buyInStages(graph);
    const byStage = new Map(comparison?.stages.map((stage) => [stage.stageId, stage]));
    const runSteps = new Map(run?.stages.map((stage) => [stage.stageId, stage]));
    const searchUrls = new Map(searches?.map((search) => [search.stageId, search]));
    return (
        <details className="rounded-lg border p-4 text-sm" open>
            <summary className="cursor-pointer font-medium">Buy-in prices</summary>
            <p className="my-3 text-xs text-muted-foreground">
                Compare crafting each step with buying an item at that step from the official trade
                site. The poe.boats browser extension runs the searches in your own browser with
                your pathofexile.com session; poe.boats never sees your session. Instant-buyout
                listings price each step at the cheapest match.
            </p>
            {extension === null && (
                <p className="mb-3 text-xs">
                    Install the poe.boats extension to price steps automatically.{" "}
                    <Link className="underline" to="/extension">
                        How it works and what it collects
                    </Link>
                </p>
            )}
            <div className="mb-3 flex flex-wrap items-center gap-3">
                <Button
                    size="sm"
                    disabled={!extension || running || !searches || !graph.league}
                    onClick={() => start(false)}
                >
                    {running
                        ? "Pricing…"
                        : `Price steps${pending.length ? ` (${pending.length})` : ""}`}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={!extension || running || !searches || !graph.league}
                    onClick={() => start(true)}
                >
                    Refresh all
                </Button>
                {running && (
                    <Button size="sm" variant="ghost" onClick={() => runner.current?.cancel()}>
                        Cancel
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="outline"
                    disabled={running || Boolean(comparing)}
                    onClick={() => void compare()}
                >
                    {comparing ?? "Compare"}
                </Button>
                <Label className="flex items-center gap-2 text-xs">
                    <Checkbox
                        checked={Boolean(graph.buyIn?.includeInPerson)}
                        disabled={running}
                        onCheckedChange={(checked) =>
                            save(setBuyInIncludeInPerson(latest.current, checked === true))
                        }
                    />
                    Include in-person listings for steps with no instant buyout
                </Label>
            </div>
            <Label className="mb-3 block max-w-xs text-xs">
                Trade league
                <Input
                    key={graph.league ?? ""}
                    className={graphControl}
                    defaultValue={graph.league ?? ""}
                    placeholder="Enter the league name"
                    disabled={running}
                    onBlur={(event) => {
                        const league = event.target.value.trim();
                        if (league !== (graph.league ?? ""))
                            save({ ...latest.current, league: league || undefined });
                    }}
                />
            </Label>
            {run?.finished && run.finished.outcome !== "done" && (
                <p role="status" className="mb-3 text-xs text-destructive">
                    {run.finished.reason ?? "Pricing stopped."}
                    {run.finished.retryAt &&
                        ` Try again after ${new Date(run.finished.retryAt).toLocaleTimeString()}.`}
                </p>
            )}
            {error && (
                <p role="alert" className="mb-3 text-xs text-destructive">
                    {error}
                </p>
            )}
            {comparison?.recommendation && (
                <p className="mb-3">
                    {comparison.recommendation.stageId === null
                        ? "Crafting from scratch is cheapest"
                        : `Buy in at “${comparison.stages.find((stage) => stage.stageId === comparison.recommendation?.stageId)?.name}”`}
                    {": "}
                    <Money
                        amount={comparison.recommendation.total}
                        currency={comparison.currency}
                        game={graph.game}
                    />{" "}
                    per finished item.
                    {comparison.stalePrices && " This price is more than a day old; refresh it."}
                </p>
            )}
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Step</TableHead>
                        <TableHead>Craft to here</TableHead>
                        <TableHead>Trade price</TableHead>
                        <TableHead>Total if bought here</TableHead>
                        <TableHead>Success</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {comparison && (
                        <TableRow>
                            <TableCell>Craft from scratch</TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell>
                                {comparison.scratch.total === null ? (
                                    "Unknown"
                                ) : (
                                    <Money
                                        amount={comparison.scratch.total}
                                        currency={comparison.currency}
                                        game={graph.game}
                                    />
                                )}
                            </TableCell>
                            <TableCell>
                                {comparison.scratch.probability === null
                                    ? ""
                                    : `${(comparison.scratch.probability * 100).toFixed(1)}%`}
                            </TableCell>
                        </TableRow>
                    )}
                    {stages.map((node) => {
                        const entry = buyInEntry(graph, node);
                        const row = byStage.get(node.id);
                        const step = runSteps.get(node.id);
                        const search = searchUrls.get(node.id);
                        const url = search?.instant?.url;
                        return (
                            <TableRow key={node.id}>
                                <TableCell className="align-top">
                                    <div className="font-medium">{node.name}</div>
                                    {step && !["priced", "no-listings"].includes(step.step) && (
                                        <div className="text-xs text-muted-foreground">
                                            {stepLabels[step.step]}
                                            {step.waitUntil &&
                                                ` until ${new Date(step.waitUntil).toLocaleTimeString()}`}
                                            {step.message && `: ${step.message}`}
                                        </div>
                                    )}
                                    {search?.error && (
                                        <div className="text-xs text-muted-foreground">
                                            {search.error}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell className="align-top">
                                    {row?.craftToHere != null && (
                                        <Money
                                            amount={row.craftToHere}
                                            currency={graph.currency}
                                            game={graph.game}
                                        />
                                    )}
                                </TableCell>
                                <TableCell className="align-top">
                                    {entry?.price ? (
                                        <>
                                            <Money
                                                amount={entry.price.amount}
                                                currency={entry.price.currency}
                                                game={graph.game}
                                            />
                                            <div className="text-xs text-muted-foreground">
                                                {entry.sale === "instant"
                                                    ? "Instant buyout"
                                                    : `In person, ${entry.confidence} confidence`}
                                                {" · "}
                                                <span
                                                    className={
                                                        buyInFreshness(entry, now) === "stale"
                                                            ? "text-destructive"
                                                            : undefined
                                                    }
                                                >
                                                    {age(entry.observedAt, now)}
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {priceDetails(entry)}
                                            </div>
                                        </>
                                    ) : entry?.status === "no-listings" ? (
                                        <div className="text-xs text-muted-foreground">
                                            No matching{" "}
                                            {graph.buyIn?.includeInPerson ? "" : "instant-buyout "}
                                            listings ({age(entry.observedAt, now)}).{" "}
                                            {priceDetails(entry)}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">
                                            Not priced
                                        </span>
                                    )}
                                    {url && (
                                        <a
                                            className="block text-xs underline"
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Open search
                                        </a>
                                    )}
                                    {search?.instant?.fidelity === "approximate" && (
                                        <div className="text-xs text-muted-foreground">
                                            Approximate search; listings are re-checked against this
                                            step.
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell className="align-top">
                                    {row?.total != null && (
                                        <Money
                                            amount={row.total}
                                            currency={comparison!.currency}
                                            game={graph.game}
                                        />
                                    )}
                                    {row?.error && (
                                        <div className="text-xs text-destructive">{row.error}</div>
                                    )}
                                    {row && row.total === null && !row.error && entry?.price && (
                                        <div className="text-xs text-muted-foreground">
                                            Unknown
                                            {row.missingPrices.length
                                                ? `: missing ${row.missingPrices.length} price(s)`
                                                : ""}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell className="align-top">
                                    {row?.probability != null &&
                                        `${(row.probability * 100).toFixed(1)}%`}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </details>
    );
}
