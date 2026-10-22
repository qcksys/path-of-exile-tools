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
