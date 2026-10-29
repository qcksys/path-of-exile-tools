import { z } from "zod";
import type { TDatabase } from "~/db/client";
import { findCraftingCommodityPrices } from "~/db/queries/crafting-commodities.queries";
import { findCraftingExchangePrices } from "~/db/queries/crafting-exchange.queries";
import { knownCraftingExchangeItems } from "~/db/queries/crafting-exchange-membership.queries";
import {
    findCraftingRecipeListings,
    type RecipeListing,
    recipeMarketKey,
} from "~/db/queries/crafting-recipes.queries";
import type { CraftingEngine } from "~/lib/crafting-engine";
import {
    type CraftingSourceComponent,
    craftingCommodityIdentity,
    craftingSourceRecipe,
} from "~/lib/crafting-sources";
import { craftingVendorUpgrade } from "~/lib/crafting-vendor-upgrades";
import {
    yellowBeastId,
    yellowBeastNames,
    yellowBeastPolicy,
    yellowBeastPool,
} from "~/lib/crafting-yellow-beasts";
import type { CraftingGraph } from "~/schemas/crafting-graph";
import {
    type CommoditySourceIdentity,
    type CraftingSourceOptions,
    type CraftingSourceResult,
    craftingSourceQuoteSchema,
} from "~/schemas/crafting-sources";

type Recipe = { id: string; category: "Beast" | "Temple"; components: CraftingSourceComponent[] };

/** Each recipe priced from its components' captured listings, or why it stays unpriced. */
async function priceRecipes(
    db: TDatabase,
    graph: CraftingGraph,
    currency: "chaos" | "divine" | "exalted",
    recipes: Recipe[],
    at: number | undefined,
    result: CraftingSourceResult,
) {
    const pooled = recipes.some(({ components }) =>
        components.some((component) => component.itemKey === yellowBeastId),
    );
    const markets = [
        ...recipes.flatMap(({ components }) =>
            components.flatMap(({ itemKey, rooms }) =>
                itemKey === yellowBeastId ? [] : [{ itemKey, rooms }],
            ),
        ),
        ...(pooled ? yellowBeastNames.map((itemKey) => ({ itemKey })) : []),
    ];
    const listings = await findCraftingRecipeListings(db, graph.league!, currency, markets, at);
    const species = yellowBeastNames.flatMap((name) => {
        const listing = listings.get(name);
        return listing ? [{ name, ...listing }] : [];
    });
    for (const { id, category, components } of recipes) {
        try {
            const priced = components.map((component) => {
                if (component.itemKey === yellowBeastId) {
                    if (!species.length)
                        throw new Error(
                            `No captured ${currency} Yellow Beast asks; the whole recipe remains unpriced.`,
                        );
                    return {
                        ...component,
                        ...yellowBeastPool(species),
                        hour: Math.max(...species.map((entry) => entry.hour)),
                        pool: { estimator: yellowBeastPolicy, species },
                    };
                }
                const listing: RecipeListing | undefined = listings.get(recipeMarketKey(component));
                if (!listing)
                    throw new Error(
                        `No captured ${currency} asking price for ${component.rooms ? `${component.itemKey} (${component.rooms})` : component.itemKey} within 24 completed hours; the whole recipe remains unpriced.`,
                    );
                return { ...component, ...listing };
            });
            result.quotes[id] = craftingSourceQuoteSchema.parse({
                source: "stash-recipe",
                game: "poe1",
                realm: "pc",
                league: graph.league,
                currency,
                id,
                yellowBeasts: category === "Beast" ? yellowBeastPolicy : undefined,
                amount: priced.reduce((sum, entry) => sum + entry.quantity * entry.unitPrice, 0),
                hour: Math.max(...priced.map((entry) => entry.hour)),
                components: priced,
            });
        } catch (error) {
            result.missing[id] =
                error instanceof Error ? error.message : "Price source unavailable.";
        }
    }
}

export async function findCraftingSourcePrices(
    graph: CraftingGraph,
    engine: CraftingEngine,
    options: CraftingSourceOptions,
    db?: TDatabase,
    membership?: Set<string> | null,
): Promise<CraftingSourceResult> {
    const result: CraftingSourceResult = { quotes: {}, missing: {} };
    const recipes: Recipe[] = [];
    const commodities: CommoditySourceIdentity[] = [];
    for (const id of new Set(options.ids)) {
        try {
            if (options.realm !== "pc" || graph.game !== "poe1")
                throw new Error("These crafting price sources support PoE 1 PC only.");
            if (!graph.league) throw new Error("Choose a league before looking up prices.");
            const currency = z.enum(["chaos", "divine", "exalted"]).parse(graph.currency);
            if (options.vendorUpgrade) {
                if (!db) throw new Error("Captured ingredient exchange prices are unavailable.");
                const path = craftingVendorUpgrade(engine, id, options.vendorUpgrade.inputId);
                const prices = await findCraftingExchangePrices(db, {
                    game: "poe1",
                    realm: "pc",
                    league: graph.league,
                    currency,
                    itemIds: [path.inputId],
                    at: options.at,
                    conversion: options.vendorUpgrade.conversion,
                });
                const ingredient = prices.quotes[path.inputId];
                if (!ingredient)
                    throw new Error(
                        prices.missing[path.inputId] ??
                            "The selected vendor ingredient is unpriced.",
                    );
                result.quotes[id] = craftingSourceQuoteSchema.parse({
                    source: "vendor-upgrade",
                    game: "poe1",
                    realm: "pc",
                    league: graph.league,
                    currency,
                    id,
                    path,
                    ingredient,
                    conversion: options.vendorUpgrade.conversion,
                    amount: path.quantity * ingredient.amount,
                });
                continue;
            }
            const commodity = craftingCommodityIdentity(engine, id);
            if (commodity) {
                if (!db) throw new Error("Captured commodity prices are unavailable.");
                commodities.push(commodity);
                continue;
            }
            const recipe = craftingSourceRecipe(engine, id, options.assumption);
            if (!db) throw new Error("Captured beast and temple prices are unavailable.");
            recipes.push({ id, ...recipe });
        } catch (error) {
            result.missing[id] =
                error instanceof Error ? error.message : "Price source unavailable.";
        }
    }
    if (recipes.length && db)
        await priceRecipes(
            db,
            graph,
            z.enum(["chaos", "divine", "exalted"]).parse(graph.currency),
            recipes,
            options.at,
            result,
        );
    if (commodities.length && db) {
        const known =
            membership === undefined
                ? await knownCraftingExchangeItems(db, graph.league!, options.at)
                : membership;
        const eligible = commodities.filter((commodity) => {
            if (known && !known.has(commodity.id)) return true;
            result.missing[commodity.id] = known
                ? "This item has a captured exchange market. Use an exchange quote; the current hour may be unpriced."
                : "Exchange market membership exceeds the safe lookup limit. Use an exchange quote or a manual price.";
            return false;
        });
        const captured = await findCraftingCommodityPrices(
            db,
            graph,
            eligible,
            options.at,
            options.conversion,
        );
        Object.assign(result.quotes, captured.quotes);
        Object.assign(result.missing, captured.missing);
    }
    return result;
}
