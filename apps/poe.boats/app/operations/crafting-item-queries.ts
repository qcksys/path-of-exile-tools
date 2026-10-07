import {
    itemQuerySchema,
    itemQuerySelectionSchema,
    itemRecordSchema,
    queryFromItem,
} from "@poe-tools/item-query";
import { z } from "zod";
import { CraftingEngine } from "~/lib/crafting-engine";
import { queriesFromItemText } from "~/lib/crafting-item-query-text";
import { resolveRuleset } from "~/lib/crafting-rulesets";
import { craftingCatalogSchema } from "~/schemas/crafting";
import {
    craftingItemQueryTextInputSchema,
    craftingItemQueryTextResultSchema,
} from "~/schemas/crafting-item-query-text";
import { OperationError } from "./errors";
import { defineOperation } from "./operation";

const common = {
    family: "crafting",
    ui: "/1/crafting/projects",
    access: "public",
    readOnly: true,
    method: "post",
} as const;

export const craftingItemQueryOperations = [
    defineOperation({
        ...common,
        path: "/items/query",
        name: "create_item_query",
        description:
            "Create editable shared item requirements from an API-shaped item and resolved facts. Includes selected known properties, reports missing knowledge, and never guesses modifier identities.",
        input: z.object({
            item: itemRecordSchema,
            selection: itemQuerySelectionSchema.prefault({}),
        }),
        output: z.object({ query: itemQuerySchema, warnings: z.array(z.string()) }),
        execute: ({ item, selection }) => {
            try {
                return queryFromItem(item, selection);
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot create this item query.",
                    400,
                );
            }
        },
    }),
    defineOperation({
        ...common,
        path: "/items/query-from-text",
        name: "create_item_queries_from_text",
        description:
            "Resolve English copied item or Path of Building text against a selected catalog and create editable item queries. Returns all supported interpretations for explicit selection; does not silently choose an ambiguous base or modifier tier.",
        input: craftingItemQueryTextInputSchema,
        output: craftingItemQueryTextResultSchema,
        execute: async ({ game, ruleset: reference, text, selection }, context) => {
            try {
                const ruleset = resolveRuleset(
                    await context.loadCraftingRulesets(),
                    game,
                    reference,
                );
                const loaded = await context.loadCraftingRevision(ruleset);
                return queriesFromItemText(
                    new CraftingEngine(craftingCatalogSchema.parse(loaded.catalog)),
                    text,
                    selection,
                );
            } catch (error) {
                throw new OperationError(
                    error instanceof Error ? error.message : "Cannot resolve this item text.",
                    400,
                );
            }
        },
    }),
];
