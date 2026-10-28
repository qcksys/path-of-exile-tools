import { z } from "zod";
import { exchangeListingCurrencySchema, exchangeQuoteSchema } from "./exchange.ts";

export const cohortPriceReferenceSchema = z.strictObject({
    realm: z.enum(["pc", "xbox", "sony"]),
    league: z.string().min(1).max(100),
    cohortId: z.string().min(1).max(128),
    window: z.literal("adaptive-v1").optional(),
    assumption: z.literal("display-equivalent-v1").optional(),
    sourcePreparation: sourcePreparationProfileSchema.optional(),
    conversion: z.literal("exchange-v1").optional(),
    exchange: z
        .strictObject({
            currency: exchangeListingCurrencySchema,
            quote: exchangeQuoteSchema,
        })
        .optional(),
});
export type CohortPriceReference = z.infer<typeof cohortPriceReferenceSchema>;
// References saved before cohorts were identified by ID alone carry a catalog revision; it is dropped.
const savedReferenceSchema = cohortPriceReferenceSchema
    .extend({ revision: z.string().min(1).max(100).optional() })
    .transform(({ revision: _revision, ...reference }) => reference);
const prefix = "cohort:v1:";
export function encodeCohortPriceReference(value: CohortPriceReference) {
    return `${prefix}${encodeURIComponent(JSON.stringify(cohortPriceReferenceSchema.parse(value)))}`;
}
export function decodeCohortPriceReference(value: string | undefined): CohortPriceReference | null {
    if (!value?.startsWith(prefix)) return null;
    try {
        return savedReferenceSchema.parse(
            JSON.parse(decodeURIComponent(value.slice(prefix.length))),
        );
    } catch {
        return null;
    }
}

import { sourcePreparationProfileSchema } from "@poe-tools/item-query";
