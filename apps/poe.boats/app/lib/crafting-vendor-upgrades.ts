import { convertExchangeQuote, type ExchangeQuote, quoteExchangeSnapshot } from "@poe-tools/market";
import { VENDOR_RECIPES } from "~/data/vendor-recipes";
import type { VendorUpgradePath } from "~/schemas/crafting-sources";
import type { CraftingEngine } from "./crafting-engine";

export function craftingVendorUpgradePaths(
    engine: CraftingEngine,
    outputId: string,
): VendorUpgradePath[] {
    if (engine.catalog.game !== "poe1") return [];
    const identity = (name: string) => {
        const essences = engine.catalog.crafting.essences.filter((entry) => entry.name === name);
        const currencies = engine.catalog.crafting.currencies.filter(
            (entry) => entry.name === name,
        );
        return essences.length === 1 &&
            currencies.length === 1 &&
            essences[0]!.id === currencies[0]!.id
            ? essences[0]
            : undefined;
    };
    const output = engine.catalog.crafting.essences.find((entry) => entry.id === outputId);
    if (!output || identity(output.name)?.id !== outputId) return [];
    const paths: VendorUpgradePath[] = [];
    let current = output;
    let quantity = 1;
    const steps: VendorUpgradePath["steps"] = [];
    for (let depth = 0; depth < 6; depth++) {
        const recipes = VENDOR_RECIPES.filter(
            (recipe) =>
                recipe.game === "1" &&
                recipe.category === "essences" &&
                recipe.output.name === current.name,
        );
        const recipe = recipes.length === 1 ? recipes[0] : undefined;
        if (!recipe || recipe.input.quantity !== 3 || recipe.output.quantity !== 1) break;
        const input = identity(recipe.input.name);
        if (!input || input.level !== current.level - 1 || input.corrupted || current.corrupted)
            break;
        steps.unshift({
            recipeId: recipe.id,
            inputId: input.id,
            inputName: input.name,
            outputId: current.id,
            outputName: current.name,
            inputQuantity: 3,
            outputQuantity: 1,
        });
        quantity *= 3;
        paths.push({
            inputId: input.id,
            inputName: input.name,
            outputId,
            outputName: output.name,
            quantity,
            steps: [...steps],
        });
        current = input;
    }
    return paths;
}

export function craftingVendorUpgrade(engine: CraftingEngine, outputId: string, inputId: string) {
    const path = craftingVendorUpgradePaths(engine, outputId).find(
        (entry) => entry.inputId === inputId,
    );
    if (!path)
        throw new Error(
            "No verified forward PoE 1 essence vendor-upgrade path connects these exact inputs.",
        );
    return path;
}

export function validVendorIngredientQuote(quote: ExchangeQuote) {
    const direct = (entry: ExchangeQuote) => {
        if (
            entry.estimator !== "traded-volume-ratio-v1" ||
            entry.hour === null ||
            entry.marketId === null ||
            entry.legs ||
            entry.window ||
            (entry.windowStart !== undefined && entry.windowStart !== entry.hour)
        )
            return null;
        return quoteExchangeSnapshot(
            {
                realm: entry.realm,
                league: entry.league,
                hour: entry.hour,
                marketId: entry.marketId,
                volumeTraded: {
                    [entry.itemId]: entry.itemVolume ?? 0,
                    [entry.quoteId]: entry.quoteVolume ?? 0,
                },
                lowestRatio: null,
                highestRatio: null,
            },
            entry.itemId,
            entry.quoteId,
        );
    };
    let verified = direct(quote);
    if (
        quote.estimator === "cross-rate-v1" &&
        quote.conversion === "reference-currency-v1" &&
        quote.legs &&
        !quote.window &&
        (quote.windowStart === undefined || quote.windowStart === quote.hour) &&
        quote.low === null &&
        quote.high === null &&
        quote.marketId === null &&
        quote.itemVolume === null &&
        quote.quoteVolume === null
    ) {
        const first = direct(quote.legs[0]);
        const second = direct(quote.legs[1]);
        if (
            first &&
            second &&
            first.amount === quote.legs[0].amount &&
            second.amount === quote.legs[1].amount
        )
            verified = convertExchangeQuote(first, second);
    }
    return (
        !!verified &&
        verified.amount === quote.amount &&
        verified.itemId === quote.itemId &&
        verified.quoteId === quote.quoteId &&
        verified.realm === quote.realm &&
        verified.league === quote.league &&
        verified.hour === quote.hour
    );
}
