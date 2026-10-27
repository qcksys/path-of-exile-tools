import type {
    BuyInComparison,
    BuyInFreshness,
    BuyInStage,
    CraftingBuyIn,
} from "~/schemas/crafting-buy-in";
import type { CraftingGraph, GraphAcquireNode, GraphCraftNode } from "~/schemas/crafting-graph";
import type { CraftingGraphResult } from "~/schemas/crafting-graph-result";
import type { CraftingTradeOptions, CraftingTradeResult } from "~/schemas/crafting-trade";
import { graphProductionOrder } from "./crafting-graph-validation";
import type { HistoricalCraftingRuntime } from "./crafting-runtime";
import {
    buildCraftingTradeSearch,
    type CraftingTradeCatalog,
    type loadCraftingTradeMetadata,
} from "./crafting-trade";

export const BUY_IN_FRESH_MS = 6 * 3_600_000;
export const BUY_IN_STALE_MS = 24 * 3_600_000;

/** Instant-buyout searches price every stage; in-person searches run only when enabled. */
export const BUY_IN_SEARCHES = {
    instant: { status: "securable", oneListingPerSeller: true },
    inPerson: { status: "online", listed: "1week", oneListingPerSeller: true },
} as const satisfies Record<string, CraftingTradeOptions>;

function fingerprint(text: string) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `v1:${text.length.toString(36)}:${hash.toString(36)}`;
}

/** Changes whenever the stage query, game, league or accounting currency changes. */
export function buyInStageKey(graph: CraftingGraph, node: GraphCraftNode) {
    return fingerprint(
        JSON.stringify([graph.game, graph.league ?? "", graph.currency, node.output]),
    );
}

/** Craft steps the calculation visits, in production order. Each is a stage that could be bought. */
export function buyInStages(graph: CraftingGraph): GraphCraftNode[] {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const active = new Set<string>();
    const visit = (id: string) => {
        if (active.has(id)) return;
        active.add(id);
        const node = nodes.get(id);
        if (!node) return;
        if (node.kind === "craft") for (const input of node.inputs) visit(input.source);
        else
            for (const alternative of node.alternatives)
                if (
                    alternative.kind === "production" &&
                    (node.choice.mode === "automatic" ||
                        node.choice.alternativeId === alternative.id)
                )
                    visit(alternative.nodeId);
    };
    visit(graph.entry);
    return graphProductionOrder(graph).filter(
        (node): node is GraphCraftNode => node.kind === "craft" && active.has(node.id),
    );
}

export const buyInSearchable = (node: GraphCraftNode) => node.output.groups.length > 0;

/** The stored price for a stage, if it was taken for the stage's current query and settings. */
export function buyInEntry(graph: CraftingGraph, node: GraphCraftNode): BuyInStage | null {
    const entry = graph.buyIn?.stages[node.id];
    if (!entry || entry.key !== buyInStageKey(graph, node)) return null;
    if (entry.sale === "in-person" && !graph.buyIn?.includeInPerson) return null;
    return entry;
}

export function buyInFreshness(entry: Pick<BuyInStage, "observedAt">, now: number): BuyInFreshness {
    const age = now - Date.parse(entry.observedAt);
    return age < BUY_IN_FRESH_MS ? "fresh" : age < BUY_IN_STALE_MS ? "aging" : "stale";
}

function withBuyIn(graph: CraftingGraph, edit: (buyIn: CraftingBuyIn) => CraftingBuyIn) {
    return {
        ...graph,
        buyIn: edit(graph.buyIn ?? { includeInPerson: false, stages: {} }),
    };
}

export function setBuyInIncludeInPerson(graph: CraftingGraph, includeInPerson: boolean) {
    return withBuyIn(graph, (buyIn) => ({ ...buyIn, includeInPerson }));
}

/** Save a stage's trade price on the graph, replacing any earlier price for that stage. */
export function recordBuyInStage(
    graph: CraftingGraph,
    nodeId: string,
    priced: Omit<BuyInStage, "key" | "observedAt">,
    observedAt: string,
): CraftingGraph {
    const node = graph.nodes.find((entry) => entry.id === nodeId);
    if (node?.kind !== "craft") throw new Error("Choose a craft step to price.");
    if (priced.price && priced.price.currency !== graph.currency)
        throw new Error("Convert stage prices to the project's currency before saving them.");
    return withBuyIn(graph, (buyIn) => ({
        ...buyIn,
        stages: {
            ...buyIn.stages,
            [nodeId]: { ...priced, key: buyInStageKey(graph, node), observedAt },
        },
    }));
}

export type BuyInStageSearch = {
    stageId: string;
    name: string;
    instant: CraftingTradeResult | null;
    inPerson: CraftingTradeResult | null;
    error?: string;
};

/** Trade searches for every stage, using the same translation as the graph's trade links. */
export function buyInTradeSearches(
    graph: CraftingGraph,
    catalog: CraftingTradeCatalog,
    metadata: Awaited<ReturnType<typeof loadCraftingTradeMetadata>>,
): BuyInStageSearch[] {
    const league = graph.league?.trim();
    return buyInStages(graph).map((node) => {
        const stage = { stageId: node.id, name: node.name, instant: null, inPerson: null };
        if (!league) return { ...stage, error: "Choose a trade league for this project." };
        if (!buyInSearchable(node))
            return { ...stage, error: "This step has no item requirements to search for." };
        try {
            const search = (options: CraftingTradeOptions) =>
                buildCraftingTradeSearch(catalog, node.output, league, metadata, options);
            return {
                ...stage,
                instant: search(BUY_IN_SEARCHES.instant),
                inPerson: graph.buyIn?.includeInPerson ? search(BUY_IN_SEARCHES.inPerson) : null,
            };
        } catch (error) {
            return {
                ...stage,
                error: error instanceof Error ? error.message : "Cannot build this search.",
            };
        }
    });
}

/**
 * A copy of the graph in which the stage's output is bought at its trade price instead of
 * crafted. Consumers of the stage take the purchase; steps that only fed the stage are no longer
 * visited. Items recovered into those steps after the purchase are not credited.
 */
export function buyInGraph(
    graph: CraftingGraph,
    stageId: string,
    entry: BuyInStage,
): CraftingGraph {
    const stage = graph.nodes.find((node) => node.id === stageId);
    if (stage?.kind !== "craft") throw new Error("Choose a craft step to buy.");
    if (!entry.price || !entry.item) throw new Error("This stage has no trade price.");
    if (graph.nodes.length >= 100)
        throw new Error("The project has too many steps to add a purchase.");
    const ids = new Set(graph.nodes.map((node) => node.id));
    let id = `buy-in-${stageId}`.slice(0, 100);
    for (let suffix = 2; ids.has(id); suffix++) id = `buy-in-${suffix}-${stageId}`.slice(0, 100);
    const purchase: GraphAcquireNode = {
        kind: "acquire",
        id,
        name: `Buy: ${stage.name}`.slice(0, 120),
        output: stage.output,
        alternatives: [
            {
                kind: "purchase",
                id: "trade",
                name: "Trade listing",
                item: entry.item,
                price: {
                    amount: entry.price.amount,
                    currency: entry.price.currency,
                    source: "manual",
                    observedAt: entry.observedAt,
                    confidence: null,
                    samples: entry.counts.matching,
                },
            },
            { kind: "production", id: "craft", name: stage.name, nodeId: stageId },
        ],
        choice: { mode: "pinned", alternativeId: "trade" },
    };
    const { buyIn: _, ...rest } = graph;
    return {
        ...rest,
        entry: graph.entry === stageId ? id : graph.entry,
        nodes: [
            ...graph.nodes.map((node) =>
                node.kind === "craft"
                    ? {
                          ...node,
                          inputs: node.inputs.map((input) =>
                              input.source === stageId ? { ...input, source: id } : input,
                          ),
                      }
                    : node,
            ),
            purchase,
        ],
    };
}

const costPerSuccess = (result: CraftingGraphResult) =>
    result.complete && result.meanCost !== null && result.probability
        ? result.meanCost / result.probability
        : null;

function summary(result: CraftingGraphResult) {
    return {
        total: costPerSuccess(result),
        probability: result.complete ? result.probability : null,
        meanActions: result.meanActions,
        missingPrices: result.missingPrices,
    };
}

export type BuyInRun = { stageId: string; result?: CraftingGraphResult; error?: string };

/** The stages with a usable trade price, which each need their own calculation. */
export function pricedBuyInStages(graph: CraftingGraph) {
    return buyInStages(graph).flatMap((node) => {
        const entry = buyInEntry(graph, node);
        return entry?.price && entry.item ? [{ node, entry }] : [];
    });
}

/**
 * Compare crafting from scratch with buying at each priced stage, by expected cost per successful
 * final outcome.
 */
export function compareBuyIn(
    graph: CraftingGraph,
    scratch: CraftingGraphResult,
    runs: readonly BuyInRun[],
    now: number,
): BuyInComparison {
    const byStage = new Map(runs.map((run) => [run.stageId, run]));
    const estimates = new Map(scratch.estimates.map((estimate) => [estimate.nodeId, estimate]));
    const stages = buyInStages(graph).map((node) => {
        const entry = buyInEntry(graph, node);
        const run = byStage.get(node.id);
        const empty = { total: null, probability: null, meanActions: null, missingPrices: [] };
        return {
            stageId: node.id,
            name: node.name,
            craftToHere: estimates.get(node.id)?.expectedCost ?? null,
            status: !buyInSearchable(node)
                ? ("not-searchable" as const)
                : (entry?.status ?? ("unpriced" as const)),
            price: entry?.price ?? null,
            sale: entry?.sale ?? null,
            confidence: entry?.confidence ?? null,
            observedAt: entry?.observedAt ?? null,
            freshness: entry ? buyInFreshness(entry, now) : null,
            ...(run?.result ? summary(run.result) : empty),
            ...(run?.error ? { error: run.error } : {}),
        };
    });
    const base = summary(scratch);
    let recommendation: BuyInComparison["recommendation"] =
        base.total === null ? null : { stageId: null, total: base.total };
    for (const stage of stages)
        if (stage.total !== null && (!recommendation || stage.total < recommendation.total))
            recommendation = { stageId: stage.stageId, total: stage.total };
    const chosen = stages.find((stage) => stage.stageId === recommendation?.stageId);
    return {
        currency: graph.currency,
        scratch: base,
        stages,
        recommendation,
        stalePrices: chosen?.freshness === "stale",
    };
}

/**
 * Calculate the graph from scratch and once per priced stage with the retained engine, then
 * compare them. Returns null when cancelled between batches.
 */
export async function calculateBuyIn(
    runtime: HistoricalCraftingRuntime,
    catalog: unknown,
    graph: CraftingGraph,
    options: {
        simulation?: { estimateIterations?: number; workLimit?: number };
        now?: number;
        onProgress?: (completed: number, total: number) => void;
        cancelled?: () => boolean;
    } = {},
): Promise<BuyInComparison | null> {
    const priced = pricedBuyInStages(graph);
    const total = priced.length + 1;
    const run = async (input: CraftingGraph) => {
        const simulation = runtime.createSimulation(catalog, input, options.simulation);
        while (!simulation.runBatch()) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (options.cancelled?.()) return null;
        }
        return simulation.result();
    };
    const scratch = await run(graph);
    if (!scratch) return null;
    options.onProgress?.(1, total);
    const runs: BuyInRun[] = [];
    for (const { node, entry } of priced) {
        try {
            const result = await run(buyInGraph(graph, node.id, entry));
            if (!result) return null;
            runs.push({ stageId: node.id, result });
        } catch (error) {
            runs.push({
                stageId: node.id,
                error: error instanceof Error ? error.message : "Cannot calculate this purchase.",
            });
        }
        options.onProgress?.(runs.length + 1, total);
    }
    return compareBuyIn(graph, scratch, runs, options.now ?? Date.now());
}
