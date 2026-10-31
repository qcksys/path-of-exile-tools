import { z } from "zod";
import {
    getMarketData,
    getMarketExchangeItem,
    getPoe2MarketExchange,
} from "~/db/queries/market.queries";
import { sStashUniqueHourlyS } from "~/db/schema/stash.unique-hourly";
import { ArbitrageGameSchema, MarketSnapshotSchema, VendorRecipeSchema } from "~/schemas/arbitrage";
import {
    marketCategorySchema,
    marketExchangeItemInputSchema,
    marketExchangeListRowSchema,
    marketExchangeRowSchema,
    marketExchangeUnitSchema,
    marketFiltersSchema,
    mergedMarketPriceSchema,
    poe2MarketFiltersSchema,
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
// List rows and history merge or filter link counts, and show merchant tabs only, so a market row
// has neither. Its locked prices only order and filter the list.
const marketRow = sStashUniqueHourlyS.omit({
    links: true,
    tab: true,
    priceChaos: true,
    priceDivine: true,
    allTabsPriceChaos: true,
    allTabsPriceDivine: true,
});
const priceRates = (when: string) =>
    z
        .record(z.string(), z.number())
        .describe(
            `Units of each of the game's price currencies (PoE 1 chaos and divine; PoE 2 exalted, chaos, annul and divine) per exchange unit ${when}, for the value display; currencies without an exchange rate are absent`,
        );
const historyUnit = z
    .string()
    .describe("The currency `history` prices are in: chaos for PoE 1 realms, exalted for poe2");
const season = z.object({
    league: z.string(),
    firstHour: z.union([z.string(), z.number()]).nullable(),
    latestHour: z.union([z.string(), z.number()]).nullable(),
});
const watchersEyeModValues = z
    .array(
        z.object({
            signatureValue: z.string(),
            mod: z.string(),
            modCount: z.number(),
            listings: z.number(),
            cheapest: z.number().nullable(),
            medianAsk: z.number().nullable(),
            sales: z.number(),
            saleMedian: z.number().nullable(),
        }),
    )
    .nullable()
    .describe(
        "For a unique whose mods come from a pool (kinds watchers-eye, loreweave): each mod's value per mod count. Every item counts once for each of its mods at its full price, so these totals exceed the item's. Listings and asks are from the latest hour; likely sales and their median last ask cover the period, in the display currency. Open a mod's own market with its `signatureValue` as `value`. Lists and variants show such a unique as one market with an empty `value`.",
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
        execute: ({ game, league }, context) =>
            loadArbitrageMarket(context.db, game, league ?? null),
    }),
    defineOperation({
        ...shared,
        family: "market",
        path: "/",
        name: "get_season_market",
        ui: "/1/market/currency",
        description:
            "Read season market rows with the UI's filters and pagination; category `all` lists every unique, currency and other item category. Without `corruption`, the `weapons`, `armour`, `accessories` and `forbidden` categories list uncorrupted markets and the others any corruption; the returned `filters` carry the applied value. The `forbidden` category lists Forbidden Flame and Forbidden Flesh (kind `forbidden-jewel`, `value` the allocated ascendancy notable), which `jewels` leaves out, all on one page. The crafting base categories (`armour-bases`, `weapon-bases`, `accessory-bases`, `flask-bases`, `cluster-jewel-bases`) list clean normal, magic and rare equipment (kind `base`) per base, with `value` naming its item level band, links, quality band or Cluster Jewel skill and passive count (e.g. `ilvl 86+ · 6 links · Quality 30%+`). With an item, returns that item's history and every variant of it in the period instead of rows; history merges every listing currency at each hour's exchange rate into `historyUnit`, whatever `currency` is.Rows and an item without `links` merge every link count; `links` (0 for under 5, 5 or 6) reads one linked-socket market of a unique, as poe.ninja splits body armours and two-handed weapons. Skill gems (kind `gem`) list one market per gem, level band, quality band and corruption state, with `value` naming the bands (e.g. `Level 20 (max) · Quality 20%`); `gemLevel` and `gemQuality` include or exclude bands, and `gemTransfigured` and `gemVaal` keep only transfigured or Vaal gems, or only others. Tier and Nightmare maps (kind `map`, item `Map (Tier 16)` or `Nightmare Map`) list one market per base, corruption, identification, mod count band, delirium, influence (Shaper, Elder, Elder Guardian for any guardian, or Memory) and, for tier 16 and Nightmare maps, item quantity band, with `value` naming them (e.g. `8 mods · Quantity 100–119% · Delirium 40%`, `Unidentified · Delirium 0%`, or `1–6 mods · Delirium 0% · Memory`); `mapMods`, `mapQuantity`, `mapDelirium` and `mapInfluence` include or exclude bands.",
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
                    baseDescription: z
                        .string()
                        .nullable()
                        .describe(
                            "A crafting base's item class, attributes and level requirement; null otherwise",
                        ),
                    recentSales: z.object({
                        hourly: z
                            .array(z.number())
                            .describe(
                                "Likely sales in each of the 24 hours to the season's latest, oldest first",
                            ),
                        daily: z
                            .array(z.number())
                            .describe(
                                "Likely sales on each of the 7 UTC days to the season's latest hour, oldest first",
                            ),
                    }),
                }),
            ),
            hasMore: z.boolean(),
            baseDescription: z
                .string()
                .nullable()
                .describe("With a crafting base item, its item class, attributes and level"),
            exchange: z
                .array(marketExchangeListRowSchema)
                .describe(
                    "Items on the exchange, dearest first, priced in `exchangeUnit`; their stash listings are left out of rows. Read one with get_season_exchange_item",
                ),
            exchangeUnit: marketExchangeUnitSchema,
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
                        .extend({
                            periodSales: z.number(),
                            latestHour: z
                                .number()
                                .describe("The latest hour in the period the variant was listed"),
                            listingCount: z.number().describe("Listings in `latestHour`"),
                            prices: marketRow.shape.prices.describe(
                                "Asking prices per listing currency in `latestHour`",
                            ),
                            links: z
                                .number()
                                .nullable()
                                .describe(
                                    "5 or 6 linked sockets, 0 for fewer; null for the market merging every link count (pass it as `links` to read one)",
                                ),
                        }),
                )
                .describe(
                    "The item's markets, plus the same unique's markets in the other identification state (unidentified uniques are keyed unid:<icon>). A market with 5- or 6-link copies also lists each link count",
                ),
            modValues: watchersEyeModValues,
            priceRates: priceRates("at the season's latest hour"),
            historyUnit,
            history: z.array(
                marketRow.extend({
                    merged: mergedMarketPriceSchema
                        .nullable()
                        .describe(
                            "Asking prices from every listing currency, each converted at this hour's exchange rate into `historyUnit`",
                        ),
                    mergedSales: mergedMarketPriceSchema
                        .nullable()
                        .describe("Last asks of likely sales, converted like `merged`"),
                    mergedDelisted: mergedMarketPriceSchema
                        .nullable()
                        .describe(
                            "Last asks of removals that are not likely sales, relists or undecided, converted like `merged`",
                        ),
                    priceRates: priceRates("at this hour"),
                }),
            ),
        }),
        execute: async (filters, context) => {
            return getMarketData(context.db, filters, filters.item ? "history" : "list");
        },
    }),
    defineOperation({
        ...shared,
        family: "market",
        path: "/exchange-item",
        name: "get_season_exchange_item",
        ui: "/1/market/currency",
        description:
            "Read one currency exchange item (an item ID from the season market's `exchange` rows, or the PoE 2 market's `rows` with realm `poe2`): its current price in `unit`, 7-day trend, volume and most traded pair as listed, plus its hourly history over the last `days` days through its chaos, divine and exalted pairs and its eight other most traded pairs. An empty league reads the league whose exchange traded most recently.",
        input: marketExchangeItemInputSchema,
        output: z.object({
            realm: z.string(),
            league: z.string(),
            seasons: z.array(season).describe("Leagues with exchange data, active leagues first"),
            latestHour: z.number().describe("The latest completed hour"),
            historyStart: z.number().describe("The first hour of `history`"),
            unit: marketExchangeUnitSchema,
            item: marketExchangeRowSchema
                .nullable()
                .describe("Null for an item ID outside the game's exchange item catalogue"),
            divine: z
                .number()
                .nullable()
                .describe("Exchange units per Divine Orb, as the list prices it, for display"),
            priceRates: priceRates("as the list prices them"),
            history: z.object({
                prices: z
                    .array(
                        z.object({
                            hour: z.number(),
                            price: z.number().nullable(),
                            low: z.number().nullable(),
                            high: z.number().nullable(),
                            p25: z.number().nullable(),
                            p75: z.number().nullable(),
                            via: z.string().nullable(),
                            units: z.number(),
                        }),
                    )
                    .describe(
                        "Each hour the item traded, oldest first: its volume-weighted price in the exchange unit (directly or through `via`; null when only `lowVolume` pairs traded, since they do not set it), the hour's lowest and highest rates of that pair in the exchange unit (scaled by `via`'s price), their interquartile range estimated from those rates and the volume-weighted price (null at 8 units or fewer on that pair), and units traded across its pairs",
                    ),
                pairs: z
                    .array(
                        z.object({
                            quoteId: z.string(),
                            name: z.string(),
                            hours: z.array(
                                z.object({
                                    hour: z.number(),
                                    rate: z.number(),
                                    low: z.number().nullable(),
                                    high: z.number().nullable(),
                                    p25: z.number().nullable(),
                                    p75: z.number().nullable(),
                                    units: z.number(),
                                }),
                            ),
                            lowVolume: z
                                .boolean()
                                .describe(
                                    "Traded in under a tenth of the hours of the item's busiest pair over the period. These do not set the item's price, and the item page hides them by default",
                                ),
                        }),
                    )
                    .describe(
                        "Each pair, most traded first: per traded hour, units of the other item per unit (volume-weighted, lowest, highest and estimated interquartile range) and units of this item traded",
                    ),
            }),
        }),
        execute: (input, context) => getMarketExchangeItem(context.db, input),
    }),
    defineOperation({
        ...shared,
        family: "market",
        path: "/poe2-exchange",
        name: "get_poe2_season_exchange",
        ui: "/2/market/currency",
        description:
            "Read the PoE 2 season market: every item on the currency exchange in a category (the trade site's bulk exchange groups), priced in exalted, dearest first. Each row has its 7-day trend, volume and most traded pair; read one with get_season_exchange_item and realm `poe2`. An empty league reads the season whose exchange traded most recently.",
        input: poe2MarketFiltersSchema,
        output: z.object({
            filters: poe2MarketFiltersSchema,
            seasons: z.array(season),
            season: season.optional(),
            unit: marketExchangeUnitSchema,
            divine: z.number().nullable().describe("Exalted per Divine Orb, for display"),
            priceRates: priceRates("as the rows price them"),
            rows: z.array(marketExchangeListRowSchema),
        }),
        execute: (input, context) => getPoe2MarketExchange(context.db, input),
    }),
];

export function getOperation(name: string) {
    return operations.find((operation) => operation.name === name);
}
