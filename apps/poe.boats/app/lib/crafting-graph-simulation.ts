import { matchItem } from "@poe-tools/item-query";
import type { CraftingCatalog } from "../schemas/crafting";
import type { AcquisitionComparison, AcquisitionEstimate } from "../schemas/crafting-economy";
import type { CraftingGraph, GraphNode } from "../schemas/crafting-graph";
import type {
    CraftingGraphResult,
    GraphModelOdds,
    GraphProductionEstimate,
} from "../schemas/crafting-graph-result";

export type {
    CraftingGraphResult,
    GraphProductionEstimate,
} from "../schemas/crafting-graph-result";

import { compareAcquisition } from "./crafting-acquisition";
import { CraftingEngine, seededRandom } from "./crafting-engine";
import {
    CraftingGraphTrial,
    type GraphNodeVisits,
    type GraphTrialResult,
} from "./crafting-graph-trial";
import { graphProductionOrder, validateCraftingGraph } from "./crafting-graph-validation";
import { createCraftingItemQuery } from "./crafting-item-query";
import { wilsonInterval } from "./crafting-simulation";

interface Totals {
    trials: number;
    returned: number;
    successes: number;
    actions: number;
    cost: number;
    costSquared: number;
    revenue: number;
    excludedRecovery: number;
    truncated: number;
    errors: Record<string, number>;
    outcomes: Record<string, number>;
    outcomeMatches: Record<string, number>;
    missingPrices: Set<string>;
    unpricedSales: Set<string>;
    visits: Record<string, GraphNodeVisits>;
    spending: Record<string, number>;
}

function emptyTotals(): Totals {
    return {
        trials: 0,
        returned: 0,
        successes: 0,
        actions: 0,
        cost: 0,
        costSquared: 0,
        revenue: 0,
        excludedRecovery: 0,
        truncated: 0,
        errors: {},
        outcomes: {},
        outcomeMatches: {},
        missingPrices: new Set(),
        unpricedSales: new Set(),
        visits: {},
        spending: {},
    };
}

function addCounts(target: Record<string, number>, values: Record<string, number>) {
    for (const [key, value] of Object.entries(values)) target[key] = (target[key] ?? 0) + value;
}

function accumulate(totals: Totals, result: GraphTrialResult) {
    totals.trials++;
    totals.returned += Number(result.status === "returned");
    totals.successes += Number(result.success);
    totals.actions += result.actions;
    totals.cost += result.knownCost;
    totals.costSquared += result.knownCost ** 2;
    totals.revenue += result.creditedRevenue;
    totals.excludedRecovery += result.excludedRecovery;
    totals.truncated += Number(result.status === "truncated");
    if (result.error && result.status === "error") addCounts(totals.errors, { [result.error]: 1 });
    if (result.outcomeId) addCounts(totals.outcomes, { [result.outcomeId]: 1 });
    for (const id of result.missingPrices) totals.missingPrices.add(id);
    for (const id of result.unpricedSales) totals.unpricedSales.add(id);
    addCounts(totals.spending, result.spending);
    for (const [id, visits] of Object.entries(result.visits)) {
        totals.visits[id] ??= { visits: 0, matches: {}, branches: {}, recovered: 0 };
        const target = totals.visits[id];
        target.visits += visits.visits;
        target.recovered += visits.recovered;
        if (visits.skipped) target.skipped = (target.skipped ?? 0) + visits.skipped;
        addCounts(target.matches, visits.matches);
        addCounts(target.branches, visits.branches);
        if (visits.modelOdds) {
            target.modelOdds ??= { attempts: 0, branches: {}, outcomes: {} };
            target.modelOdds.attempts += visits.modelOdds.attempts;
            addCounts(target.modelOdds.branches, visits.modelOdds.branches);
            addCounts(target.modelOdds.outcomes, visits.modelOdds.outcomes);
        }
    }
}

function resolved(totals: Totals) {
    return totals.trials > 0 && totals.truncated === 0 && Object.keys(totals.errors).length === 0;
}

type Stage = {
    node: GraphNode;
    phase: "pilot" | "estimate" | "outcome-pilot" | "final";
    trials: number;
};

export class CraftingGraphSimulation {
    readonly graph: CraftingGraph;
    private readonly engine: CraftingEngine;
    private readonly queries: ReturnType<typeof createCraftingItemQuery>;
    private readonly order: GraphNode[];
    private readonly random;
    private readonly acquisitions = new Map<string, AcquisitionComparison>();
    private readonly estimates = new Map<string, GraphProductionEstimate>();
    private readonly probabilities = new Map<string, Map<string, number>>();
    private readonly oddsCache = new Map<string, GraphModelOdds>();
    private nextNode = 0;
    private stage: Stage | null = null;
    private totals = emptyTotals();
    private finalTotals = emptyTotals();
    private trial: CraftingGraphTrial | null = null;
    private samples: GraphTrialResult[] = [];
    private work = 0;
    private stopReason: "running" | "complete" | "work-limit" = "running";

    constructor(
        catalog: CraftingCatalog,
        input: unknown,
        readonly options: { estimateIterations?: number; workLimit?: number } = {},
    ) {
        if (
            options.estimateIterations !== undefined &&
            (!Number.isSafeInteger(options.estimateIterations) ||
                options.estimateIterations < 1 ||
                options.estimateIterations > 10_000)
        )
            throw new Error("Estimate iterations must be between 1 and 10,000.");
        if (
            options.workLimit !== undefined &&
            (!Number.isSafeInteger(options.workLimit) ||
                options.workLimit < 1 ||
                options.workLimit > 100_000_000)
        )
            throw new Error("Work limit must be between 1 and 100,000,000.");
        this.graph = validateCraftingGraph(catalog, input);
        this.engine = new CraftingEngine(catalog);
        this.queries = createCraftingItemQuery(this.engine);
        this.order = graphProductionOrder(this.graph);
        this.random = seededRandom(this.graph.seed);
    }

    get done() {
        return this.stopReason !== "running";
    }

    private selectAcquisition(node: Extract<GraphNode, { kind: "acquire" }>) {
        const alternatives = node.alternatives.map((alternative): AcquisitionEstimate => {
            if (alternative.kind === "purchase") {
                const key = `purchase:${node.id}:${alternative.id}`;
                const price = this.graph.prices[key] ?? alternative.price;
                return {
                    id: alternative.id,
                    name: alternative.name,
                    kind: "purchase",
                    currency: this.graph.currency,
                    expectedCost: price?.amount ?? null,
                    expectedActions: 0,
                    guaranteed: true,
                    confidence: price?.confidence ?? null,
                    missingPrices: price ? [] : [key],
                };
            }
            const estimate = this.estimates.get(alternative.nodeId);
            return {
                id: alternative.id,
                name: alternative.name,
                kind: "craft",
                currency: this.graph.currency,
                expectedCost: estimate?.expectedCost ?? null,
                expectedActions: estimate?.expectedActions ?? null,
                guaranteed: false,
                confidence: null,
                missingPrices: estimate?.missingPrices ?? [],
            };
        });
        const comparison = compareAcquisition(alternatives, node.choice);
        this.acquisitions.set(node.id, comparison);
        const selected = alternatives.find(
            (alternative) => alternative.id === comparison.selectedId,
        );
        const source = node.alternatives.find(
            (alternative) => alternative.id === comparison.selectedId,
        );
        const production =
            source?.kind === "production" ? this.estimates.get(source.nodeId) : undefined;
        this.estimates.set(node.id, {
            nodeId: node.id,
            trials: production?.trials ?? 0,
            returned: production?.returned ?? (selected ? 1 : 0),
            returnProbability: production?.returnProbability ?? (selected ? 1 : 0),
            returnInterval: production?.returnInterval ?? (selected ? [1, 1] : [0, 1]),
            expectedCost: selected?.expectedCost ?? null,
            expectedActions: selected?.expectedActions ?? null,
            missingPrices: selected?.missingPrices ?? [],
            complete: production?.complete ?? selected !== undefined,
            errors: production?.errors ?? {},
        });
    }

    private nextStage() {
        if (this.stage?.phase === "pilot") {
            const { node } = this.stage;
            const visits = this.totals.visits[node.id];
            if (node.kind === "craft" && visits?.visits)
                this.probabilities.set(
                    node.id,
                    new Map(
                        node.branches.map((branch) => [
                            branch.id,
                            (visits.matches[branch.id] ?? 0) / visits.visits,
                        ]),
                    ),
                );
            this.stage = { node, phase: "estimate", trials: this.stage.trials };
            this.totals = emptyTotals();
            return;
        }
        if (this.stage?.phase === "outcome-pilot") {
            this.probabilities.set(
                "$outcomes",
                new Map(
                    this.graph.outcomes.map((outcome) => [
                        outcome.id,
                        (this.totals.outcomeMatches[outcome.id] ?? 0) /
                            Math.max(1, this.totals.trials),
                    ]),
                ),
            );
            this.stage = { node: this.stage.node, phase: "final", trials: this.graph.iterations };
            this.totals = emptyTotals();
            return;
        }
        if (this.stage?.phase === "estimate") {
            const totals = this.totals;
            const complete = resolved(totals);
            this.estimates.set(this.stage.node.id, {
                nodeId: this.stage.node.id,
                trials: totals.trials,
                returned: totals.returned,
                returnProbability: totals.returned / Math.max(1, totals.trials),
                returnInterval: wilsonInterval(totals.returned, totals.trials),
                expectedCost:
                    complete && !totals.missingPrices.size && totals.returned
                        ? totals.cost / totals.returned
                        : null,
                expectedActions:
                    complete && totals.returned ? totals.actions / totals.returned : null,
                missingPrices: [...totals.missingPrices],
                complete,
                errors: totals.errors,
            });
        }
        if (this.stage?.phase === "final") {
            this.finalTotals = this.totals;
            this.stopReason = "complete";
            return;
        }
        while (this.nextNode < this.order.length) {
            const node = this.order[this.nextNode++]!;
            if (node.kind === "acquire") {
                this.selectAcquisition(node);
                continue;
            }
            this.stage = {
                node,
                phase: "pilot",
                trials: this.options.estimateIterations ?? Math.min(this.graph.iterations, 100),
            };
            this.totals = emptyTotals();
            return;
        }
        this.stage = {
            node: this.order.find((node) => node.id === this.graph.entry)!,
            phase: "outcome-pilot",
            trials: this.options.estimateIterations ?? Math.min(this.graph.iterations, 100),
        };
        this.totals = emptyTotals();
    }

    advance() {
        if (this.done) return;
        if (this.work >= (this.options.workLimit ?? 2_000_000)) {
            this.stopReason = "work-limit";
            if (this.stage?.phase === "final") this.finalTotals = this.totals;
            return;
        }
        if (!this.stage) {
            this.nextStage();
            return;
        }
        const target = this.stage.trials;
        if (this.totals.trials >= target) {
            this.nextStage();
            return;
        }
        if (!this.trial)
            this.trial = new CraftingGraphTrial(
                this.engine,
                this.graph,
                this.random,
                {
                    entry: this.stage.node.id,
                    classify: this.stage.phase === "final",
                    trace: this.stage.phase === "final" && this.samples.length < 3,
                    acquisitions: this.acquisitions,
                    probabilities: this.probabilities,
                    modelOdds: this.stage.phase === "final",
                    oddsCache: this.oddsCache,
                },
                this.queries,
            );
        this.trial.advance();
        this.work++;
        if (this.trial.done) {
            const result = this.trial.result();
            accumulate(this.totals, result);
            if (result.item && this.stage.node.id === this.graph.entry) {
                const record = this.queries.record(result.item);
                for (const outcome of this.graph.outcomes)
                    if (matchItem(record, outcome.query) === "match")
                        addCounts(this.totals.outcomeMatches, { [outcome.id]: 1 });
            }
            if (this.stage.phase === "final" && this.samples.length < 3) this.samples.push(result);
            this.trial = null;
        }
    }

    runBatch(steps = 250) {
        for (let index = 0; index < steps && !this.done; index++) this.advance();
        return this.done;
    }

    result(): CraftingGraphResult {
        const totals = this.stage?.phase === "final" ? this.totals : this.finalTotals;
        const complete = this.stopReason === "complete" && resolved(totals);
        const meanCost =
            complete && !totals.missingPrices.size ? totals.cost / totals.trials : null;
        const meanRevenue =
            complete && !totals.unpricedSales.size ? totals.revenue / totals.trials : null;
        const variance =
            totals.trials > 1
                ? Math.max(
                      0,
                      (totals.costSquared - totals.cost ** 2 / totals.trials) / (totals.trials - 1),
                  )
                : 0;
        const error = totals.trials > 1 ? 1.96 * Math.sqrt(variance / totals.trials) : null;
        return {
            kind: "sampled-graph" as const,
            complete,
            stopReason: this.stopReason,
            phase: this.stage?.phase ?? "preparing",
            nodeId: this.stage?.node.id ?? null,
            work: this.work,
            trials: totals.trials,
            requestedTrials: this.graph.iterations,
            meanCost,
            costInterval:
                meanCost !== null && error !== null
                    ? ([Math.max(0, meanCost - error), meanCost + error] as [number, number])
                    : null,
            meanRevenue,
            meanProfit: meanCost !== null && meanRevenue !== null ? meanRevenue - meanCost : null,
            meanActions: complete ? totals.actions / totals.trials : null,
            observedCost: totals.trials ? totals.cost / totals.trials : null,
            probability: complete ? totals.successes / totals.trials : null,
            interval: totals.trials
                ? wilsonInterval(totals.successes, totals.trials)
                : ([0, 1] as [number, number]),
            outcomes: this.graph.outcomes.map((outcome) => ({
                id: outcome.id,
                count: totals.outcomes[outcome.id] ?? 0,
                probability: complete ? (totals.outcomes[outcome.id] ?? 0) / totals.trials : null,
                interval: totals.trials
                    ? wilsonInterval(totals.outcomes[outcome.id] ?? 0, totals.trials)
                    : ([0, 1] as [number, number]),
            })),
            missingPrices: [...totals.missingPrices],
            unpricedSales: [...totals.unpricedSales],
            excludedRecovery: totals.excludedRecovery,
            truncated: totals.truncated,
            errors: totals.errors,
            acquisitions: Object.fromEntries(this.acquisitions),
            estimates: [...this.estimates.values()],
            visits: totals.visits,
            spending: totals.spending,
            samples: this.samples,
            unfinished: this.trial?.result() ?? null,
        };
    }
}

export function calculateCraftingGraph(
    catalog: CraftingCatalog,
    graph: unknown,
    options?: ConstructorParameters<typeof CraftingGraphSimulation>[2],
) {
    const simulation = new CraftingGraphSimulation(catalog, graph, options);
    while (!simulation.runBatch()) {
        /* Synchronous API callers share the worker's calculation. */
    }
    return simulation.result();
}
