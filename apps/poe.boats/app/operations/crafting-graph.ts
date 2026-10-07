import { itemQuerySchema, itemRecordSchema, matchItem } from "@poe-tools/item-query";
import { z } from "zod";
import { CraftingEngine } from "~/lib/crafting-engine";
import {
    connectGraphInput,
    projectFromItem,
    removeGraphNode,
    replaceGraphPurchaseItem,
} from "~/lib/crafting-graph-authoring";
import { replaceGraphMethod } from "~/lib/crafting-graph-method";
import { nonNativeEssenceSources } from "~/lib/crafting-recombination";
import { resolveRuleset, validateRulesetGraph } from "~/lib/crafting-rulesets";
import type { HistoricalCraftingSimulation } from "~/lib/crafting-runtime";
import { craftingCatalogSchema, craftingItemSchema } from "~/schemas/crafting";
import {
    graphAuthoringCommandSchema,
    projectFromItemInputSchema,
    replaceGraphMethodInputSchema,
    replaceGraphPurchaseItemInputSchema,
} from "~/schemas/crafting-graph-authoring";
import { nonNativeEssenceSourceSchema } from "~/schemas/crafting-nnn";
import type { CraftingRuleset } from "~/schemas/crafting-rulesets";
import { CraftingGraphContract, CraftingGraphResultContract } from "./crafting-contracts";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

const calculation = {
    family: "crafting",
    ui: "/1/crafting/projects",
    access: "public",
    readOnly: true,
    method: "post",
} as const;

export const craftingGraphCalculationSchema = z.object({
    graph: CraftingGraphContract,
    options: z
        .object({
            estimateIterations: z.number().int().min(1).max(1000).default(100),
            workLimit: z.number().int().min(1).max(100_000).default(50_000),
        })
        .prefault({}),
});

export const craftingGraphOperations = [
    defineOperation({
        ...calculation,
        path: "/graph/method",
        name: "replace_crafting_graph_method",
        description:
            "Edit a graph craft using full workbench method settings. Preserves existing input connections, conditions, routes and prices; a newly required second input initially uses the first input's source and consumes a separate item. Refuses stale method edits, inline inventory donors, unavailable era methods and removal of inputs used by recovery routes. Returns the edited draft without saving it.",
        input: replaceGraphMethodInputSchema.extend({ graph: CraftingGraphContract }),
        output: z.object({ graph: CraftingGraphContract }),
        execute: async (input, context) => {
            try {
                const ruleset = resolveRuleset(
                    await context.loadCraftingRulesets(),
                    input.graph.game,
                    input.graph.ruleset,
                );
                const loaded = await context.loadCraftingRevision(ruleset);
                const engine = new CraftingEngine(craftingCatalogSchema.parse(loaded.catalog));
                const graph = replaceGraphMethod(engine, ruleset, input);
                loaded.runtime.createSimulation(loaded.catalog, graph, { workLimit: 1 });
                return { graph };
            } catch (error) {
                if (error instanceof OperationError) throw error;
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot edit this crafting method.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        ...calculation,
        path: "/graph/purchase-item",
        name: "replace_crafting_purchase_item",
        description:
            "Apply a fully prepared workbench item to an existing graph purchase. Validates the item with the project's retained engine, refuses intervening item edits, preserves routing and acquisition pinning, and clears the old price when the item changes. Returns a draft without saving it.",
        input: replaceGraphPurchaseItemInputSchema.extend({ graph: CraftingGraphContract }),
        output: z.object({ graph: CraftingGraphContract }),
        execute: async ({ graph, nodeId, alternativeId, expectedItem, item }, context) => {
            try {
                const ruleset = resolveRuleset(
                    await context.loadCraftingRulesets(),
                    graph.game,
                    graph.ruleset,
                );
                const loaded = await context.loadCraftingRevision(ruleset);
                loaded.runtime.createSimulation(
                    loaded.catalog,
                    projectFromItem(ruleset, item, "Prepared input"),
                    { workLimit: 1 },
                );
                return {
                    graph: replaceGraphPurchaseItem(
                        graph,
                        nodeId,
                        alternativeId,
                        expectedItem,
                        item,
                    ),
                };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot apply this prepared item.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        ...calculation,
        path: "/items/nnn-essences",
        name: "list_non_native_essences",
        description:
            "List extracted essence recipes that force a non-native natural modifier on an item base, optionally checking eligibility on another recombination base. True essence-exclusive modifiers are excluded. PoE 2 returns no PoE 1 recombination sources.",
        input: projectFromItemInputSchema
            .pick({ game: true, ruleset: true, item: true })
            .extend({ other: craftingItemSchema.optional() }),
        output: z.object({ sources: z.array(nonNativeEssenceSourceSchema) }),
        execute: async ({ game, ruleset: reference, item, other }, context) => {
            const index = await context.loadCraftingRulesets();
            let ruleset: CraftingRuleset;
            try {
                ruleset = resolveRuleset(index, game, reference);
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Unknown crafting revision.",
                    400,
                );
            }
            const loaded = await context.loadCraftingRevision(ruleset);
            const engine = new CraftingEngine(craftingCatalogSchema.parse(loaded.catalog));
            try {
                engine.validateItem(item);
                if (other) engine.validateItem(other);
                return { sources: nonNativeEssenceSources(engine, item, other) };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Invalid source item.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        ...calculation,
        path: "/graph/from-item",
        name: "create_crafting_graph_from_item",
        description:
            "Start an independent project from an existing item, preserving its full state and chosen crafting revision. Returns a local draft without saving or publishing it.",
        input: projectFromItemInputSchema,
        output: z.object({ graph: CraftingGraphContract }),
        execute: async ({ game, ruleset: reference, item, name, price }, context) => {
            const index = await context.loadCraftingRulesets();
            let ruleset: CraftingRuleset;
            try {
                ruleset = resolveRuleset(index, game, reference);
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Unknown crafting revision.",
                    400,
                );
            }
            const loaded = await context.loadCraftingRevision(ruleset);
            try {
                const graph = projectFromItem(ruleset, item, name, price);
                loaded.runtime.createSimulation(loaded.catalog, graph, { workLimit: 1 });
                return { graph };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Invalid project item.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        ...calculation,
        path: "/graph/edit",
        name: "edit_crafting_graph",
        description:
            "Connect a named consuming input or remove an unused graph step. Rejects production cycles and removal of referenced steps. Returns edited draft state.",
        input: z.object({ graph: CraftingGraphContract, command: graphAuthoringCommandSchema }),
        output: z.object({ graph: CraftingGraphContract }),
        execute: ({ graph, command }) => {
            try {
                return {
                    graph:
                        command.action === "connect"
                            ? connectGraphInput(
                                  graph,
                                  command.targetId,
                                  command.inputId,
                                  command.source,
                              )
                            : removeGraphNode(graph, command.nodeId),
                };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Invalid graph edit.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        ...calculation,
        path: "/graph/calculate",
        name: "calculate_crafting_graph",
        description:
            "Calculate a PoE 1 or PoE 2 item-production graph, including consumed inputs, recovery, acquisition alternatives and explicit sale revenue. Uses the browser worker's sampled model; missing prices and unfinished trials remain unresolved.",
        input: craftingGraphCalculationSchema,
        output: z.object({ result: CraftingGraphResultContract }),
        execute: async ({ graph, options }, context) => {
            const index = await context.loadCraftingRulesets();
            let ruleset: CraftingRuleset;
            try {
                ruleset = resolveRuleset(index, graph.game, graph.ruleset);
                validateRulesetGraph(ruleset, graph);
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Invalid ruleset pin.",
                    400,
                );
            }
            const { catalog, runtime } = await context.loadCraftingRevision(ruleset);
            let simulation: HistoricalCraftingSimulation;
            try {
                simulation = runtime.createSimulation(catalog, graph, options);
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Invalid crafting graph.",
                    400,
                );
            }
            while (!simulation.runBatch()) {
                // Yield between batches so other requests can progress.
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            return { result: simulation.result() };
        },
    }),
    defineOperation({
        ...calculation,
        path: "/items/match",
        name: "match_crafting_item",
        description:
            "Match an API-shaped item and its resolved facts against the same item query used for crafting outcomes and market cohorts. Returns unknown when the source lacks enough information.",
        input: z.object({ item: itemRecordSchema, query: itemQuerySchema }),
        output: z.object({ match: z.enum(["match", "no-match", "unknown"]) }),
        execute: ({ item, query }) => ({ match: matchItem(item, query) }),
    }),
];
