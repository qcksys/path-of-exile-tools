import { craftingGraphSchema } from "~/schemas/crafting-graph";
import { craftingGraphResultSchema } from "~/schemas/crafting-graph-result";

export const CraftingGraphContract = craftingGraphSchema.meta({ id: "CraftingGraph" });
export const CraftingGraphResultContract = craftingGraphResultSchema.meta({
    id: "CraftingGraphResult",
});
