import type { VendorRecipe } from "~/schemas/arbitrage";

const currency = {
    wisdom: "Scroll of Wisdom",
    portal: "Portal Scroll",
    transmute: "Orb of Transmutation",
    aug: "Orb of Augmentation",
    alt: "Orb of Alteration",
    jewellers: "Jeweller's Orb",
    fusing: "Orb of Fusing",
    chance: "Orb of Chance",
    scour: "Orb of Scouring",
    regret: "Orb of Regret",
    alch: "Orb of Alchemy",
    scrap: "Armourer's Scrap",
    whetstone: "Blacksmith's Whetstone",
};

const purchases: [keyof typeof currency, number, keyof typeof currency, string][] = [
    ["wisdom", 3, "portal", "Nessa, Act 1"],
    ["portal", 7, "transmute", "Nessa, Act 1"],
    ["transmute", 4, "aug", "Nessa, Act 1"],
    ["aug", 4, "alt", "Nessa, Act 1"],
    ["alt", 2, "jewellers", "Yeena, Act 2"],
    ["jewellers", 4, "fusing", "Yeena, Act 2"],
    ["fusing", 1, "chance", "Clarissa, Act 3"],
    ["chance", 4, "scour", "Yeena, Act 2"],
    ["scour", 2, "regret", "Yeena, Act 2"],
    ["regret", 1, "alch", "Clarissa, Act 3"],
    ["whetstone", 1, "scrap", "Tarkleigh, Act 1"],
    ["scrap", 3, "whetstone", "Greust, Act 2"],
];
const wisdomExchanges: [keyof typeof currency, number][] = [
    ["portal", 1], ["scrap", 2], ["whetstone", 4], ["alt", 4], ["transmute", 4],
];

export const CURRENCY_VENDOR_RECIPES: VendorRecipe[] = [
    ...purchases.map(([input, quantity, output, vendor]): VendorRecipe => ({
        id: `1:purchase:${input}:${output}`,
        game: "1",
        category: "currency",
        method: "purchase",
        input: { id: input, name: currency[input], quantity },
        output: { id: output, name: currency[output], quantity: 1 },
        notes: `Purchase Items at ${vendor} or a later vendor. Do not use the sell window.`,
        source: "https://www.poewiki.net/wiki/Vendor#Prices",
    })),
    ...wisdomExchanges.map(([input, quantity]): VendorRecipe => ({
        id: `1:sell:${input}:wisdom`,
        game: "1",
        category: "currency",
        method: "sell",
        input: { id: input, name: currency[input], quantity: 1 },
        output: { id: "wisdom", name: currency.wisdom, quantity },
        notes: "Sell the input currency to any town vendor.",
        source: "https://www.poewiki.net/wiki/Vendor_recipe_system#Downgrade",
    })),
];
