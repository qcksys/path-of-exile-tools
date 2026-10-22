import type { CraftingGraph } from "../schemas/crafting-graph";

export function craftingNodeCostKey(nodeId: string, costId: string) {
    return `node:${encodeURIComponent(nodeId)}:${encodeURIComponent(costId)}`;
}

export function craftingNodeCostPrice(
    prices: CraftingGraph["prices"],
    nodeId: string,
    costId: string,
) {
    return prices[craftingNodeCostKey(nodeId, costId)] ?? prices[costId] ?? null;
}
