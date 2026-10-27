import { tradeListingSchema, tradeSaleSchema } from "@poe-tools/trade-bridge";
import { z } from "zod";
import { craftingItemSchema } from "./crafting";

const id = z.string().min(1).max(100);
const count = z.number().int().nonnegative();

export const buyInConfidenceSchema = z.enum(["high", "medium", "low"]);

export const buyInCountsSchema = z.strictObject({
    /** Listings the trade site reported for the search that produced the price. */
    results: count,
    /** Listings fetched and checked. */
    fetched: count,
    /** Fetched listings that matched the stage and had a usable price. */
    matching: count,
    /** Matching listings within 20% of the stage price. */
    nearPrice: count,
    notMatching: count,
    unreadable: count,
    /** Matching listings priced in a currency with no exchange rate. */
    unconverted: count,
    /** In-person listings dropped as likely bait (under half the median of the five cheapest). */
    bait: count,
});

/** One stage's trade price, stored on the graph so it syncs with the project. */
export const buyInStageSchema = z.strictObject({
    /** Fingerprint of the stage query, game, league and currency the price was taken for. */
    key: z.string().min(1).max(100),
    observedAt: z.iso.datetime(),
    status: z.enum(["priced", "no-listings"]),
    price: z
        .strictObject({ amount: z.number().positive(), currency: z.string().min(1).max(100) })
        .nullable(),
    sale: tradeSaleSchema.nullable(),
    confidence: buyInConfidenceSchema.nullable(),
    counts: buyInCountsSchema,
    /** The cheapest matching listing's item, used as the purchased item downstream. */
    item: craftingItemSchema.nullable(),
});

export const craftingBuyInSchema = z.strictObject({
    includeInPerson: z.boolean().default(false),
    stages: z.record(id, buyInStageSchema).default({}),
});

/** A trade listing checked against a stage, with its price in the graph currency. */
export const checkedListingSchema = z.strictObject({
    listing: tradeListingSchema,
    status: z.enum(["match", "no-match", "unreadable"]),
    /** Listing price converted to the graph currency; null without an exchange rate. */
    amount: z.number().positive().nullable(),
    item: craftingItemSchema.nullable(),
});

/** Graph-currency value of one unit of each listing currency, keyed by trade currency ID. */
export const buyInRatesSchema = z.record(z.string().min(1).max(64), z.number().positive());

export const buyInFreshnessSchema = z.enum(["fresh", "aging", "stale"]);

const total = z.number().nonnegative().nullable();
const comparisonFields = {
    /** Expected cost per successful final outcome. */
    total,
    probability: z.number().min(0).max(1).nullable(),
    meanActions: total,
    missingPrices: z.array(z.string()),
};

export const buyInComparisonSchema = z.strictObject({
    currency: z.string(),
    scratch: z.strictObject(comparisonFields),
    stages: z.array(
        z.strictObject({
            stageId: id,
            name: z.string(),
            /** Expected cost of producing one item at this stage by crafting. */
            craftToHere: total,
            status: z.enum(["priced", "no-listings", "unpriced", "not-searchable"]),
            price: buyInStageSchema.shape.price,
            sale: buyInStageSchema.shape.sale,
            confidence: buyInStageSchema.shape.confidence,
            observedAt: z.iso.datetime().nullable(),
            freshness: buyInFreshnessSchema.nullable(),
            ...comparisonFields,
            error: z.string().optional(),
        }),
    ),
    /** The cheapest way to the final outcome: a stage to buy at, or null to craft from scratch. */
    recommendation: z
        .strictObject({ stageId: id.nullable(), total: z.number().nonnegative() })
        .nullable(),
    /** True when the recommended stage's price is older than 24 hours. */
    stalePrices: z.boolean(),
});

export type BuyInStage = z.infer<typeof buyInStageSchema>;
export type BuyInFreshness = z.infer<typeof buyInFreshnessSchema>;
export type BuyInComparison = z.infer<typeof buyInComparisonSchema>;
export type BuyInCounts = z.infer<typeof buyInCountsSchema>;
export type CraftingBuyIn = z.infer<typeof craftingBuyInSchema>;
export type CheckedListing = z.infer<typeof checkedListingSchema>;
export type BuyInRates = z.infer<typeof buyInRatesSchema>;
