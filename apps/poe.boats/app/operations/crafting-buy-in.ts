import { tradeListingSchema } from "@poe-tools/trade-bridge";
import { z } from "zod";
import {
    buyInEntry,
    buyInFreshness,
    buyInSearchable,
    buyInStages,
    buyInTradeSearches,
    calculateBuyIn,
    pricedBuyInStages,
    recordBuyInStage,
} from "~/lib/crafting-buy-in";
import { priceBuyInStage } from "~/lib/crafting-buy-in-price";
import { CraftingEngine } from "~/lib/crafting-engine";
import { resolveRuleset, validateRulesetGraph } from "~/lib/crafting-rulesets";
import { loadCraftingTradeMetadata } from "~/lib/crafting-trade";
import { craftingCatalogSchema } from "~/schemas/crafting";
import {
    buyInComparisonSchema,
    buyInFreshnessSchema,
    buyInRatesSchema,
    buyInStageSchema,
    checkedListingSchema,
} from "~/schemas/crafting-buy-in";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import { craftingTradeResultSchema } from "~/schemas/crafting-trade";
import { CraftingGraphContract } from "./crafting-contracts";
import { craftingGraphCalculationSchema } from "./crafting-graph";
import { OperationError } from "./errors";
import type { OperationContext } from "./operation";
import { defineOperation } from "./operation";

const common = {
    family: "crafting",
    ui: "/1/crafting/projects",
    access: "public",
    readOnly: true,
    method: "post",
} as const;

/** Server comparisons run one calculation per priced stage; larger graphs run in the browser. */
const SERVER_PRICED_STAGES = 10;

const listingSearchSchema = z.object({
    listings: z.array(tradeListingSchema).max(20),
    results: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
    fetches: z.number().int().min(1).max(2),
});

async function loadRevision(graph: CraftingGraph, context: OperationContext) {
    const ruleset = resolveRuleset(await context.loadCraftingRulesets(), graph.game, graph.ruleset);
    validateRulesetGraph(ruleset, graph);
    return context.loadCraftingRevision(ruleset);
}

function refuse(error: unknown, fallback: string): never {
    if (error instanceof OperationError) throw error;
    throw new OperationError(error instanceof Error ? error.message : fallback, 400);
}

export const craftingBuyInOperations = [
    defineOperation({
        ...common,
        path: "/buy-in/stages",
        name: "list_crafting_buy_in_stages",
        description:
            "List the craft steps of a project that could be bought instead of crafted, with each step's official trade searches and its saved trade price. Searches use instant-buyout listings, one per seller; in-person searches (online sellers, listed within a week) are included only when the project enables them. Prices older than 6 hours are aging and older than 24 hours stale. Does not fetch listings: trade searches run only in the poe.boats browser extension, in the user's own browser session.",
        input: z.object({ graph: CraftingGraphContract }),
        output: z.object({
            stages: z.array(
                z.object({
                    stageId: z.string(),
                    name: z.string(),
                    searchable: z.boolean(),
                    price: buyInStageSchema.nullable(),
                    freshness: buyInFreshnessSchema.nullable(),
                    instant: craftingTradeResultSchema.nullable(),
                    inPerson: craftingTradeResultSchema.nullable(),
                    error: z.string().optional(),
                }),
            ),
        }),
        execute: async ({ graph }, context) => {
            try {
                const loaded = await loadRevision(graph, context);
                const catalog = craftingCatalogSchema.parse(loaded.catalog);
                const searches = new Map(
                    buyInTradeSearches(
                        graph,
                        catalog,
                        await loadCraftingTradeMetadata(graph.game),
                    ).map((search) => [search.stageId, search]),
                );
                const now = Date.now();
                return {
                    stages: buyInStages(graph).map((node) => {
                        const entry = buyInEntry(graph, node);
                        const { stageId: _, ...search } = searches.get(node.id)!;
                        return {
                            stageId: node.id,
                            searchable: buyInSearchable(node),
                            price: entry,
                            freshness: entry ? buyInFreshness(entry, now) : null,
                            ...search,
                        };
                    }),
                };
            } catch (error) {
                refuse(error, "Cannot list this project's stages.");
            }
        },
    }),
    defineOperation({
        ...common,
        path: "/buy-in/price",
        name: "price_crafting_buy_in_stage",
        description:
            "Price one craft step from official trade listings and save the price on the returned project. Each listing is re-checked against the step's item requirements with the project's catalog; listings that do not match or cannot be read are counted and ignored. rates give the project-currency value of one unit of each listing currency (trade currency IDs such as divine); listings without a rate are counted as unconverted. Instant-buyout listings price the step at the cheapest match with high confidence. In-person listings are used only when the project enables them and no instant-buyout listing matched: listings under half the median of the five cheapest are dropped as bait and the cheapest remaining one sets the price (medium confidence with 3 or more matches, otherwise low). No listings leaves the price unknown, never zero. Does not save to an account or browser.",
        input: z.object({
            graph: CraftingGraphContract,
            stageId: z.string().min(1).max(100),
            instant: listingSearchSchema,
            inPerson: listingSearchSchema.nullable().default(null),
            rates: buyInRatesSchema,
            observedAt: z.iso.datetime().optional(),
        }),
        output: z.object({
            graph: CraftingGraphContract,
            stage: buyInStageSchema,
            checks: z.array(checkedListingSchema),
        }),
        execute: async ({ graph, stageId, instant, inPerson, rates, observedAt }, context) => {
            try {
                const loaded = await loadRevision(graph, context);
                const engine = new CraftingEngine(craftingCatalogSchema.parse(loaded.catalog));
                const priced = priceBuyInStage(
                    engine,
                    graph,
                    stageId,
                    { ...instant, sale: "instant" },
                    inPerson && { ...inPerson, sale: "in-person" },
                    rates,
                );
                const updated = recordBuyInStage(
                    graph,
                    stageId,
                    priced.stage,
                    observedAt ?? new Date().toISOString(),
                );
                return {
                    graph: updated,
                    stage: updated.buyIn!.stages[stageId]!,
                    checks: [...priced.instant.checks, ...(priced.inPerson?.checks ?? [])],
                };
            } catch (error) {
                refuse(error, "Cannot price this stage.");
            }
        },
    }),
    defineOperation({
        ...common,
        path: "/buy-in/compare",
        name: "compare_crafting_buy_in",
        description: `Compare crafting a project from scratch with buying at each craft step that has a saved trade price, by expected cost per successful final outcome. Each priced step is calculated with the retained engine as a pinned purchase of the cheapest matching listing's item, so steps that only fed it are skipped; items recovered into skipped steps are not credited. The recommendation is the cheapest option, or null stageId to craft from scratch. Stale (over 24 hours) recommended prices are flagged. At most ${SERVER_PRICED_STAGES} priced steps per request; the browser compares any number.`,
        input: craftingGraphCalculationSchema,
        output: z.object({ comparison: buyInComparisonSchema }),
        execute: async ({ graph, options }, context) => {
            let loaded: Awaited<ReturnType<typeof loadRevision>>;
            try {
                if (pricedBuyInStages(graph).length > SERVER_PRICED_STAGES)
                    throw new Error(
                        `Compare at most ${SERVER_PRICED_STAGES} priced steps per request.`,
                    );
                loaded = await loadRevision(graph, context);
            } catch (error) {
                refuse(error, "Cannot compare this project.");
            }
            try {
                const comparison = await calculateBuyIn(loaded.runtime, loaded.catalog, graph, {
                    simulation: options,
                });
                return { comparison: comparison! };
            } catch (error) {
                refuse(error, "Invalid crafting graph.");
            }
        },
    }),
];
