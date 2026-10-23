import { quoteExchangeSnapshot } from "@poe-tools/market";
import { craftingVendorUpgrade } from "~/lib/crafting-vendor-upgrades";
import { vendorUpgradeQuoteSchema } from "~/schemas/crafting-sources";
import { engine } from "./crafting-fixtures";

export const vendorOutputId = "Metadata/Items/Currency/CurrencyEssenceRage3";
export const vendorInputId = "Metadata/Items/Currency/CurrencyEssenceRage1";
export const vendorMiddleId = "Metadata/Items/Currency/CurrencyEssenceRage2";
export const vendorHour = 1792645200;
export const vendorSnapshot = {
    realm: "pc" as const,
    league: "Standard",
    hour: vendorHour,
    marketId: `${vendorInputId}|Metadata/Items/Currency/CurrencyRerollRare`,
    volumeTraded: { [vendorInputId]: 3, "Metadata/Items/Currency/CurrencyRerollRare": 6 },
    lowestRatio: null,
    highestRatio: null,
};
export const vendorQuote = vendorUpgradeQuoteSchema.parse({
    source: "vendor-upgrade",
    game: "poe1",
    realm: "pc",
    league: "Standard",
    currency: "chaos",
    id: vendorOutputId,
    path: craftingVendorUpgrade(engine, vendorOutputId, vendorInputId),
    amount: 18,
    ingredient: quoteExchangeSnapshot(
        vendorSnapshot,
        vendorInputId,
        "Metadata/Items/Currency/CurrencyRerollRare",
    ),
});

export const vendorCurrencyInputId = "Metadata/Items/Currency/CurrencyUpgradeToMagic";
export const vendorCurrencyOutputId = "Metadata/Items/Currency/CurrencyAddModToMagic";
export const vendorCurrencySnapshot = {
    ...vendorSnapshot,
    marketId: `${vendorCurrencyInputId}|Metadata/Items/Currency/CurrencyRerollRare`,
    volumeTraded: {
        [vendorCurrencyInputId]: 3150,
        "Metadata/Items/Currency/CurrencyRerollRare": 7,
    },
};
export const vendorCurrencyQuote = vendorUpgradeQuoteSchema.parse({
    source: "vendor-upgrade",
    game: "poe1",
    realm: "pc",
    league: "Standard",
    currency: "chaos",
    id: vendorCurrencyOutputId,
    path: {
        inputId: vendorCurrencyInputId,
        inputName: "Orb of Transmutation",
        outputId: vendorCurrencyOutputId,
        outputName: "Orb of Augmentation",
        quantity: 4,
        steps: [
            {
                recipeId: "1:purchase:transmute:aug",
                inputId: vendorCurrencyInputId,
                inputName: "Orb of Transmutation",
                outputId: vendorCurrencyOutputId,
                outputName: "Orb of Augmentation",
                inputQuantity: 4,
                outputQuantity: 1,
                method: "purchase",
                instructions:
                    "Purchase Items at Nessa, Act 1 or a later vendor. Do not use the sell window.",
                sourceUrl: "https://www.poewiki.net/wiki/Vendor#Prices",
            },
        ],
    },
    amount: 4 * (7 / 3150),
    ingredient: quoteExchangeSnapshot(
        vendorCurrencySnapshot,
        vendorCurrencyInputId,
        "Metadata/Items/Currency/CurrencyRerollRare",
    ),
});
