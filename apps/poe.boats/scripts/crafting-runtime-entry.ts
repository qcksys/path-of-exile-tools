import { CraftingGraphSimulation } from "../app/lib/crafting-graph-simulation";
import { CRAFTING_GRAPH_ENGINE } from "../app/lib/crafting-graph-validation";
import { craftingCatalogSchema } from "../app/schemas/crafting";

export const revision = CRAFTING_GRAPH_ENGINE;
export function createSimulation(
    catalog: unknown,
    graph: unknown,
    options?: { estimateIterations?: number; workLimit?: number },
) {
    return new CraftingGraphSimulation(craftingCatalogSchema.parse(catalog), graph, options);
}
