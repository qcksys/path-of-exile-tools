import { z } from "zod";
import { getMarketData } from "~/db/queries/market.queries";
import { sStashUniqueHourlyS } from "~/db/schema/stash.unique-hourly";
import { ArbitrageGameSchema, MarketSnapshotSchema, VendorRecipeSchema } from "~/schemas/arbitrage";
import { marketFiltersSchema } from "~/schemas/market";
import { recombinatorCatalogSchema } from "~/schemas/recombinator-catalog";
import { ScarabPricesDataSchema } from "~/schemas/scarab";
import { SharedSetSchema } from "~/schemas/share";
import { loadArbitrageMarket } from "~/services/arbitrage.server";
import { calculatorOperations } from "./calculators";
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
import {
    createSavedSet,
    deleteSavedSet,
    editSavedSet,
    getSavedSet,
    listSavedSets,
    updateSavedSet,
} from "./saved-planner.server";
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
const marketRow = sStashUniqueHourlyS
    .omit({ rowCreatedAt: true, rowUpdatedAt: true, rowDeletedAt: true })
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

export const operations = [
    ...calculatorOperations,
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
        ui: "/1/market",
        description:
            "Read season market rows and item history with the UI's filters and pagination.",
        input: marketFiltersSchema,
        output: z.object({
            filters: marketFiltersSchema,
            seasons: z.array(season),
            season: season.optional(),
            rows: z.array(
                marketRow.extend({
                    rank: z.coerce.number(),
                    periodSales: z.number(),
                    periodRemovals: z.number(),
                    periodPending: z.number(),
                }),
            ),
            hasMore: z.boolean(),
            history: z.array(marketRow),
        }),
        execute: async (filters, context) => {
            const data = await getMarketData(context.db, filters);
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
