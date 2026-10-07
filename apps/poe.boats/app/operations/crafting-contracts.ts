import { itemQuerySchema } from "@poe-tools/item-query";
import { z } from "zod";
import { craftingGraphSchema } from "~/schemas/crafting-graph";
import { craftingGraphResultSchema } from "~/schemas/crafting-graph-result";

// Name the original query so nested uses also become references in the API document.
z.globalRegistry.add(itemQuerySchema, { id: "ItemQuery" });

export const CraftingGraphContract = craftingGraphSchema.meta({ id: "CraftingGraph" });
export const CraftingGraphResultContract = craftingGraphResultSchema.meta({
    id: "CraftingGraphResult",
});
