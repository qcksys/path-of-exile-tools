import { z } from "zod";
import { adoptRuleset, availableCorrection, resolveRuleset } from "~/lib/crafting-rulesets";
import {
    craftingRulesetIndexSchema,
    craftingRulesetRefSchema,
    craftingRulesetSchema,
} from "~/schemas/crafting-rulesets";
import { CraftingGraphContract } from "./crafting-contracts";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

const common = {
    family: "crafting",
    ui: "/1/crafting/projects",
    access: "public",
    readOnly: true,
} as const;

export const craftingRulesetOperations = [
    defineOperation({
        ...common,
        method: "get",
        path: "/rulesets",
        name: "list_crafting_rulesets",
        description:
            "List retained crafting eras, immutable revisions, available mechanics and latest correction pointers. Creating a new project may use the latest revision; existing projects keep their pins.",
        input: z.object({ game: craftingRulesetSchema.shape.game.optional() }),
        output: craftingRulesetIndexSchema,
        execute: async ({ game }, context) => {
            const index = await context.loadCraftingRulesets();
            return {
                ...index,
                revisions: index.revisions.filter((entry) => !game || entry.game === game),
                latest: index.latest.filter((entry) => !game || entry.game === game),
            };
        },
    }),
    defineOperation({
        ...common,
        method: "post",
        path: "/rulesets/correction",
        name: "get_crafting_correction",
        description:
            "Check whether a project has a newer correction in its pinned era without changing the project or its market prices.",
        input: z.object({ graph: CraftingGraphContract }),
        output: z.object({
            current: craftingRulesetSchema,
            correction: craftingRulesetSchema.nullable(),
        }),
        execute: async ({ graph }, context) => {
            const index = await context.loadCraftingRulesets();
            try {
                return {
                    current: resolveRuleset(index, graph.game, graph.ruleset),
                    correction: availableCorrection(index, graph),
                };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Unknown crafting revision.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        ...common,
        method: "post",
        path: "/rulesets/adopt",
        name: "adopt_crafting_ruleset",
        description:
            "Explicitly change a draft to a published era/revision after validating its methods and items with that retained engine. Returns new state; does not synchronize or overwrite saved projects.",
        input: z.object({
            graph: CraftingGraphContract,
            era: craftingRulesetRefSchema.shape.era,
            revision: craftingRulesetRefSchema.shape.revision,
        }),
        output: z.object({ graph: CraftingGraphContract }),
        execute: async ({ graph, era, revision }, context) => {
            const index = await context.loadCraftingRulesets();
            const ruleset = index.revisions.find(
                (entry) =>
                    entry.game === graph.game && entry.era === era && entry.revision === revision,
            );
            if (!ruleset)
                throw new OperationError("The requested crafting revision is unavailable.", 404);
            const loaded = await context.loadCraftingRevision(ruleset);
            try {
                const updated = adoptRuleset(graph, ruleset);
                loaded.runtime.createSimulation(loaded.catalog, updated, { workLimit: 1 });
                return { graph: updated };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error
                        ? error.message
                        : "The project is incompatible with this revision.",
                    400,
                );
            }
        },
    }),
];
