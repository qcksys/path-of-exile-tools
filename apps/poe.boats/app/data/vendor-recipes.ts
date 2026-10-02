import type { ArbitrageGame, RecipeCategory, VendorRecipe } from "~/schemas/arbitrage";
import { CURRENCY_VENDOR_RECIPES } from "./currency-vendor-recipes";

function upgradeChain(
    game: ArbitrageGame,
    category: RecipeCategory,
    names: string[],
): VendorRecipe[] {
    return names.slice(0, -1).map((name, index) => {
        const inputId = name.toLowerCase().replaceAll(" ", "-");
        const outputName = names[index + 1];
        const wiki = game === "1" ? "www.poewiki.net" : "www.poe2wiki.net";
        return {
            id: `${game}:${inputId}`,
            game,
            category,
            input: { id: inputId, name, quantity: 3 },
            output: {
                id: outputName.toLowerCase().replaceAll(" ", "-"),
                name: outputName,
                quantity: 1,
            },
            source: `https://${wiki}/wiki/${encodeURIComponent(outputName.replaceAll(" ", "_"))}`,
        };
    });
}

const essenceTiers = [
    "Whispering", "Muttering", "Weeping", "Wailing", "Screaming", "Shrieking", "Deafening",
];
const essenceFamiliesByFirstTier = [
    ["Greed", "Contempt", "Hatred", "Woe"],
    ["Fear", "Anger", "Torment", "Sorrow"],
    ["Rage", "Suffering", "Wrath", "Doubt"],
    ["Loathing", "Zeal", "Anguish", "Spite"],
    ["Scorn", "Envy", "Misery", "Dread"],
];

export const VENDOR_RECIPES: VendorRecipe[] = [
    ...upgradeChain("1", "oils", [
        "Clear", "Sepia", "Amber", "Verdant", "Teal", "Azure", "Indigo", "Violet",
        "Crimson", "Black", "Opalescent", "Silver", "Golden",
    ].map((name) => `${name} Oil`)),
    ...essenceFamiliesByFirstTier.flatMap((families, firstTier) =>
        families.flatMap((family) => upgradeChain("1", "essences",
            essenceTiers.slice(firstTier).map((tier) => `${tier} Essence of ${family}`))),
    ),
    ...CURRENCY_VENDOR_RECIPES,
    ...upgradeChain("2", "emotions", [
        "Diluted Liquid Ire", "Diluted Liquid Guilt", "Diluted Liquid Greed",
        "Liquid Paranoia", "Liquid Envy", "Liquid Disgust", "Liquid Despair",
        "Concentrated Liquid Fear", "Concentrated Liquid Suffering", "Concentrated Liquid Isolation",
    ]),
    ...[
        "the Body", "the Mind", "Enhancement", "Abrasion", "Flames", "Ice", "Electricity",
        "Ruin", "Battle", "Sorcery", "Haste", "the Infinite", "Seeking", "Alacrity",
        "Grounding", "Insulation", "Thawing", "Opulence", "Command",
    ].flatMap((family) => upgradeChain("2", "essences", [
        `Lesser Essence of ${family}`, `Essence of ${family}`, `Greater Essence of ${family}`,
    ])),
    ...[
        "Desert", "Glacial", "Storm", "Iron", "Body", "Mind", "Rebirth", "Inspiration",
        "Stone", "Vision", "Adept", "Robust", "Resolve",
    ].flatMap((family) => upgradeChain("2", "runes", [
        `Lesser ${family} Rune`, `${family} Rune`, `Greater ${family} Rune`,
    ])),
];

export const RECIPE_CATEGORY_LABELS: Record<RecipeCategory, string> = {
    currency: "Currency exchanges",
    oils: "Oils",
    essences: "Essences",
    emotions: "Liquid emotions",
    runes: "Runes",
};

export function getVendorRecipes(game: ArbitrageGame): VendorRecipe[] {
    return VENDOR_RECIPES.filter((recipe) => recipe.game === game);
}
