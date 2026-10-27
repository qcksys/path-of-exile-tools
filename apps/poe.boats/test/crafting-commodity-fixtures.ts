import { exchangeCurrencyId, quoteExchangeSnapshot } from "@poe-tools/market";
import { emptyResonator } from "~/lib/crafting-empty-resonator";
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

export const emptyResonatorQuote = commoditySourceQuoteSchema.parse({
    ...commodityQuote,
    id: emptyResonator.ids[0],
    baseType: emptyResonator.baseType,
    variant: emptyResonator.variant,
});

export function legacyResonatorPrice(id = emptyResonatorQuote.id) {
    const reference = {
        source: "stash-commodity",
        game: "poe1",
        realm: "pc",
        league: "Standard",
        currency: "chaos",
        id,
        baseType: emptyResonator.baseType,
    };
    return {
        amount: 16.5,
        currency: "chaos",
        source: "market" as const,
        confidence: null,
        cohortId: `stash-commodity:v1:${encodeURIComponent(JSON.stringify(reference))}`,
    };
}

export const unravellingId = "Metadata/Items/Currency/CurrencyRemoveZanaInfluence";
export const unravellingName = "Orb of Unravelling";
export const unravellingQuote = commoditySourceQuoteSchema.parse({
    ...commodityQuote,
    id: unravellingId,
    baseType: unravellingName,
    amount: 200,
    low: 200,
    high: 200,
    samples: 1,
    listingCount: 12,
    uniqueSellers: 11,
});

export const divineId = exchangeCurrencyId("divine")!;
export const chaosId = exchangeCurrencyId("chaos")!;
export const commodityExchangeSnapshot = {
    realm: "pc" as const,
    league: "Standard",
    hour: commodityQuote.hour,
    marketId: `${divineId}|${chaosId}`,
    volumeTraded: { [divineId]: 100, [chaosId]: 30000 },
    lowestRatio: null,
    highestRatio: null,
};
export const convertedCommodityQuote = commoditySourceQuoteSchema.parse({
    ...commodityQuote,
    conversion: "exchange-v1",
    amount: 600,
    low: 600,
    high: 600,
    samples: 1,
    exchange: {
        currency: "divine",
        amount: 2,
        low: 2,
        high: 2,
        quote: {
            ...quoteExchangeSnapshot(commodityExchangeSnapshot, divineId, chaosId)!,
            conversion: "reference-currency-v1",
        },
    },
});
