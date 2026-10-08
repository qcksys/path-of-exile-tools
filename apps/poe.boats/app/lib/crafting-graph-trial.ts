import { type ItemRecord, matchItem } from "@poe-tools/item-query";
import type { CraftingItem, CraftingMethod } from "../schemas/crafting";
import type { AcquisitionComparison } from "../schemas/crafting-economy";
import type { CraftingGraph, GraphCraftNode, GraphNode } from "../schemas/crafting-graph";
import type {
    GraphModelOdds,
    GraphToken,
    GraphTrialResult,
} from "../schemas/crafting-graph-result";

export type {
    GraphNodeVisits,
    GraphToken,
    GraphTraceEntry,
    GraphTrialResult,
} from "../schemas/crafting-graph-result";

import { usesAllflame } from "./crafting-allflame";
import {
    BenchCraftConflict,
    type CraftingCost,
    type CraftingEngine,
    type CraftingRandom,
} from "./crafting-engine";
import { createCraftingItemQuery } from "./crafting-item-query";
import { orderCraftingBranches, routeCraftingItem } from "./crafting-query-routing";
import { validateSimpleCraftInput } from "./crafting-smart";

class GraphLimit extends Error {}
class GraphTerminal extends Error {
    constructor(
        readonly outcomeId: string,
        readonly token: GraphToken,
    ) {
        super(outcomeId);
    }
}

export interface GraphTrialOptions {
    entry?: string;
    classify?: boolean;
    trace?: boolean;
    acquisitions?: ReadonlyMap<string, AcquisitionComparison>;
    probabilities?: ReadonlyMap<string, ReadonlyMap<string, number>>;
    modelOdds?: boolean;
    oddsCache?: Map<string, GraphModelOdds>;
}

export class CraftingGraphTrial {
    private readonly nodes: Map<string, GraphNode>;
    private readonly queries: ReturnType<typeof createCraftingItemQuery>;
    private readonly stocks = new Map<string, GraphToken[]>();
    private readonly live = new Map<string, GraphToken>();
    private readonly missing = new Set<string>();
    private readonly missingSales = new Set<string>();
    private readonly iterator: Generator<void, GraphToken, void>;
    private sequence = 0;
    private state: GraphTrialResult = {
        status: "running",
        outcomeId: null,
        success: false,
        item: null,
        steps: 0,
        actions: 0,
        purchases: 0,
        consumedItems: 0,
        cost: 0,
        knownCost: 0,
        revenue: 0,
        creditedRevenue: 0,
        missingPrices: [],
        unpricedSales: [],
        excludedRecovery: 0,
        spending: {},
        visits: {},
        retained: [],
        trace: [],
        error: null,
    };

    constructor(
        private readonly engine: CraftingEngine,
        readonly graph: CraftingGraph,
        private readonly random: CraftingRandom,
        private readonly options: GraphTrialOptions = {},
        queries?: ReturnType<typeof createCraftingItemQuery>,
    ) {
        this.nodes = new Map(graph.nodes.map((node) => [node.id, node]));
        this.queries = queries ?? createCraftingItemQuery(engine);
        this.iterator = this.produce(options.entry ?? graph.entry);
    }

    get done() {
        return this.state.status !== "running";
    }

    private token(item: CraftingItem) {
        const token = { id: `item-${++this.sequence}`, item };
        this.live.set(token.id, token);
        return token;
    }

    private spend(cost: CraftingCost, price = this.graph.prices[cost.id] ?? null) {
        if (!cost.amount) return;
        this.state.spending[cost.id] = (this.state.spending[cost.id] ?? 0) + cost.amount;
        if (price) this.state.knownCost += cost.amount * price.amount;
        else this.missing.add(cost.id);
    }

    private sell(token: GraphToken, id: string, price: { amount: number } | null) {
        this.live.delete(token.id);
        if (price) this.state.creditedRevenue += price.amount;
        else this.missingSales.add(id);
    }

    private visits(nodeId: string) {
        this.state.visits[nodeId] ??= {
            visits: 0,
            matches: {},
            branches: {},
            recovered: 0,
        };
        return this.state.visits[nodeId];
    }

    private portQuery(node: GraphCraftNode, inputId: string) {
        const port = node.inputs.find((input) => input.id === inputId)!;
        return port.query ?? this.nodes.get(port.source)!.output;
    }

    private recordMatch(item: CraftingItem, node: GraphNode) {
        if (this.options.trace) {
            this.state.nodeItems ??= {};
            this.state.nodeItems[node.id] = item;
        }
        const record = this.queries.record(item);
        if (node.kind === "craft")
            for (const branch of node.branches) {
                if (matchItem(record, branch.query) === "match") {
                    const matches = this.visits(node.id).matches;
                    matches[branch.id] = (matches[branch.id] ?? 0) + 1;
                }
            }
        return record;
    }

    private branches(node: GraphCraftNode) {
        return node.branches.map((branch) => ({
            ...branch,
            probability: this.options.probabilities?.get(node.id)?.get(branch.id) ?? null,
        }));
    }

    private route(node: GraphCraftNode, token: GraphToken, record: ItemRecord) {
        const branch = routeCraftingItem(record, this.branches(node), node.ordering);
        if (branch.status === "unknown")
            throw new Error(
                `Cannot resolve outcome conditions at ${node.name}: ${branch.candidates.join(", ")}`,
            );
        const destination =
            node.branches.find((entry) => entry.id === branch.branchId)?.destination ??
            node.fallback;
        if (token.item.destroyed && !["discard", "terminal"].includes(destination.kind))
            throw new Error(
                "A destroyed item must route to discard or a discarded terminal outcome.",
            );
        const visits = this.visits(node.id);
        const key = branch.branchId ?? "fallback";
        visits.branches[key] = (visits.branches[key] ?? 0) + 1;
        if (this.options.trace)
            this.state.trace.push({
                nodeId: node.id,
                inputs: [],
                outputs: [token.id],
                ...(branch.branchId ? { branchId: branch.branchId } : {}),
                destination,
            });
        if (destination.kind === "return") {
            if (this.queries.matches(token.item, node.output) !== "match")
                throw new Error(
                    `Returned item does not establish the output query at ${node.name}.`,
                );
            return token;
        }
        if (destination.kind === "terminal") throw new GraphTerminal(destination.outcomeId, token);
        if (destination.kind === "recover") {
            const target = this.nodes.get(destination.nodeId) as GraphCraftNode;
            if (
                this.queries.matches(token.item, this.portQuery(target, destination.inputId)) !==
                "match"
            )
                throw new Error(
                    `Recovered item does not establish the input query at ${target.name}/${destination.inputId}.`,
                );
            const key = JSON.stringify([target.id, destination.inputId]);
            const stock = this.stocks.get(key) ?? [];
            stock.push(token);
            this.stocks.set(key, stock);
            visits.recovered++;
        } else if (destination.kind === "sell") {
            const id = `sale:${node.id}:${key}`;
            this.sell(token, id, this.graph.prices[id] ?? destination.price);
        } else {
            this.live.delete(token.id);
            this.state.excludedRecovery++;
        }
    }

    private bindMethod(node: GraphCraftNode, inputs: GraphToken[]): CraftingMethod {
        const donor = inputs[1];
        if (!donor) return node.method;
        const entry = { id: donor.id, name: "Graph input", item: donor.item };
        if (node.method.kind === "socket_jewel") return { ...node.method, jewel: entry };
        if (node.method.kind === "recombine" || node.method.kind === "currency")
            return { ...node.method, donor: entry };
        throw new Error("This crafting method does not consume a second item.");
    }

    private recordOdds(node: GraphCraftNode, inputs: GraphToken[]) {
        if (node.method.kind !== "recombine" || this.options.modelOdds === false) return;
        const branches = orderCraftingBranches(this.branches(node), node.ordering);
        const outcomes = orderCraftingBranches(
            this.graph.outcomes.map((outcome) => ({
                ...outcome,
                probability: this.options.probabilities?.get("$outcomes")?.get(outcome.id),
            })),
            this.graph.outcomeOrdering,
        );
        const key = JSON.stringify([
            node.id,
            inputs.map((input) => input.item),
            branches,
            outcomes,
        ]);
        let odds = this.options.oddsCache?.get(key);
        if (!odds) {
            odds = { attempts: 1, branches: {}, outcomes: {} };
            for (const { value, weight } of this.engine.recombinationDistribution(
                inputs[0]!.item,
                inputs[1]!.item,
            )) {
                const record = this.queries.record(value);
                const route = routeCraftingItem(record, branches, "manual");
                if (route.status === "unknown") return;
                const id = route.branchId ?? "fallback";
                odds.branches[id] = (odds.branches[id] ?? 0) + weight;
                const destination =
                    branches.find((branch) => branch.id === id)?.destination ?? node.fallback;
                if (node.id === this.graph.entry && destination.kind === "return") {
                    const outcome = routeCraftingItem(record, outcomes, "manual");
                    if (outcome.status === "unknown") return;
                    if (outcome.branchId)
                        odds.outcomes[outcome.branchId] =
                            (odds.outcomes[outcome.branchId] ?? 0) + weight;
                }
            }
            if ((this.options.oddsCache?.size ?? 0) >= 128) this.options.oddsCache!.clear();
            this.options.oddsCache?.set(key, odds);
        }
        const visits = this.visits(node.id);
        visits.modelOdds ??= { attempts: 0, branches: {}, outcomes: {} };
        visits.modelOdds.attempts++;
        for (const field of ["branches", "outcomes"] as const)
            for (const [id, probability] of Object.entries(odds[field]))
                visits.modelOdds[field][id] = (visits.modelOdds[field][id] ?? 0) + probability;
    }

    private craft(node: GraphCraftNode, inputs: GraphToken[]) {
        const method = this.bindMethod(node, inputs);
        let result: ReturnType<CraftingEngine["apply"]>;
        try {
            validateSimpleCraftInput(this.engine, node, inputs[0]!.item);
            result = usesAllflame(method)
                ? this.engine.prepareAllflame(inputs[0]!.item, method, this.random)
                : this.engine.apply(inputs[0]!.item, method, this.random);
        } catch (error) {
            if (error instanceof BenchCraftConflict)
                for (const cost of error.cost) this.spend(cost);
            throw error;
        }
        this.recordOdds(node, inputs);
        for (const input of inputs) {
            if (!this.live.delete(input.id))
                throw new Error("The graph attempted to consume an item more than once.");
            this.state.consumedItems++;
        }
        for (const cost of result.cost) {
            // The actual donor was acquired upstream, so the workbench's snapshot price is redundant.
            if (inputs.some((input) => cost.id === `donor:${input.id}`)) continue;
            this.spend(cost);
        }
        this.state.actions++;
        if (result.item.allflameCopies) {
            const branches = orderCraftingBranches(this.branches(node), node.ordering);
            let selected = 0;
            let best = Infinity;
            for (const [index, copy] of result.item.allflameCopies.entries()) {
                const rank = branches.findIndex(
                    (branch) => this.queries.matches(copy, branch.query) === "match",
                );
                if (rank >= 0 && rank < best) {
                    selected = index;
                    best = rank;
                }
            }
            result.item = this.engine.chooseAllflame(result.item, selected);
        }
        const outputs = [this.token(result.item)];
        if (method.kind === "remove_jewel" && inputs[0]!.item.socketedJewel)
            outputs.push(this.token(this.engine.validateItem(inputs[0]!.item.socketedJewel)));
        if (this.options.trace)
            this.state.trace.push({
                nodeId: node.id,
                inputs: inputs.map((input) => input.id),
                outputs: outputs.map((output) => output.id),
            });
        return outputs;
    }

    private *produce(nodeId: string): Generator<void, GraphToken, void> {
        const node = this.nodes.get(nodeId)!;
        while (true) {
            if (this.state.steps >= this.graph.maxSteps)
                throw new GraphLimit("Graph exceeded its step limit; expected cost is unresolved.");
            this.state.steps++;
            yield;
            if (node.kind === "acquire") {
                let defaultId: string | null = null;
                let defaultCost = Infinity;
                if (!this.options.acquisitions)
                    for (const alternative of node.alternatives) {
                        if (alternative.kind !== "purchase") continue;
                        const price =
                            this.graph.prices[`purchase:${node.id}:${alternative.id}`] ??
                            alternative.price;
                        if (price && price.amount < defaultCost) {
                            defaultId = alternative.id;
                            defaultCost = price.amount;
                        }
                    }
                const selected =
                    node.choice.mode === "pinned"
                        ? node.choice.alternativeId
                        : this.options.acquisitions
                          ? this.options.acquisitions.get(node.id)?.selectedId
                          : defaultId;
                const alternative = node.alternatives.find((entry) => entry.id === selected);
                if (!alternative)
                    throw new Error(
                        `No priced acquisition choice is available at ${node.name}; pin a choice to calculate with unknown prices.`,
                    );
                this.visits(node.id).visits++;
                const token =
                    alternative.kind === "production"
                        ? yield* this.produce(alternative.nodeId)
                        : this.token(structuredClone(alternative.item));
                if (this.options.trace) {
                    this.state.nodeItems ??= {};
                    this.state.nodeItems[node.id] = token.item;
                }
                if (alternative.kind === "purchase") {
                    this.state.purchases++;
                    const id = `purchase:${node.id}:${alternative.id}`;
                    this.spend(
                        { id, name: alternative.name, amount: 1 },
                        this.graph.prices[id] ?? alternative.price,
                    );
                    if (this.options.trace)
                        this.state.trace.push({ nodeId: node.id, inputs: [], outputs: [token.id] });
                }
                if (this.queries.matches(token.item, node.output) !== "match")
                    throw new Error(
                        `Acquisition output does not establish the query at ${node.name}.`,
                    );
                return token;
            }
            const stored = this.stocks.get(JSON.stringify([node.id, "$output"]))?.shift();
            if (stored) return stored;
            const inputs: GraphToken[] = [];
            let skipped = false;
            for (const port of node.inputs) {
                const token =
                    this.stocks.get(JSON.stringify([node.id, port.id]))?.shift() ??
                    (yield* this.produce(port.source));
                if (this.queries.matches(token.item, this.portQuery(node, port.id)) !== "match")
                    throw new Error(
                        `Input query was not established at ${node.name}/${port.name}.`,
                    );
                inputs.push(token);
                if (inputs.length === 1 && node.applyWhen) {
                    const match = this.queries.matches(token.item, node.applyWhen);
                    if (match === "unknown")
                        throw new Error(`Cannot resolve the apply condition at ${node.name}.`);
                    if (match === "no-match") {
                        skipped = true;
                        break;
                    }
                }
            }
            if (skipped) {
                const visits = this.visits(node.id);
                visits.skipped = (visits.skipped ?? 0) + 1;
                if (this.options.trace)
                    this.state.trace.push({
                        nodeId: node.id,
                        inputs: [inputs[0]!.id],
                        outputs: [inputs[0]!.id],
                        skipped: true,
                    });
            }
            const outputs = skipped ? inputs : this.craft(node, inputs);
            const ready: GraphToken[] = [];
            for (const output of outputs) {
                this.visits(node.id).visits++;
                const record = this.recordMatch(output.item, node);
                const returned = this.route(node, output, record);
                if (returned) ready.push(returned);
            }
            if (ready.length) {
                this.stocks.set(JSON.stringify([node.id, "$output"]), ready.slice(1));
                return ready[0]!;
            }
        }
    }

    private finish(token: GraphToken, outcomeId?: string) {
        const outcome = this.graph.outcomes.find((outcome) => outcome.id === outcomeId);
        if (!outcome)
            throw new Error("The final item did not match a configured terminal outcome.");
        if (token.item.destroyed && (outcome.success || outcome.disposition !== "discard"))
            throw new Error("A destroyed item cannot be a successful or saleable outcome.");
        if (this.queries.matches(token.item, outcome.query) !== "match")
            throw new Error(`Final item does not establish the terminal query: ${outcome.name}`);
        this.state.status = "terminal";
        this.state.outcomeId = outcome.id;
        this.state.item = token.item;
        this.state.success = outcome.success;
        if (outcome.disposition === "sell") {
            const id = `outcome:${outcome.id}`;
            this.sell(token, id, this.graph.prices[id] ?? outcome.price);
        }
        if (outcome.disposition === "discard") {
            this.live.delete(token.id);
            this.state.excludedRecovery++;
        }
    }

    advance() {
        if (this.done) return;
        try {
            const next = this.iterator.next();
            if (!next.done) return;
            this.state.item = next.value.item;
            if (this.options.classify === false) {
                this.state.status = "returned";
                this.state.success = true;
                return;
            }
            const result = routeCraftingItem(
                this.queries.record(next.value.item),
                this.graph.outcomes.map((outcome) => ({
                    ...outcome,
                    probability:
                        this.options.probabilities?.get("$outcomes")?.get(outcome.id) ?? null,
                })),
                this.graph.outcomeOrdering,
            );
            if (result.status !== "matched")
                throw new Error("The final item has no unambiguous configured terminal outcome.");
            this.finish(next.value, result.branchId!);
        } catch (error) {
            let failure = error;
            if (error instanceof GraphTerminal) {
                try {
                    this.finish(error.token, error.outcomeId);
                    return;
                } catch (terminalError) {
                    failure = terminalError;
                }
            }
            this.state.status = failure instanceof GraphLimit ? "truncated" : "error";
            this.state.error = failure instanceof Error ? failure.message : String(failure);
        }
    }

    result(): GraphTrialResult {
        return {
            ...this.state,
            cost: this.missing.size ? null : this.state.knownCost,
            revenue: this.missingSales.size ? null : this.state.creditedRevenue,
            missingPrices: [...this.missing],
            unpricedSales: [...this.missingSales],
            retained: [...this.live.values()],
        };
    }
}
