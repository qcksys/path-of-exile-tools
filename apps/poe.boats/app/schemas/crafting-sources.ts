import {
    convertExchangeQuote,
    type ExchangeQuote,
    exchangeCurrencyId,
    exchangeQuoteSchema,
    quoteExchangeSnapshot,
} from "@poe-tools/market";
import { z } from "zod";

const scope = {
    game: z.literal("poe1"),
    realm: z.literal("pc"),
    league: z.string().min(1).max(100),
    currency: z.enum(["chaos", "divine", "exalted"]),
    id: z.string().min(1).max(500),
};
const assumption = z.literal("rare-beast-mountain-lynx-v1").optional();
const yellowBeasts = z.literal("listing-count-weighted-mean-v1").optional();
const conversion = z.literal("exchange-v1").optional();
export const vendorUpgradeOptionsSchema = z.strictObject({
    inputId: z.string().min(1).max(500),
    conversion: z.literal("reference-currency-v1").optional(),
});
export const vendorUpgradePathSchema = z.strictObject({
    inputId: z.string().min(1).max(500),
    inputName: z.string().min(1).max(100),
    outputId: z.string().min(1).max(500),
    outputName: z.string().min(1).max(100),
    quantity: z.number().int().positive().max(729),
    steps: z
        .array(
            z.strictObject({
                recipeId: z.string().min(1).max(150),
                inputId: z.string().min(1).max(500),
                inputName: z.string().min(1).max(100),
                outputId: z.string().min(1).max(500),
                outputName: z.string().min(1).max(100),
                inputQuantity: z.number().int().positive().max(729),
                outputQuantity: z.literal(1),
                method: z.literal("purchase").optional(),
                instructions: z.string().min(1).max(500).optional(),
                sourceUrl: z.url().startsWith("https://").max(1000).optional(),
            }),
        )
        .min(1)
        .max(6),
});
export const vendorUpgradeReferenceSchema = z.strictObject({
    ...scope,
    source: z.literal("vendor-upgrade"),
    path: vendorUpgradePathSchema,
    conversion: vendorUpgradeOptionsSchema.shape.conversion,
    ingredient: exchangeQuoteSchema,
});
export const vendorUpgradeQuoteSchema = vendorUpgradeReferenceSchema.extend({
    amount: z.number().positive(),
});
const ninjaReference = z.strictObject({
    ...scope,
    source: z.literal("poe.ninja"),
    assumption,
    yellowBeasts,
});
export const commoditySourceReferenceSchema = z.strictObject({
    ...scope,
    source: z.literal("stash-commodity"),
    baseType: z.string().min(1).max(100),
    conversion,
    exchange: z
        .strictObject({
            currency: scope.currency,
            amount: z.number().positive(),
            low: z.number().positive(),
            high: z.number().positive(),
            quote: exchangeQuoteSchema,
        })
        .optional(),
});
export const craftingSourceReferenceSchema = z.discriminatedUnion("source", [
    ninjaReference,
    commoditySourceReferenceSchema,
    vendorUpgradeReferenceSchema,
]);
const ninjaQuote = ninjaReference.extend({
    amount: z.number().positive(),
    fetchedAt: z.iso.datetime(),
    components: z
        .array(
            z.strictObject({
                detailsId: z.string().min(1).max(150),
                name: z.string().min(1).max(200),
                quantity: z.number().int().positive().max(4),
                unitPrice: z.number().positive(),
                listingCount: z.number().int().positive(),
                sourceUrl: z.url().startsWith("https://poe.ninja/poe1/api/economy/"),
                pool: z
                    .strictObject({
                        estimator: z.literal("listing-count-weighted-mean-v1"),
                        species: z
                            .array(
                                z.strictObject({
                                    detailsId: z.string().min(1).max(150),
                                    name: z.string().min(1).max(200),
                                    unitPrice: z.number().positive(),
                                    listingCount: z.number().int().positive(),
                                }),
                            )
                            .min(1)
                            .max(300),
                    })
                    .optional(),
            }),
        )
        .min(1)
        .max(4),
});
export const commoditySourceQuoteSchema = commoditySourceReferenceSchema
    .extend({
        amount: z.number().positive(),
        hour: z.number().int().nonnegative().multipleOf(3600),
        low: z.number().positive(),
        high: z.number().positive(),
        samples: z.number().int().positive(),
        listingCount: z.number().int().positive(),
        uniqueSellers: z.number().int().positive(),
    })
    .refine(
        (quote) =>
            quote.low <= quote.amount &&
            quote.amount <= quote.high &&
            quote.samples <= quote.listingCount &&
            quote.uniqueSellers <= quote.listingCount,
        "Commodity price range or sample counts are inconsistent.",
    )
    .refine((value) => {
        const exchange = value.exchange;
        if (!exchange) return true;
        const rate = exchange.quote;
        if (
            rate.estimator === "cross-rate-v1"
                ? !rate.legs ||
                  rate.marketId !== null ||
                  rate.itemVolume !== null ||
                  rate.quoteVolume !== null ||
                  rate.low !== null ||
                  rate.high !== null
                : rate.legs !== undefined
        )
            return false;
        if (
            value.conversion !== "exchange-v1" ||
            exchange.currency === value.currency ||
            exchange.low > exchange.amount ||
            exchange.amount > exchange.high ||
            rate.realm !== value.realm ||
            rate.league !== value.league ||
            rate.hour !== value.hour ||
            rate.window !== undefined ||
            (rate.windowStart !== undefined && rate.windowStart !== value.hour) ||
            rate.itemId !== exchangeCurrencyId(exchange.currency) ||
            rate.quoteId !== exchangeCurrencyId(value.currency)
        )
            return false;
        const direct = (quote: ExchangeQuote) =>
            quote.estimator === "traded-volume-ratio-v1" &&
            quote.hour === value.hour &&
            quote.realm === value.realm &&
            quote.league === value.league &&
            quote.window === undefined &&
            (quote.windowStart === undefined || quote.windowStart === value.hour) &&
            quote.marketId !== null
                ? quoteExchangeSnapshot(
                      {
                          realm: quote.realm,
                          league: quote.league,
                          hour: value.hour,
                          marketId: quote.marketId,
                          volumeTraded: {
                              [quote.itemId]: quote.itemVolume ?? 0,
                              [quote.quoteId]: quote.quoteVolume ?? 0,
                          },
                          lowestRatio: null,
                          highestRatio: null,
                      },
                      quote.itemId,
                      quote.quoteId,
                  )
                : null;
        let verified = direct(rate);
        if (rate.estimator === "cross-rate-v1" && rate.legs) {
            const first = direct(rate.legs[0]);
            const second = direct(rate.legs[1]);
            if (
                first &&
                second &&
                first.amount === rate.legs[0].amount &&
                second.amount === rate.legs[1].amount
            )
                verified = convertExchangeQuote(first, second);
        }
        if (
            !verified ||
            verified.itemId !== rate.itemId ||
            verified.quoteId !== rate.quoteId ||
            verified.amount !== rate.amount
        )
            return false;
        return [
            [value.amount, exchange.amount],
            [value.low, exchange.low],
            [value.high, exchange.high],
        ].every(
            ([converted, original]) =>
                Math.abs(converted! - original! * rate.amount) <= Math.max(1, converted!) * 1e-10,
        );
    }, "Commodity conversion must preserve the original asking range and a valid matching-hour exchange quote.");
export const craftingSourceQuoteSchema = z.discriminatedUnion("source", [
    ninjaQuote,
    commoditySourceQuoteSchema,
    vendorUpgradeQuoteSchema,
]);
export const craftingSourceOptionsSchema = z.strictObject({
    ids: z.array(z.string().min(1).max(500)).min(1).max(500),
    realm: z.enum(["pc", "xbox", "sony", "poe2"]),
    assumption,
    conversion,
    vendorUpgrade: vendorUpgradeOptionsSchema.optional(),
    at: z.number().int().nonnegative().optional(),
});
export const craftingSourceResultSchema = z.strictObject({
    quotes: z.record(z.string(), craftingSourceQuoteSchema),
    missing: z.record(z.string(), z.string()),
});
export type CraftingSourceReference = z.infer<typeof craftingSourceReferenceSchema>;
export type CraftingSourceQuote = z.infer<typeof craftingSourceQuoteSchema>;
export type CraftingSourceOptions = z.infer<typeof craftingSourceOptionsSchema>;
export type CraftingSourceResult = z.infer<typeof craftingSourceResultSchema>;
export type CommoditySourceQuote = z.infer<typeof commoditySourceQuoteSchema>;
export type VendorUpgradePath = z.infer<typeof vendorUpgradePathSchema>;
export type VendorUpgradeQuote = z.infer<typeof vendorUpgradeQuoteSchema>;
