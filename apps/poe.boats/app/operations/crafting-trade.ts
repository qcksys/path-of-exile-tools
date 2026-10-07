import { resolveRuleset } from "~/lib/crafting-rulesets";
import { buildCraftingTradeSearch, loadCraftingTradeMetadata } from "~/lib/crafting-trade";
import { craftingCatalogSchema } from "~/schemas/crafting";
import { craftingTradeInputSchema, craftingTradeResultSchema } from "~/schemas/crafting-trade";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

export const craftingTradeOperations = [
    defineOperation({
        family: "crafting",
        path: "/items/trade",
        name: "build_crafting_trade_search",
        description:
            "Translate shared item requirements to an official PoE 1 or PoE 2 trade search URL. Reports every omitted or approximate condition, including modifier identity and hybrid/tier ambiguity. Does not fetch listings or prices.",
        ui: "/1/crafting/projects",
        access: "public",
        readOnly: true,
        method: "post",
        input: craftingTradeInputSchema,
        output: craftingTradeResultSchema,
        execute: async ({ query, ruleset: reference, league }, context) => {
            try {
                const ruleset = resolveRuleset(
                    await context.loadCraftingRulesets(),
                    query.game,
                    reference,
                );
                const loaded = await context.loadCraftingRevision(ruleset);
                return buildCraftingTradeSearch(
                    craftingCatalogSchema.parse(loaded.catalog),
                    query,
                    league,
                    await loadCraftingTradeMetadata(query.game),
                );
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot translate this query.",
                    400,
                );
            }
        },
    }),
];
