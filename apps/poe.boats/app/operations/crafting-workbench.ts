import { z } from "zod";
import { CraftingEngine, seededRandom } from "~/lib/crafting-engine";
import { exportCraftingItemText } from "~/lib/crafting-item-text";
import {
    FossilOptimizer,
    fossilCombinations,
    fossilOptimizationSchema,
    fossilOptimizerSchema,
} from "~/lib/crafting-optimizer";
import {
    CraftingProcess,
    hasCraftingRequirements,
    validateProject,
} from "~/lib/crafting-simulation";
import {
    CraftingWorkbenchCalculation,
    editCraftingStartingItem,
    emulateCraftingItem,
} from "~/lib/crafting-workbench";
import {
    craftingCatalogSchema,
    craftingItemSchema,
    craftingProjectSchema,
} from "~/schemas/crafting";
import {
    craftingEmulationCommandSchema,
    craftingEmulationResultSchema,
    craftingItemEditSchema,
    craftingProcessResultSchema,
    craftingWorkbenchItemSchema,
    craftingWorkbenchResultSchema,
} from "~/schemas/crafting-workbench";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

const workbench = {
    family: "crafting",
    ui: "/1/crafting",
    access: "public",
    readOnly: true,
    method: "post",
} as const;
// The native converter represents the terminal z.never() at the target's depth limit.
const project = craftingProjectSchema.meta({
    ...z.toJSONSchema(craftingProjectSchema),
    id: "CraftingWorkbenchProject",
});
const invalid = (error: unknown) =>
    new OperationError(error instanceof Error ? error.message : "Invalid crafting request.", 400);

export const craftingWorkbenchOperations = [
    defineOperation({
        ...workbench,
        path: "/workbench/item",
        name: "edit_crafting_starting_item",
        description:
            "Create or edit a hypothetical starting item using the workbench's shared helpers. Supports full-item validation, seeded starting modifiers with their source, game-specific flag changes and allocated passives. Full-item validation covers edited rolls, sockets, quality, influences and other supported attributes. These are input assumptions, not paid crafts; no costs, execution history or browser draft are changed. Requires the current client build.",
        input: craftingProjectSchema
            .pick({ game: true, patch: true })
            .extend({ command: craftingItemEditSchema }),
        output: z.object({ item: craftingWorkbenchItemSchema }),
        execute: async ({ game, patch, command }, context) => {
            const catalog = await context.loadWorkbenchCatalog(game);
            try {
                if (patch !== catalog.patch || game !== catalog.game)
                    throw new Error("The item was saved for a different game or client build.");
                return { item: editCraftingStartingItem(new CraftingEngine(catalog), command) };
            } catch (error) {
                throw invalid(error);
            }
        },
    }),
    defineOperation({
        ...workbench,
        path: "/workbench/item-text",
        name: "export_crafting_item_text",
        description:
            "Export a supported item as Path of Building text with the browser's shared exporter. Refuses states that text cannot preserve, including pending choices. Requires the current client build. Use crafting/items/query-from-text to parse text against a retained ruleset and review all valid interpretations.",
        input: craftingProjectSchema
            .pick({ game: true, patch: true })
            .extend({ item: craftingWorkbenchItemSchema }),
        output: z.object({ text: z.string() }),
        execute: async ({ game, patch, item }, context) => {
            const catalog = await context.loadWorkbenchCatalog(game);
            try {
                if (patch !== catalog.patch || game !== catalog.game)
                    throw new Error("The item was saved for a different game or client build.");
                return { text: exportCraftingItemText(new CraftingEngine(catalog), item) };
            } catch (error) {
                throw invalid(error);
            }
        },
    }),
    defineOperation({
        ...workbench,
        path: "/workbench/optimize-fossils",
        name: "optimize_crafting_fossils",
        description:
            "Rank explicit PoE 1 fossil combinations with the browser's seeded optimizer, including Allflame, Tangled choices and optional worker partitions. Returns sampled odds, intervals and known costs; missing prices remain unknown. Requires target requirements and the current client build. Server requests allow at most 5,000 trials per combination and 100,000 total trials in the selected partition; larger searches remain available in browser workers. Does not save or change a draft.",
        input: z.object({ project, options: fossilOptimizerSchema }),
        output: z.object({ result: fossilOptimizationSchema }),
        execute: async ({ project: input, options }, context) => {
            const catalog = await context.loadWorkbenchCatalog(input.game);
            try {
                const parsed = validateProject(catalog, input);
                if (!hasCraftingRequirements(parsed.target))
                    throw new Error("Choose at least one target modifier or item requirement.");
                const combinations = fossilCombinations(options.fossils, options.maxSockets).length;
                const partition = options.partition ?? { index: 0, count: 1 };
                const assigned = Math.max(
                    0,
                    Math.ceil((combinations - partition.index) / partition.count),
                );
                if (options.trials > 5000 || assigned * options.trials > 100_000)
                    throw new Error(
                        "This request exceeds 5,000 trials per combination or 100,000 partition trials. Reduce the search or use the browser.",
                    );
                const optimizer = new FossilOptimizer(
                    new CraftingEngine(catalog),
                    parsed.item,
                    parsed.target,
                    parsed.prices,
                    parsed.seed,
                    options,
                );
                while (!optimizer.runBatch())
                    await new Promise((resolve) => setTimeout(resolve, 0));
                return { result: optimizer.result() };
            } catch (error) {
                throw invalid(error);
            }
        },
    }),
    defineOperation({
        ...workbench,
        path: "/workbench/catalog",
        name: "get_crafting_workbench_catalog",
        method: "get",
        description:
            "Read the current game's workbench catalog. Workbench requests validate the client build; historical graph calculations use the separate pinned graph operations.",
        input: craftingProjectSchema.pick({ game: true }),
        output: z.object({
            catalog: craftingCatalogSchema.meta({ id: "CraftingWorkbenchCatalog" }),
        }),
        execute: async ({ game }, context) => ({
            catalog: await context.loadWorkbenchCatalog(game),
        }),
    }),
    defineOperation({
        ...workbench,
        path: "/workbench/calculate",
        name: "calculate_crafting_workbench",
        description:
            "Run the browser's exact-or-sampled calculation or sampled process using the current workbench catalog and seed. Requires a target. Requests are bounded to 100,000 potential steps and 5,000 trials; manual-stop runs remain browser-only. Does not save a draft.",
        input: z.object({
            project,
            mode: z.enum(["calculate", "sample", "process"]).default("calculate"),
        }),
        output: z.object({ result: craftingWorkbenchResultSchema }),
        execute: async ({ project: input, mode }, context) => {
            const catalog = await context.loadWorkbenchCatalog(input.game);
            try {
                const parsed = validateProject(catalog, input);
                const limit = mode === "calculate" ? undefined : parsed.simulationLimit;
                if (limit?.kind === "manual")
                    throw new Error(
                        "Manual-stop simulations require the browser. Supply a bounded run.",
                    );
                const stepsPerTrial =
                    mode === "process" || parsed.useProcess ? parsed.maxActions : 1;
                const work = Math.min(
                    parsed.iterations * stepsPerTrial,
                    limit?.kind === "actions" ? limit.count : Infinity,
                );
                if (parsed.iterations > 5000 || work > 100_000)
                    throw new Error(
                        "This request exceeds 5,000 trials or 100,000 potential steps. Reduce the run or use the browser.",
                    );
                const calculation = new CraftingWorkbenchCalculation(catalog, parsed, mode);
                while (!calculation.runBatch())
                    await new Promise((resolve) => setTimeout(resolve, 0));
                return { result: calculation.result() };
            } catch (error) {
                throw invalid(error);
            }
        },
    }),
    defineOperation({
        ...workbench,
        path: "/workbench/process",
        name: "emulate_crafting_process",
        description:
            "Emulate one bounded process using the same seeded process as the browser worker. Returns the resulting item, consumed currencies, routes, errors and timeout status without saving or recording real progress.",
        input: z.object({ project }),
        output: z.object({ result: craftingProcessResultSchema }),
        execute: async ({ project: input }, context) => {
            const catalog = await context.loadWorkbenchCatalog(input.game);
            try {
                const parsed = validateProject(catalog, input);
                const process = new CraftingProcess(
                    new CraftingEngine(catalog),
                    parsed,
                    seededRandom(parsed.seed),
                );
                while (!process.done) {
                    for (let i = 0; i < 100 && !process.done; i++) process.advance();
                    if (!process.done) await new Promise((resolve) => setTimeout(resolve, 0));
                }
                return { result: process.result() };
            } catch (error) {
                throw invalid(error);
            }
        },
    }),
    defineOperation({
        ...workbench,
        path: "/workbench/emulate",
        name: "emulate_crafting_item",
        description:
            "Apply one seeded workbench action or select a reveal/Allflame choice. Returns the item, newly charged costs and action count. Allflame preview costs are deferred until a copy is chosen; paid bench conflicts return the changed item and error. Uses the current client build and never saves a draft.",
        input: craftingProjectSchema.pick({ game: true, patch: true }).extend({
            item: craftingItemSchema,
            command: craftingEmulationCommandSchema,
            seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        }),
        output: z.object({ result: craftingEmulationResultSchema }),
        execute: async ({ game, patch, item, command, seed }, context) => {
            const catalog = await context.loadWorkbenchCatalog(game);
            try {
                if (patch !== catalog.patch || game !== catalog.game)
                    throw new Error("The item was saved for a different game or client build.");
                return {
                    result: emulateCraftingItem(new CraftingEngine(catalog), item, command, seed),
                };
            } catch (error) {
                throw invalid(error);
            }
        },
    }),
];
