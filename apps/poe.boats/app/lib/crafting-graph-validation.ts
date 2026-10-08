import type { ItemQuery } from "@poe-tools/item-query";
import type { CraftingCatalog, CraftingMethod } from "../schemas/crafting";
import { type CraftingGraph, craftingGraphSchema, type GraphNode } from "../schemas/crafting-graph";
import { CraftingEngine } from "./crafting-engine";
import { createCraftingItemQuery } from "./crafting-item-query";
import { simpleCraftRouting } from "./crafting-smart";

export const CRAFTING_GRAPH_ENGINE = "crafting-graph-7";

export function graphInputCount(catalog: CraftingCatalog, method: CraftingMethod) {
    return method.kind === "recombine" ||
        method.kind === "socket_jewel" ||
        (method.kind === "currency" &&
            catalog.crafting.currencies.find((currency) => currency.id === method.id)?.action ===
                "transfer_item_influence")
        ? 2
        : 1;
}

export function graphDependencies(node: GraphNode) {
    return node.kind === "craft"
        ? node.inputs.map((input) => input.source)
        : node.alternatives.flatMap((alternative) =>
              alternative.kind === "production" ? [alternative.nodeId] : [],
          );
}

export function graphProductionOrder(graph: CraftingGraph) {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const visited = new Set<string>();
    const pending = new Set<string>();
    const order: GraphNode[] = [];
    function visit(id: string) {
        if (pending.has(id))
            throw new Error(
                "Production dependencies form a cycle. Model retries with a recovery branch to an input port.",
            );
        if (visited.has(id)) return;
        const node = nodes.get(id);
        if (!node) throw new Error(`Unknown production node: ${id}`);
        pending.add(id);
        for (const dependency of graphDependencies(node)) visit(dependency);
        pending.delete(id);
        visited.add(id);
        order.push(node);
    }
    for (const node of graph.nodes) visit(node.id);
    return order;
}

export function validateCraftingGraph(catalog: CraftingCatalog, input: unknown): CraftingGraph {
    const graph = craftingGraphSchema.parse(input);
    if (
        graph.game !== catalog.game ||
        graph.ruleset.patch !== catalog.patch ||
        graph.ruleset.manifestSha256 !== catalog.manifestSha256 ||
        graph.ruleset.craftingSha256 !== catalog.craftingSha256
    )
        throw new Error("This project requires its pinned catalog revision.");
    if (graph.ruleset.engine !== CRAFTING_GRAPH_ENGINE)
        throw new Error("This project requires a different crafting engine revision.");
    const engine = new CraftingEngine(catalog);
    const matcher = createCraftingItemQuery(engine);
    const unique = (entries: { id: string }[], description: string) => {
        if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
            throw new Error(`${description} must have unique IDs.`);
    };
    unique(graph.nodes, "Nodes");
    unique(graph.outcomes, "Outcomes");
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const outcomeIds = new Set(graph.outcomes.map((outcome) => outcome.id));
    if (!nodes.has(graph.entry)) throw new Error("Choose an existing entry node.");
    const query = (value: ItemQuery) => {
        if (value.game !== graph.game)
            throw new Error("All item queries must use the project's game.");
        for (const group of value.groups)
            for (const condition of group.filters) {
                if (condition.kind === "mod" && condition.ids)
                    for (const id of condition.ids)
                        if (!catalog.mods[id])
                            throw new Error(`Unknown modifier in item query: ${id}`);
                if (condition.kind === "base" && condition.field === "baseId")
                    for (const id of condition.values)
                        if (!catalog.bases[id])
                            throw new Error(`Unknown base in item query: ${id}`);
            }
    };
    const price = (value: { currency: string } | null) => {
        if (value && value.currency !== graph.currency)
            throw new Error("All graph prices must use the project's comparison currency.");
    };
    for (const value of Object.values(graph.prices)) price(value);
    for (const outcome of graph.outcomes) {
        query(outcome.query);
        price(outcome.price);
    }
    for (const node of graph.nodes) {
        query(node.output);
        if (node.kind === "acquire") {
            unique(node.alternatives, "Acquisition alternatives");
            if (
                node.choice.mode === "pinned" &&
                !node.alternatives.some(
                    (alternative) =>
                        alternative.id ===
                        (node.choice.mode === "pinned" ? node.choice.alternativeId : ""),
                )
            )
                throw new Error(
                    `The pinned acquisition alternative no longer exists: ${node.name}`,
                );
            for (const alternative of node.alternatives)
                if (alternative.kind === "purchase") {
                    engine.validateItem(alternative.item);
                    if (alternative.item.destroyed)
                        throw new Error("A destroyed item cannot be purchased as a graph input.");
                    price(alternative.price);
                    if (matcher.matches(alternative.item, node.output) !== "match")
                        throw new Error(
                            `Purchased item does not establish the output query: ${node.name}`,
                        );
                }
        } else {
            unique(node.inputs, "Input ports");
            unique(node.branches, "Outcome branches");
            if (node.inputs.length !== graphInputCount(catalog, node.method))
                throw new Error(
                    `${node.name} requires ${graphInputCount(catalog, node.method)} item input(s).`,
                );
            if (
                ("donor" in node.method && node.method.donor) ||
                ("jewel" in node.method && node.method.jewel)
            )
                throw new Error(
                    "Graph methods take their donor or Jewel from an input port, not an embedded inventory copy.",
                );
            engine.validateMethod(node.method);
            if (node.smart) {
                const routing = simpleCraftRouting(engine, node, node.smart);
                for (const key of [
                    "output",
                    "applyWhen",
                    "branches",
                    "ordering",
                    "fallback",
                ] as const)
                    if (JSON.stringify(node[key]) !== JSON.stringify(routing[key]))
                        throw new Error(
                            "Simple craft outcomes are generated from the selected goal. Configure the goal instead of editing its routes.",
                        );
            }
            if (node.applyWhen) query(node.applyWhen);
            for (const port of node.inputs) if (port.query) query(port.query);
            for (const branch of node.branches) query(branch.query);
            for (const destination of [
                node.fallback,
                ...node.branches.map((branch) => branch.destination),
            ]) {
                if (destination.kind === "recover") {
                    const target = nodes.get(destination.nodeId);
                    if (
                        target?.kind !== "craft" ||
                        !target.inputs.some((port) => port.id === destination.inputId)
                    )
                        throw new Error(
                            `Unknown recovery input: ${destination.nodeId}/${destination.inputId}`,
                        );
                }
                if (destination.kind === "terminal" && !outcomeIds.has(destination.outcomeId))
                    throw new Error(`Unknown terminal outcome: ${destination.outcomeId}`);
                if (destination.kind === "sell") price(destination.price);
            }
        }
    }
    graphProductionOrder(graph);
    return graph;
}
