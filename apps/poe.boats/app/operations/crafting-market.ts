import { exchangeQuoteSchema } from "@poe-tools/market";
import { z } from "zod";
import {
    craftingExchangeHistory,
    findCraftingExchangePrices,
} from "~/db/queries/crafting-exchange.queries";
import {
    craftingMarketHistory,
    findCraftingMarketPrices,
} from "~/db/queries/crafting-market.queries";
import { bindExchangePrice } from "~/lib/crafting-exchange";
import { bindCohortPurchasePrice } from "~/lib/crafting-market";
import { bindCraftingSourcePrice } from "~/lib/crafting-sources";
import {
    craftingExchangeHistoryInputSchema,
    craftingExchangeHistoryResultSchema,
    craftingExchangeInputSchema,
    craftingExchangeResultSchema,
} from "~/schemas/crafting-exchange";
import {
    craftingMarketCandidateSchema,
    craftingMarketHistoryInputSchema,
    craftingMarketHistoryResultSchema,
    craftingMarketInputSchema,
    craftingMarketRefreshResultSchema,
    craftingMarketResultSchema,
    craftingMarketSnapshotsInputSchema,
    craftingMarketSnapshotsResultSchema,
} from "~/schemas/crafting-market";
import {
    craftingSourceOptionsSchema,
    craftingSourceQuoteSchema,
    craftingSourceResultSchema,
} from "~/schemas/crafting-sources";
import { findCraftingSourcePrices } from "~/services/crafting-sources.server";
import { CraftingGraphContract } from "./crafting-contracts";
import {
    craftingMarketEngine,
    craftingMarketSnapshots,
    refreshCraftingMarketPrices,
} from "./crafting-market.server";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

export const craftingMarketOperations = [
    defineOperation({
        family: "crafting",
        path: "/market/sources",
        name: "find_crafting_source_prices",
        method: "post",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        description:
            "Look up PoE 1 PC beast recipes and Locus of Corruption using poe.ninja listing estimates. Prices every required beast; extra rare beasts require an explicit Mountain Lynx assumption. Level-sensitive recipes, non-tradeable services and unavailable components remain unknown. These are current aggregate asking prices, without historical coverage or calibrated confidence.",
        input: craftingSourceOptionsSchema.extend({ graph: CraftingGraphContract }),
        output: craftingSourceResultSchema,
        execute: async ({ graph, ...options }, context) =>
            findCraftingSourcePrices(graph, await craftingMarketEngine(graph, context), options),
    }),
    defineOperation({
        family: "crafting",
        path: "/market/sources/bind",
        name: "bind_crafting_source_price",
        method: "post",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        description:
            "Return a graph with one beast recipe or temple cost bound to a supplied poe.ninja estimate. Validates scope and the complete catalog recipe. Explicit selection replaces a manual amount; refresh preserves the source and rare-beast assumption. Does not save account data.",
        input: z.object({
            graph: CraftingGraphContract,
            id: z.string(),
            quote: craftingSourceQuoteSchema,
        }),
        output: z.object({ graph: CraftingGraphContract }),
        execute: async ({ graph, id, quote }, context) => {
            try {
                return {
                    graph: bindCraftingSourcePrice(
                        graph,
                        await craftingMarketEngine(graph, context),
                        id,
                        quote,
                    ),
                };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot bind this source price.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        family: "crafting",
        path: "/market/snapshots",
        name: "get_crafting_price_snapshots",
        method: "post",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        description:
            "Reprice an unchanged process at up to 24 historical UTC hours using each binding's latest observation at or before that hour. Returns independent snapshots for retained-engine calculation, preserving manual assumptions and acquisition choices. Missing bound prices produce a gap, never a cached present-day price. Does not save or modify the live project.",
        input: craftingMarketSnapshotsInputSchema.extend({ graph: CraftingGraphContract }),
        output: craftingMarketSnapshotsResultSchema.extend({
            points: z.array(
                craftingMarketSnapshotsResultSchema.shape.points.element.extend({
                    graph: CraftingGraphContract.nullable(),
                }),
            ),
        }),
        execute: async ({ graph, hours }, context) => {
            try {
                return await craftingMarketSnapshots(
                    context.db,
                    graph,
                    await craftingMarketEngine(graph, context),
                    hours,
                );
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot load historical prices.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        family: "crafting",
        path: "/market/exchange",
        name: "find_crafting_exchange_prices",
        method: "post",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        description:
            "Look up captured exchange trade-volume estimates for canonical crafting inputs in either game. Defaults to the latest hour. Optional adaptive-v1 considers complete 1/6/24-hour windows, widening below 100 traded input units while hourly prices vary at most 10%. Optional reference-currency-v1 converts missing direct pairs through positive matching-hour chaos/divine/exalted legs, preserving both legs and policy. No zero-volume leg is priced. These are historical trades, not current buy offers or calibrated confidence.",
        input: craftingExchangeInputSchema,
        output: craftingExchangeResultSchema,
        execute: (input, context) => findCraftingExchangePrices(context.db, input),
    }),
    defineOperation({
        family: "crafting",
        path: "/market/exchange/bind",
        name: "bind_crafting_exchange_price",
        method: "post",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        description:
            "Return a graph with one currency or essence cost bound to an exchange estimate. Checks item ID, game, league and accounting currency; selecting a quote explicitly replaces any manual amount for that cost.",
        input: z.object({
            graph: CraftingGraphContract,
            id: z.string(),
            quote: exchangeQuoteSchema,
        }),
        output: z.object({ graph: CraftingGraphContract }),
        execute: ({ graph, id, quote }) => {
            try {
                return { graph: bindExchangePrice(graph, id, quote) };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot bind this exchange price.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        family: "crafting",
        path: "/market/exchange/history",
        name: "get_crafting_exchange_price_history",
        method: "post",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        description:
            "Read paginated, realm/league-scoped hourly exchange volumes and ranges for a direct currency pair, retaining zero-volume hours as unknown prices.",
        input: craftingExchangeHistoryInputSchema,
        output: craftingExchangeHistoryResultSchema,
        execute: (input, context) => craftingExchangeHistory(context.db, input),
    }),
    defineOperation({
        family: "crafting",
        path: "/market/bind",
        name: "bind_crafting_item_price",
        method: "post",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        description:
            "Return a graph with a purchase priced from a supplied cohort snapshot. Checks item, output requirements, currency and league. Display-equivalent donor families require an explicit display-equivalent-v1 representative-item assumption and catalog validation. Saves the assumption and qualified cohort reference for live refresh; does not save account data or change acquisition pinning.",
        input: z.object({
            graph: CraftingGraphContract,
            nodeId: z.string(),
            alternativeId: z.string(),
            candidate: craftingMarketCandidateSchema,
        }),
        output: z.object({ graph: CraftingGraphContract }),
        execute: async ({ graph, nodeId, alternativeId, candidate }, context) => {
            try {
                return {
                    graph: bindCohortPurchasePrice(
                        graph,
                        await craftingMarketEngine(graph, context),
                        nodeId,
                        alternativeId,
                        candidate,
                    ),
                };
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot apply this market price.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        family: "crafting",
        path: "/market/refresh",
        name: "refresh_crafting_item_prices",
        method: "post",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        description:
            "Refresh bound equipment purchases, exchange costs and supported beast/temple estimates using their saved source scope and policies. Equipment follows compatible revisions with the same cohort ID, purpose and exact query. Preserves manual prices and crafting rules. Returns issues when compatibility cannot be established or a source is unavailable; cached unresolved prices must not be treated as current.",
        input: z.object({ graph: CraftingGraphContract }),
        output: craftingMarketRefreshResultSchema.extend({ graph: CraftingGraphContract }),
        execute: async ({ graph }, context) =>
            refreshCraftingMarketPrices(
                context.db,
                graph,
                await craftingMarketEngine(graph, context),
            ),
    }),
    defineOperation({
        family: "crafting",
        path: "/market/cohorts",
        name: "find_crafting_item_prices",
        method: "post",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        description:
            "Find captured equipment cohorts and latest asking prices for an API-shaped item and shared output requirements. Optional adaptive-v1 widens below ten priced sellers to deduplicated 6/24-hour medians when every source hour is present and hourly medians vary at most 10%. Optional display-equivalent-v1 treats the configured item as a representative for donor-family prices, without asserting identical modifier eligibility. Hourly history stays unchanged; confidence and policy thresholds are uncalibrated. Reports unsupported requirements and unknown matches. PoE 2 equipment stays manual.",
        input: craftingMarketInputSchema,
        output: craftingMarketResultSchema,
        execute: (input, context) => findCraftingMarketPrices(context.db, input),
    }),
    defineOperation({
        family: "crafting",
        path: "/market/history",
        name: "get_crafting_item_price_history",
        method: "post",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        description:
            "Read permanent, realm/league/revision-scoped hourly cohort asking-price history, including zero-price corrections, seller counts and confidence. Pages backwards without merging overlapping cohorts or currencies.",
        input: craftingMarketHistoryInputSchema,
        output: craftingMarketHistoryResultSchema,
        execute: (input, context) => craftingMarketHistory(context.db, input),
    }),
];
