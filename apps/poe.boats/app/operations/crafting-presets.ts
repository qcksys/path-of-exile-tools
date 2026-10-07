import { z } from "zod";
import { CraftingEngine } from "~/lib/crafting-engine";
import { listCraftingPresets, projectFromPreset } from "~/lib/crafting-presets";
import { resolveRuleset } from "~/lib/crafting-rulesets";
import { craftingCatalogSchema } from "~/schemas/crafting";
import { craftingPresetInputSchema, craftingPresetSchema } from "~/schemas/crafting-presets";
import { CraftingGraphContract } from "./crafting-contracts";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

const common = {
    family: "crafting",
    ui: "/1/crafting/projects",
    access: "public",
    readOnly: true,
    method: "post",
} as const;

export const craftingPresetOperations = [
    defineOperation({
        ...common,
        path: "/presets",
        name: "list_crafting_presets",
        description:
            "List common crafting examples for the selected game. These examples describe prepared inputs and modeled methods, not market prices or optimal recommendations.",
        input: craftingPresetInputSchema.pick({ game: true }),
        output: z.object({ presets: z.array(craftingPresetSchema) }),
        execute: ({ game }) => ({ presets: listCraftingPresets(game) }),
    }),
    defineOperation({
        ...common,
        path: "/graph/from-preset",
        name: "create_crafting_graph_from_preset",
        description:
            "Create an independent editable common-craft graph pinned to a ruleset. Includes prepared purchases, real crafting methods, target queries and recovery routes. Prices remain unknown. Does not save or publish the draft.",
        input: craftingPresetInputSchema,
        output: z.object({ graph: CraftingGraphContract }),
        execute: async ({ game, ruleset: reference, presetId }, context) => {
            try {
                const ruleset = resolveRuleset(
                    await context.loadCraftingRulesets(),
                    game,
                    reference,
                );
                const loaded = await context.loadCraftingRevision(ruleset);
                const graph = projectFromPreset(
                    new CraftingEngine(craftingCatalogSchema.parse(loaded.catalog)),
                    ruleset,
                    presetId,
                );
                loaded.runtime.createSimulation(loaded.catalog, graph, { workLimit: 1 });
                return { graph };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot create this preset.",
                    400,
                );
            }
        },
    }),
];
