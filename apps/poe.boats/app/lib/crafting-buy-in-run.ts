import { exchangeCurrencyId, listingCurrencyId } from "@poe-tools/market";
import type {
    ExtensionMessage,
    ListingBatch,
    PageMessage,
    TradeSale,
} from "@poe-tools/trade-bridge";
import type { BuyInRates, BuyInStage } from "~/schemas/crafting-buy-in";
import { craftingExchangeResultSchema } from "~/schemas/crafting-exchange";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import {
    type BuyInStageSearch,
    buyInEntry,
    buyInFreshness,
    buyInStageKey,
    buyInStages,
    recordBuyInStage,
} from "./crafting-buy-in";
import { type CheckedSearch, type ListingSearch, stageDecision } from "./crafting-buy-in-price";

export type BuyInStageStep =
    | "queued"
    | "waiting"
    | "searching"
    | "fetching"
    | "checking"
    | "priced"
    | "no-listings"
    | "failed";
export type BuyInStageState = {
    stageId: string;
    name: string;
    step: BuyInStageStep;
    waitUntil?: string;
    message?: string;
};
export type BuyInRunState = {
    runId: string;
    stages: BuyInStageState[];
    finished: null | {
        outcome: "done" | "cancelled" | "stopped";
        reason?: string;
        signIn?: boolean;
        retryAt?: string;
    };
};

export type PricedStage = {
    stage: Omit<BuyInStage, "key" | "observedAt">;
    instant: CheckedSearch;
    inPerson: CheckedSearch | null;
};

export interface BuyInRunDependencies {
    send(message: PageMessage): void;
    graph(): CraftingGraph;
    save(graph: CraftingGraph): void;
    rates(currencies: string[]): Promise<BuyInRates>;
    price(
        graph: CraftingGraph,
        stageId: string,
        instant: ListingSearch,
        inPerson: ListingSearch | null,
        rates: BuyInRates,
    ): Promise<PricedStage>;
    onState(state: BuyInRunState): void;
    id?: () => string;
    now?: () => number;
}

/** A run with no message for this long after any announced wait is treated as stopped. */
const STALL_MS = 120_000;

type Collected = Record<TradeSale, ListingSearch | null>;

function collect(collected: Collected | undefined, batch: ListingBatch): Collected {
    const next: Collected = collected ?? { instant: null, "in-person": null };
    const prior = next[batch.sale];
    return {
        ...next,
        [batch.sale]: {
            sale: batch.sale,
            results: batch.total,
            available: batch.available,
            fetches: batch.fetches,
            listings: [...(prior?.listings ?? []), ...batch.listings],
        },
    };
}

/**
 * Project-currency value of one unit of each listing currency, from the latest exchange hour.
 * Currencies without an exchange quote are left out, so their listings stay unconverted.
 */
export async function fetchListingRates(
    graph: CraftingGraph,
    currencies: readonly string[],
    fetcher: typeof fetch = fetch,
): Promise<BuyInRates> {
    const quoteId = exchangeCurrencyId(graph.currency);
    const rates: BuyInRates = {};
    const items = new Map<string, string>();
    for (const currency of currencies) {
        const itemId = listingCurrencyId(currency, graph.game);
        if (!itemId) continue;
        if (itemId === quoteId) rates[currency] = 1;
        else items.set(currency, itemId);
    }
    if (!items.size || !graph.league) return rates;
    const response = await fetcher("/api/v1/crafting/market/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            game: graph.game,
            realm: graph.game === "poe2" ? "poe2" : "pc",
            league: graph.league,
            currency: graph.currency,
            itemIds: [...new Set(items.values())],
            conversion: "two-leg-exchange-v1",
        }),
    });
    if (!response.ok) return rates;
    const result = craftingExchangeResultSchema.parse(await response.json());
    for (const [currency, itemId] of items) {
        const quote = result.quotes[itemId];
        if (quote && quote.amount > 0) rates[currency] = quote.amount;
    }
    return rates;
}

/** Stages a run should search: searchable stages without a fresh price unless refreshing all. */
export function stagesToSearch(
    graph: CraftingGraph,
    searches: readonly BuyInStageSearch[],
    refreshAll: boolean,
    now: number,
) {
    const nodes = new Map(buyInStages(graph).map((node) => [node.id, node]));
    return searches.filter((search) => {
        const node = nodes.get(search.stageId);
        if (!node || !search.instant) return false;
        const entry = buyInEntry(graph, node);
        return refreshAll || !entry || buyInFreshness(entry, now) !== "fresh";
    });
}

/**
 * Drives one pricing run from the poe.boats page: starts it in the extension, checks each batch
 * of listings, tells the extension whether to fetch more, and saves each stage's price.
 */
export function createBuyInRun(dependencies: BuyInRunDependencies) {
    let state: BuyInRunState | null = null;
    let graphId = "";
    let includeInPerson = false;
    const collected = new Map<string, Collected>();
    const rates: BuyInRates = {};
    let queue = Promise.resolve();
    let lastActivity = 0;
    let waitUntil = 0;

    const publish = (edit: (stage: BuyInStageState) => BuyInStageState, stageId?: string) => {
        if (!state) return;
        state = {
            ...state,
            stages: state.stages.map((stage) =>
                stageId === undefined || stage.stageId === stageId ? edit(stage) : stage,
            ),
        };
        dependencies.onState(state);
    };

    async function ensureRates(listings: ListingSearch["listings"]) {
        const missing = [...new Set(listings.map((listing) => listing.price.currency))].filter(
            (currency) => !(currency in rates),
        );
        if (!missing.length) return;
        const found = await dependencies.rates(missing);
        for (const currency of missing) rates[currency] = found[currency] ?? 0;
    }

    const usableRates = () =>
        Object.fromEntries(Object.entries(rates).filter(([, rate]) => rate > 0));

    async function price(stageId: string, search: Collected) {
        await ensureRates([
            ...(search.instant?.listings ?? []),
            ...(search["in-person"]?.listings ?? []),
        ]);
        const empty: ListingSearch = {
            sale: "instant",
            results: 0,
            available: 0,
            fetches: 1,
            listings: [],
        };
        return dependencies.price(
            dependencies.graph(),
            stageId,
            search.instant ?? empty,
            search["in-person"],
            usableRates(),
        );
    }

    function save(stageId: string, priced: PricedStage, observedAt: string) {
        dependencies.save(
            recordBuyInStage(dependencies.graph(), stageId, priced.stage, observedAt),
        );
        publish(
            (stage) => ({
                ...stage,
                step: priced.stage.status === "priced" ? "priced" : "no-listings",
                waitUntil: undefined,
            }),
            stageId,
        );
    }

    async function onBatch(batch: ListingBatch) {
        if (!state || batch.runId !== state.runId) return;
        publish((stage) => ({ ...stage, step: "checking", waitUntil: undefined }), batch.stageId);
        const search = collect(collected.get(batch.stageId), batch);
        collected.set(batch.stageId, search);
        let decision: ReturnType<typeof stageDecision> = "done";
        try {
            const priced = await price(batch.stageId, search);
            const checked = batch.sale === "instant" ? priced.instant : priced.inPerson;
            decision = checked ? stageDecision(checked, includeInPerson) : "done";
            if (decision === "done") save(batch.stageId, priced, batch.receivedAt);
        } catch (error) {
            publish(
                (stage) => ({
                    ...stage,
                    step: "failed",
                    message: error instanceof Error ? error.message : "Cannot check listings.",
                }),
                batch.stageId,
            );
        }
        dependencies.send({ kind: "decide", runId: batch.runId, batchId: batch.batchId, decision });
    }

    /** Listings delivered after the page that started a run had closed. */
    async function onStored(batches: readonly ListingBatch[]) {
        const graph = dependencies.graph();
        const nodes = new Map(buyInStages(graph).map((node) => [node.id, node]));
        const byStage = new Map<string, { collected: Collected; receivedAt: string }>();
        for (const batch of [...batches].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
            const node = nodes.get(batch.stageId);
            if (!node || buyInStageKey(graph, node) !== batch.stageKey) continue;
            const prior = byStage.get(batch.stageId);
            byStage.set(batch.stageId, {
                collected: collect(prior?.collected, batch),
                receivedAt: batch.receivedAt,
            });
        }
        for (const [stageId, { collected: search, receivedAt }] of byStage) {
            const existing = buyInEntry(dependencies.graph(), nodes.get(stageId)!);
            if (existing && existing.observedAt >= receivedAt) continue;
            try {
                const priced = await price(stageId, search);
                dependencies.save(
                    recordBuyInStage(dependencies.graph(), stageId, priced.stage, receivedAt),
                );
            } catch {
                // A stored stage that can no longer be priced keeps its earlier price.
            }
        }
        dependencies.send({
            kind: "acknowledge",
            graphId: graph.id,
            batchIds: batches.map((batch) => batch.batchId),
        });
    }

    function handle(message: ExtensionMessage) {
        queue = queue.then(async () => {
            if (message.kind === "stored") {
                if (message.graphId === dependencies.graph().id) await onStored(message.batches);
                return;
            }
            if (!state || !("runId" in message) || message.runId !== state.runId) return;
            lastActivity = (dependencies.now ?? Date.now)();
            switch (message.kind) {
                case "progress":
                    waitUntil = message.waitUntil ? Date.parse(message.waitUntil) : 0;
                    publish(
                        (stage) => ({
                            ...stage,
                            step: message.step,
                            waitUntil: message.waitUntil,
                        }),
                        message.stageId,
                    );
                    return;
                case "batch":
                    await onBatch(message);
                    return;
                case "stageFailed":
                    publish(
                        (stage) => ({ ...stage, step: "failed", message: message.message }),
                        message.stageId,
                    );
                    return;
                case "runFinished": {
                    const { outcome, reason, signIn, retryAt } = message;
                    state = { ...state, finished: { outcome, reason, signIn, retryAt } };
                    publish((stage) =>
                        ["queued", "waiting", "searching", "fetching", "checking"].includes(
                            stage.step,
                        )
                            ? { ...stage, step: "failed", message: reason ?? "Not searched." }
                            : stage,
                    );
                    return;
                }
            }
        });
        return queue;
    }

    return {
        handle,
        get state() {
            return state;
        },
        /** Start a run for the given stage searches. Returns the run ID. */
        start(searches: readonly BuyInStageSearch[]) {
            const graph = dependencies.graph();
            if (!graph.league) throw new Error("Choose a trade league for this project.");
            const nodes = new Map(buyInStages(graph).map((node) => [node.id, node]));
            const stages = searches.flatMap((search) => {
                const node = nodes.get(search.stageId);
                return node && search.instant
                    ? [
                          {
                              stageId: search.stageId,
                              stageKey: buyInStageKey(graph, node),
                              name: search.name.slice(0, 120),
                              instant: search.instant.payload,
                              ...(search.inPerson ? { inPerson: search.inPerson.payload } : {}),
                          },
                      ]
                    : [];
            });
            if (!stages.length) throw new Error("No steps need a trade price.");
            graphId = graph.id;
            includeInPerson = Boolean(graph.buyIn?.includeInPerson);
            collected.clear();
            const runId = dependencies.id?.() ?? crypto.randomUUID();
            lastActivity = (dependencies.now ?? Date.now)();
            waitUntil = 0;
            state = {
                runId,
                finished: null,
                stages: stages.map((stage) => ({
                    stageId: stage.stageId,
                    name: stage.name,
                    step: "queued",
                })),
            };
            dependencies.onState(state);
            dependencies.send({
                kind: "startRun",
                runId,
                graphId,
                game: graph.game,
                league: graph.league,
                stages,
            });
            return runId;
        },
        cancel() {
            if (state && !state.finished)
                dependencies.send({ kind: "cancelRun", runId: state.runId });
        },
        /**
         * End a run the extension has stopped reporting on: nothing heard for two minutes beyond
         * any announced rate-limit wait. Returns true when the run was ended.
         */
        checkStalled(now: number) {
            if (!state || state.finished || now < Math.max(lastActivity, waitUntil) + STALL_MS)
                return false;
            void handle({
                kind: "runFinished",
                runId: state.runId,
                graphId,
                outcome: "stopped",
                reason: "The extension stopped responding. Reload the trade tab and try again.",
            });
            dependencies.send({ kind: "cancelRun", runId: state.runId });
            return true;
        },
    };
}
