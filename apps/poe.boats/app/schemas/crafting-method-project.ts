import { craftingMethodSchema } from "./crafting";
import { craftingGraphSchema } from "./crafting-graph";
import { projectFromItemInputSchema } from "./crafting-graph-authoring";

export const projectFromMethodInputSchema = projectFromItemInputSchema.extend({
    method: craftingMethodSchema,
    prices: craftingGraphSchema.shape.prices,
});
