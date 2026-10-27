import { z } from "zod";
import { getMarketData } from "~/db/queries/market.queries";
import { sStashUniqueHourlyS } from "~/db/schema/stash.unique-hourly";
import { marketBaseRowSchema } from "~/lib/market-bases";
import { ArbitrageGameSchema, MarketSnapshotSchema, VendorRecipeSchema } from "~/schemas/arbitrage";
import {
    marketCategorySchema,
    marketFiltersSchema,
    mergedMarketPriceSchema,
} from "~/schemas/market";
import { recombinatorCatalogSchema } from "~/schemas/recombinator-catalog";
import { ScarabPricesDataSchema } from "~/schemas/scarab";
import { SharedSetSchema } from "~/schemas/share";
import { loadArbitrageMarket } from "~/services/arbitrage.server";
import { calculatorOperations } from "./calculators";
import { craftingBuyInOperations } from "./crafting-buy-in";
import { craftingCloudOperations } from "./crafting-cloud";
import { craftingGraphOperations } from "./crafting-graph";
import { craftingItemQueryOperations } from "./crafting-item-queries";
import { craftingMarketOperations } from "./crafting-market";
import { craftingMethodProjectOperations } from "./crafting-method-project";
import { craftingPresetOperations } from "./crafting-presets";
import { craftingRulesetOperations } from "./crafting-rulesets";
import { craftingTradeOperations } from "./crafting-trade";
import { craftingWorkbenchOperations } from "./crafting-workbench";
import { craftingWorkspaceOperations } from "./crafting-workspace";
import { idolPlannerOperations } from "./idol-planner";
import { defineOperation, EmptySchema, OkSchema } from "./operation";
import { PlannerCommandSchema } from "./planner";
import {
    CreateSetSchema,
    CreateShareSchema,
    GetShareSchema,
    LeaguePriceSchema,
    SavedSetSchema,
    SetIdSchema,
    UpdateSetSchema,
} from "./planner-contracts";
import { preferenceOperations } from "./preferences";
import { recombinatorCraftingOperations } from "./recombinator-crafting";
import {
    createSavedSet,
    deleteSavedSet,
    editSavedSet,
    getSavedSet,
    listSavedSets,
    updateSavedSet,
} from "./saved-planner.server";
import { serverStatusOperation } from "./server-status";
import { createPlannerShare, getPlannerShare, getScarabPrices } from "./shares.server";

const saved = {
    family: "sets",
    ui: "/integrations",
    access: "account",
    readOnly: false,
    method: "post",
} as const;
const shared = {
    family: "idol-planner",
    ui: "/1/idol-planner",
    access: "public",
    readOnly: true,
    method: "get",
} as const;
// Markets merge foil and non-foil rows, so a market row has no foil variation.
const marketRow = sStashUniqueHourlyS
    .omit({ rowCreatedAt: true, rowUpdatedAt: true, rowDeletedAt: true, foilVariation: true })
    .extend({
        rowCreatedAt: z.string(),
        rowUpdatedAt: z.string(),
        rowDeletedAt: z.string().nullable(),
    });
const season = z.object({
    league: z.string(),
    firstHour: z.union([z.string(), z.number()]).nullable(),
    latestHour: z.union([z.string(), z.number()]).nullable(),
});
const modPrices = {
    listings: z.number(),
    cheapest: z.number().nullable(),
    sales: z.number(),
    saleMedian: z.number().nullable(),
};
const watchersEyeModValues = z
    .object({
        require: z.array(z.string()),
        anyOf: z.array(z.string()),
        cheapest: z.number().nullable(),
        mods: z.array(
            z.object({
                mod: z.string(),
                combinations: z.number(),
                cheapestValue: z.string().nullable(),
                ...modPrices,
            }),
        ),
        matchCount: z.number(),
        matches: z.array(
            z.object({ mods: z.array(z.string()), signatureValue: z.string(), ...modPrices }),
        ),
    })
    .nullable()
    .describe(
        "For a variant of a unique whose mods come from a pool (kinds watchers-eye, loreweave): each mod's value among the item's mod combinations that have every `mods` entry and, if `anyMods` is set, one of those (both |-separated mod IDs). Per mod: listings and cheapest ask in the latest hour, likely sales and their median last ask over the period, in the display currency. `matches` are the cheapest listed matching combinations (link one with its `signatureValue`). Lists and variants show such a unique as one market with an empty `value`.",
    );

export const operations = [
    serverStatusOperation,
    ...calculatorOperations,
    ...craftingGraphOperations,
    ...craftingMethodProjectOperations,
    ...craftingPresetOperations,
    ...recombinatorCraftingOperations,
    ...craftingWorkbenchOperations,
    ...craftingCloudOperations,
    ...craftingItemQueryOperations,
    ...craftingMarketOperations,
    ...craftingTradeOperations,
    ...craftingBuyInOperations,
    ...craftingRulesetOperations,
    ...craftingWorkspaceOperations,
    ...idolPlannerOperations,
    ...preferenceOperations,
    defineOperation({
        ...shared,
        family: "recombinator",
        path: "/catalog",
        name: "get_recombinator_catalog",
        ui: "/1/recombinator",
        description:
            "Read the exact equipment, modifier, and preparation-recipe catalog loaded by the simulator.",
        input: EmptySchema,
        output: z.object({ catalog: recombinatorCatalogSchema }),
        execute: async (_, context) => ({ catalog: await context.loadCatalog() }),
    }),
    defineOperation({
        ...saved,
        path: "/list",
        name: "list_idol_sets",
        method: "get",
        readOnly: true,
        description:
            "List all saved sets owned by the authenticated account, including their inventory and placements.",
        input: EmptySchema,
        output: z.object({ sets: z.array(SavedSetSchema) }),
        execute: (_, context) => listSavedSets(context),
    }),
    defineOperation({
        ...saved,
        path: "/get",
        name: "get_idol_set",
        method: "get",
        readOnly: true,
        description: "Read one saved set owned by the authenticated account.",
        input: SetIdSchema,
        output: SavedSetSchema,
        execute: ({ setId }, context) => getSavedSet(context, setId),
    }),
    defineOperation({
        ...saved,
        path: "/create",
        name: "create_idol_set",
        description: "Create and activate an empty saved set for the authenticated account.",
        input: CreateSetSchema,
        output: SavedSetSchema,
        execute: (input, context) => createSavedSet(context, input),
    }),
    defineOperation({
        ...saved,
        path: "/update",
        name: "update_idol_set",
        description: "Rename, select, or change a saved set's map device and unlocks.",
        input: UpdateSetSchema,
        output: SavedSetSchema,
        execute: (input, context) => updateSavedSet(context, input),
    }),
    defineOperation({
        ...saved,
        path: "/delete",
        name: "delete_idol_set",
        description: "Delete a saved set owned by the authenticated account.",
        input: SetIdSchema,
        output: OkSchema,
        execute: ({ setId }, context) => deleteSavedSet(context, setId),
    }),
    defineOperation({
        ...saved,
        path: "/edit",
        name: "edit_saved_idol_set",
        description:
            "Edit a saved set's inventory, placements, map device or unlocks, or duplicate it. Uses the browser planner's command rules. Use create/update/delete for set metadata.",
        input: z.object({ command: PlannerCommandSchema }),
        output: SavedSetSchema.extend({ ids: z.array(z.string()) }),
        execute: ({ command }, context) => editSavedSet(context, command),
    }),
    defineOperation({
        ...shared,
        method: "post",
        readOnly: false,
        path: "/share",
        name: "create_idol_share",
        description: "Publish a share link for a validated planner set and inventory.",
        input: CreateShareSchema,
        output: z.object({ shareId: z.string(), shareUrl: z.url() }),
        execute: (input, context) => createPlannerShare(context, input),
    }),
    defineOperation({
        ...shared,
        path: "/share",
        name: "get_idol_share",
        description: "Read a public shared planner set.",
        input: GetShareSchema,
        output: SharedSetSchema,
        execute: (input, context) => getPlannerShare(context, input),
    }),
    defineOperation({
        ...shared,
        path: "/prices",
        name: "get_scarab_prices",
        description: "Read cached scarab prices for the selected league.",
        input: LeaguePriceSchema,
        output: ScarabPricesDataSchema,
        execute: (input, context) => getScarabPrices(context, input),
    }),
    defineOperation({
        ...shared,
        family: "account",
        path: "/me",
        name: "get_account",
        access: "account",
        ui: "/account",
        description: "Read the authenticated account's profile and role.",
        input: EmptySchema,
        output: z.object({
            user: z.object({
                id: z.string(),
                name: z.string(),
                email: z.string(),
                role: z.string(),
            }),
        }),
        execute: (_, context) => ({ user: context.caller! }),
    }),
    defineOperation({
        ...shared,
        family: "arbitrage",
        path: "/market",
        name: "get_arbitrage_market",
        ui: "/1/arbitrage",
        description:
            "Read available leagues, recipes, and the market snapshot used by either game's arbitrage page.",
        input: z.object({ game: ArbitrageGameSchema, league: z.string().max(100).optional() }),
        output: z.object({
            game: ArbitrageGameSchema,
            leagues: z.array(z.string()),
            league: z.string(),
            recipes: z.array(VendorRecipeSchema),
            snapshot: MarketSnapshotSchema.nullable(),
            error: z.string().nullable(),
        }),
        execute: ({ game, league }) => loadArbitrageMarket(game, league ?? null),
    }),
    defineOperation({
        ...shared,
        family: "market",
        path: "/",
        name: "get_season_market",
        ui: "/1/market/currency",
        description:
            "Read season market rows with the UI's filters and pagination; category `all` lists every unique, currency and other item category. The crafting base categories (`armour-bases`, `weapon-bases`, `accessory-bases`) return `bases` instead: normal, magic and rare equipment cohorts by base, item level, links and quality, without likely-sale estimates. With an item, returns that item's history and every variant of it in the period instead of rows.",
        input: marketFiltersSchema,
        output: z.object({
            filters: marketFiltersSchema,
            seasons: z.array(season),
            season: season.optional(),
            rows: z.array(
                marketRow.extend({
                    category: marketCategorySchema,
                    rank: z.coerce.number(),
                    periodSales: z.number(),
                    periodRemovals: z.number(),
                    periodPending: z.number(),
                }),
            ),
            bases: z
                .array(marketBaseRowSchema)
                .describe(
                    "Crafting base cohorts at their latest hour in the period, uncorrupted, unfractured, unmirrored, unsynthesised and uninfluenced",
                ),
            hasMore: z.boolean(),
            exchange: z
                .array(
                    z.object({
                        itemId: z.string(),
                        name: z.string(),
                        category: marketCategorySchema,
                        chaos: z.number().nullable(),
                        volume: z.number(),
                        hour: z.number().nullable(),
                    }),
                )
                .describe(
                    "Items on the exchange in the last day, priced in chaos at the best rate via chaos, divine or exalted from each market's latest traded hour (null when none traded); their stash listings are left out of rows",
                ),
            chaosRates: z
                .record(z.string(), z.number())
                .describe(
                    "Chaos per unit of each listing currency on the page, at the season's latest hour",
                ),
            variants: z
                .array(
                    marketRow
                        .pick({
                            itemKey: true,
                            name: true,
                            identified: true,
                            corrupted: true,
                            signatureKind: true,
                            signatureValue: true,
                            signatureData: true,
                        })
                        .extend({ periodSales: z.number() }),
                )
                .describe(
                    "The item's markets, plus the same unique's markets in the other identification state (unidentified uniques are keyed unid:<icon>)",
                ),
            modValues: watchersEyeModValues,
            history: z.array(
                marketRow.extend({
                    merged: mergedMarketPriceSchema.nullable(),
                    mergedSales: mergedMarketPriceSchema.nullable(),
                }),
            ),
        }),
        execute: async (filters, context) => {
            const data = await getMarketData(
                context.db,
                filters,
                filters.item ? "history" : "list",
            );
            return {
                ...data,
                rows: data.rows.map((row) => ({
                    ...row,
                    rowCreatedAt: row.rowCreatedAt.toISOString(),
                    rowUpdatedAt: row.rowUpdatedAt.toISOString(),
                    rowDeletedAt: row.rowDeletedAt?.toISOString() ?? null,
                })),
                history: data.history.map((row) => ({
                    ...row,
                    rowCreatedAt: row.rowCreatedAt.toISOString(),
                    rowUpdatedAt: row.rowUpdatedAt.toISOString(),
                    rowDeletedAt: row.rowDeletedAt?.toISOString() ?? null,
                })),
            };
        },
    }),
];

export function getOperation(name: string) {
    return operations.find((operation) => operation.name === name);
}
