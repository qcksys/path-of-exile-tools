import { z } from "zod";
import { CraftingEngine } from "~/lib/crafting-engine";
import { projectFromMethod } from "~/lib/crafting-method-project";
import { resolveRuleset } from "~/lib/crafting-rulesets";
import { craftingCatalogSchema } from "~/schemas/crafting";
import { projectFromMethodInputSchema } from "~/schemas/crafting-method-project";
import type { CraftingRuleset } from "~/schemas/crafting-rulesets";
import { CraftingGraphContract } from "./crafting-contracts";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

export const craftingMethodProjectOperations = [
    defineOperation({
        family: "crafting",
        ui: "/1/crafting",
        access: "public",
        readOnly: true,
        method: "post",
        path: "/graph/from-method",
        name: "create_crafting_graph_from_method",
        description:
            "Create a graph from the current item, selected craft and explicit prices. Consumed donors or Jewels become separate acquisition inputs with their full item state and are charged once. Missing prices remain unknown. Returns a draft that accepts any craft result until outcome and recovery queries are configured; it does not import workbench targets, a multi-step process or save the draft.",
        input: projectFromMethodInputSchema,
        output: z.object({ graph: CraftingGraphContract }),
        execute: async (input, context) => {
            const index = await context.loadCraftingRulesets();
            let ruleset: CraftingRuleset;
            try {
                ruleset = resolveRuleset(index, input.game, input.ruleset);
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Unknown crafting revision.",
                    400,
                );
            }
            const loaded = await context.loadCraftingRevision(ruleset);
            try {
                const engine = new CraftingEngine(craftingCatalogSchema.parse(loaded.catalog));
                const graph = projectFromMethod(engine, ruleset, input);
                loaded.runtime.createSimulation(loaded.catalog, graph, { workLimit: 1 });
                return { graph };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot create this crafting graph.",
                    400,
                );
            }
        },
    }),
];
