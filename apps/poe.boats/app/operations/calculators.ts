import { z } from "zod";
import { MANUAL_VENDOR_RECIPES } from "~/data/manual-vendor-recipes";
import { getVendorRecipes } from "~/data/vendor-recipes";
import { buildRecipeTradeUrl, calculateRecipeScenario, findArbitrage } from "~/lib/arbitrage";
import { calculateRecombinatorPlan, matchesTarget, summarizeCounts } from "~/lib/recombinator";
import { availableCatalogMods, catalogBaseOptions } from "~/lib/recombinator-catalog";
import {
    availablePreparationRecipes,
    parseRecombinatorDraft,
    RecombinatorDraftSchema,
} from "~/lib/recombinator-plan";
import {
    ArbitrageGameSchema,
    ArbitrageOptionsSchema,
    ManualVendorRecipeSchema,
    MarketSnapshotSchema,
    RecipeScenarioSchema,
    VendorRecipeSchema,
} from "~/schemas/arbitrage";
import { recombinatorItemSchema, recombinatorPlanSchema } from "~/schemas/recombinator";
import {
    catalogBaseSchema,
    catalogModSchema,
    catalogRecipeSchema,
    recombinatorCatalogSchema,
} from "~/schemas/recombinator-catalog";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

const calculation = { access: "public", readOnly: true, method: "post" } as const;
const scenarioResult = z.object({
    cost: z.number(),
    revenue: z.number(),
    profit: z.number(),
    breakEven: z.number(),
    roi: z.number(),
});
const outcome = z.object({ item: recombinatorItemSchema, probability: z.number() });
export const RecombinatorResultSchema = z.object({
    results: z.array(z.object({ id: z.string(), outcomes: z.array(outcome) })),
});

export const calculatorOperations = [
    defineOperation({
        ...calculation,
        method: "get",
        family: "arbitrage",
        path: "/recipes",
        name: "list_vendor_recipes",
        ui: "/1/arbitrage",
        description: "Read automatic and manual vendor recipes, including conditions and sources.",
        input: z.object({ game: ArbitrageGameSchema }),
        output: z.object({
            recipes: z.array(VendorRecipeSchema),
            manualRecipes: z.array(ManualVendorRecipeSchema),
        }),
        execute: ({ game }) => ({
            recipes: getVendorRecipes(game),
            manualRecipes: game === "1" ? MANUAL_VENDOR_RECIPES : [],
        }),
    }),
    defineOperation({
        ...calculation,
        family: "arbitrage",
        path: "/calculate",
        name: "calculate_arbitrage",
        ui: "/1/arbitrage",
        description:
            "Rank vendor recipes by profit or ROI using the same price snapshot and filters as the PoE 1 and PoE 2 pages.",
        input: z.object({ snapshot: MarketSnapshotSchema, options: ArbitrageOptionsSchema }),
        output: z.object({
            opportunities: z.array(
                z.object({
                    recipe: VendorRecipeSchema,
                    inputUnitValue: z.number(),
                    outputUnitValue: z.number(),
                    cost: z.number(),
                    revenue: z.number(),
                    profit: z.number(),
                    roi: z.number(),
                }),
            ),
            missingPrices: z.array(VendorRecipeSchema),
            pricedCount: z.number(),
        }),
        execute: ({ snapshot, options }) =>
            findArbitrage(getVendorRecipes(snapshot.game), snapshot, options),
    }),
    defineOperation({
        ...calculation,
        family: "arbitrage",
        path: "/scenario",
        name: "calculate_recipe_scenario",
        ui: "/1/arbitrage",
        description:
            "Calculate a manual recipe's buffered cost, revenue, profit, ROI, and break-even value.",
        input: RecipeScenarioSchema,
        output: z.object({ result: scenarioResult.nullable() }),
        execute: (input) => ({ result: calculateRecipeScenario(input) }),
    }),
    defineOperation({
        ...calculation,
        family: "arbitrage",
        path: "/trade",
        name: "build_recipe_trade_url",
        ui: "/1/arbitrage",
        description: "Build the currency exchange trade link shown beside a recipe.",
        input: z.object({
            game: ArbitrageGameSchema,
            league: z.string().min(1).max(100),
            itemId: z.string().min(1).max(200),
        }),
        output: z.object({ url: z.url() }),
        execute: ({ game, league, itemId }) => ({ url: buildRecipeTradeUrl(game, league, itemId) }),
    }),
    defineOperation({
        ...calculation,
        family: "recombinator",
        path: "/calculate",
        name: "calculate_recombinator",
        ui: "/1/recombinator",
        description:
            "Calculate every outcome of a validated recombination plan, including preparation and crafted-mod removal.",
        input: recombinatorPlanSchema,
        output: RecombinatorResultSchema,
        execute: (input) => {
            try {
                return { results: calculateRecombinatorPlan(input) };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Calculation failed.",
                );
            }
        },
    }),
    defineOperation({
        ...calculation,
        family: "recombinator",
        path: "/draft",
        name: "resolve_recombinator_draft",
        ui: "/1/recombinator",
        description:
            "Resolve the simulator's text or catalog draft into a validated calculation plan.",
        input: z.object({
            draft: RecombinatorDraftSchema,
            catalog: recombinatorCatalogSchema.optional(),
        }),
        output: z.object({ plan: recombinatorPlanSchema }),
        execute: async ({ draft, catalog }, context) => {
            const resolvedCatalog =
                catalog ??
                (draft.items.some((item) => item.catalog) ||
                draft.steps.some((step) => step.leftPreparation || step.rightPreparation)
                    ? await context.loadCatalog()
                    : undefined);
            try {
                return { plan: parseRecombinatorDraft(draft, resolvedCatalog) };
            } catch (error) {
                throw new OperationError(error instanceof Error ? error.message : "Invalid draft.");
            }
        },
    }),
    defineOperation({
        ...calculation,
        family: "recombinator",
        path: "/mods",
        name: "list_recombinator_mods",
        ui: "/1/recombinator",
        description:
            "Filter catalog modifiers by base, item level, selected modifiers, and modifier groups.",
        input: z.object({
            mods: z.array(catalogModSchema).optional(),
            base: catalogBaseSchema,
            level: z.number().int().min(1).max(100),
            selected: z.array(catalogModSchema).default([]),
        }),
        output: z.object({ mods: z.array(catalogModSchema) }),
        execute: async ({ mods, base, level, selected }, context) => ({
            mods: availableCatalogMods(
                mods ?? (await context.loadCatalog()).mods,
                base,
                level,
                selected,
            ),
        }),
    }),
    defineOperation({
        ...calculation,
        family: "recombinator",
        path: "/bases",
        name: "list_recombinator_bases",
        ui: "/1/recombinator",
        description: "List equipment bases and generic base categories from the catalog.",
        input: z.object({ bases: z.array(catalogBaseSchema).optional() }),
        output: z.object({ bases: z.array(catalogBaseSchema) }),
        execute: async ({ bases }, context) => ({
            bases: catalogBaseOptions(bases ?? (await context.loadCatalog()).bases),
        }),
    }),
    defineOperation({
        ...calculation,
        family: "recombinator",
        path: "/recipes",
        name: "list_preparation_recipes",
        ui: "/1/recombinator",
        description:
            "List compatible bench or essence preparation recipes for the selected bases, using the simulator's rules.",
        input: z.object({
            bases: z.array(catalogBaseSchema),
            kind: catalogRecipeSchema.shape.kind,
        }),
        output: z.object({ recipes: z.array(catalogRecipeSchema) }),
        execute: async ({ bases, kind }, context) => ({
            recipes: availablePreparationRecipes(await context.loadCatalog(), bases, kind),
        }),
    }),
    defineOperation({
        ...calculation,
        family: "recombinator",
        path: "/target",
        name: "summarize_recombinator_target",
        ui: "/1/recombinator",
        description:
            "Sum the chance of matching target modifiers, with the simulator's exact-match option, and summarize affix counts.",
        input: z.object({
            outcomes: z.array(outcome),
            required: z.array(z.string()),
            exact: z.boolean().default(false),
        }),
        output: z.object({
            probability: z.number(),
            counts: z.array(
                z.object({ prefixes: z.number(), suffixes: z.number(), probability: z.number() }),
            ),
        }),
        execute: ({ outcomes, required, exact }) => ({
            probability: outcomes
                .filter((entry) => matchesTarget(entry.item, required, exact))
                .reduce((sum, entry) => sum + entry.probability, 0),
            counts: summarizeCounts(outcomes),
        }),
    }),
];
