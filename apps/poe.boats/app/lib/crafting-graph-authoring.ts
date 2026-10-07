import { itemQuerySchema } from "@poe-tools/item-query";
import { type CraftingItem, craftingItemSchema } from "../schemas/crafting";
import type { CraftingPrice } from "../schemas/crafting-economy";
import { type CraftingGraph, craftingGraphSchema } from "../schemas/crafting-graph";
import type { CraftingRuleset } from "../schemas/crafting-rulesets";
import { graphDependencies, graphProductionOrder } from "./crafting-graph-validation";
import { rulesetReference } from "./crafting-rulesets";

export function projectFromItem(
    ruleset: CraftingRuleset,
    item: CraftingItem,
    name: string,
    price: CraftingPrice | null = null,
): CraftingGraph {
    const query = itemQuerySchema.parse({ game: ruleset.game });
    return craftingGraphSchema.parse({
        format: 1,
        id: crypto.randomUUID(),
        name,
        game: ruleset.game,
        ruleset: rulesetReference(ruleset),
        currency: price?.currency ?? "chaos",
        nodes: [
            {
                kind: "acquire",
                id: "base",
                name: "Acquire item",
                output: query,
                alternatives: [{ kind: "purchase", id: "buy", name: "Buy item", item, price }],
            },
        ],
        entry: "base",
        outcomes: [{ id: "target", name: "Target item", query }],
    });
}

export function connectGraphInput(
    graph: CraftingGraph,
    targetId: string,
    inputId: string,
    source: string,
): CraftingGraph {
    const next = craftingGraphSchema.parse(graph);
    const target = next.nodes.find((node) => node.id === targetId);
    if (target?.kind !== "craft") throw new Error("Choose a crafting input.");
    const port = target.inputs.find((input) => input.id === inputId);
    if (!port) throw new Error("Input port not found.");
    port.source = source;
    graphProductionOrder(next);
    return next;
}

export function replaceGraphPurchaseItem(
    graph: CraftingGraph,
    nodeId: string,
    alternativeId: string,
    expectedItem: CraftingItem,
    item: CraftingItem,
): CraftingGraph {
    const next = craftingGraphSchema.parse(graph);
    const node = next.nodes.find((entry) => entry.id === nodeId);
    const alternative =
        node?.kind === "acquire"
            ? node.alternatives.find((entry) => entry.id === alternativeId)
            : undefined;
    if (alternative?.kind !== "purchase") throw new Error("Choose a purchase alternative.");
    const before = JSON.stringify(craftingItemSchema.parse(expectedItem));
    if (JSON.stringify(alternative.item) !== before)
        throw new Error(
            "This purchased item changed while the workbench was open. Reopen it before applying edits.",
        );
    const parsed = craftingItemSchema.parse(item);
    if (JSON.stringify(parsed) === before) return next;
    alternative.item = parsed;
    alternative.price = null;
    delete next.prices[`purchase:${nodeId}:${alternativeId}`];
    return next;
}

export function removeGraphNode(graph: CraftingGraph, id: string): CraftingGraph {
    if (graph.entry === id)
        throw new Error("Choose a different final step before removing this step.");
    for (const node of graph.nodes) {
        if (node.id === id) continue;
        if (
            graphDependencies(node).includes(id) ||
            (node.kind === "craft" &&
                [node.fallback, ...node.branches.map((branch) => branch.destination)].some(
                    (destination) => destination.kind === "recover" && destination.nodeId === id,
                ))
        )
            throw new Error(
                "Reconnect this step's consumers and recovery branches before removing it.",
            );
    }
    return craftingGraphSchema.parse({
        ...graph,
        nodes: graph.nodes.filter((node) => node.id !== id),
    });
}
