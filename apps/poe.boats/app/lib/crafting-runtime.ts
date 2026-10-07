import type { CraftingGraphResult } from "../schemas/crafting-graph-result";

export interface HistoricalCraftingSimulation {
    readonly done: boolean;
    runBatch(steps?: number): boolean;
    result(): CraftingGraphResult;
}
export interface HistoricalCraftingRuntime {
    readonly revision: string;
    createSimulation(
        catalog: unknown,
        graph: unknown,
        options?: { estimateIterations?: number; workLimit?: number },
    ): HistoricalCraftingSimulation;
}
