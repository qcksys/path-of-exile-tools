import { commoditySourceQuoteSchema } from "~/schemas/crafting-sources";

export const essenceId = "Metadata/Items/Currency/CurrencyEssenceRage3";
export const essenceName = "Screaming Essence of Rage";
export const commodityQuote = commoditySourceQuoteSchema.parse({
    source: "stash-commodity",
    game: "poe1",
    realm: "pc",
    league: "Standard",
    currency: "chaos",
    id: essenceId,
    baseType: essenceName,
    hour: 1792663200,
    amount: 16.5,
    low: 3,
    high: 30,
    samples: 2,
    listingCount: 25,
    uniqueSellers: 24,
});
