import { z } from "zod";

export const cohortPriceReferenceSchema = z.strictObject({
    realm: z.enum(["pc", "xbox", "sony"]),
    league: z.string().min(1).max(100),
    revision: z.string().min(1).max(100),
    cohortId: z.string().min(1).max(128),
    window: z.literal("adaptive-v1").optional(),
    assumption: z.literal("display-equivalent-v1").optional(),
});
export type CohortPriceReference = z.infer<typeof cohortPriceReferenceSchema>;
const prefix = "cohort:v1:";
export function encodeCohortPriceReference(value: CohortPriceReference) {
    return `${prefix}${encodeURIComponent(JSON.stringify(cohortPriceReferenceSchema.parse(value)))}`;
}
export function decodeCohortPriceReference(value: string | undefined): CohortPriceReference | null {
    if (!value?.startsWith(prefix)) return null;
    try {
        return cohortPriceReferenceSchema.parse(
            JSON.parse(decodeURIComponent(value.slice(prefix.length))),
        );
    } catch {
        return null;
    }
}
