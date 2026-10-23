import data from "./crafting-yellow-beasts.generated.json" with { type: "json" };

export const yellowBeastPolicy = "listing-count-weighted-mean-v1" as const;
export const yellowBeastId = "yellow-beast";
const identities = new Map(
    data.names.map((name) => [
        name
            .toLowerCase()
            .replaceAll("'", "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
        name,
    ]),
);

export interface YellowBeastEstimate {
    detailsId: string;
    name: string;
    unitPrice: number;
    listingCount: number;
}

export function isYellowBeastIdentity(detailsId: string, name: string) {
    return identities.get(detailsId) === name;
}

export function yellowBeastPool(estimates: YellowBeastEstimate[]) {
    if (
        !estimates.length ||
        new Set(estimates.map((entry) => entry.detailsId)).size !== estimates.length
    )
        throw new Error("The Yellow Beast pool needs unambiguous positive species estimates.");
    let listingCount = 0;
    let weightedPrice = 0;
    for (const entry of estimates) {
        if (
            !isYellowBeastIdentity(entry.detailsId, entry.name) ||
            !Number.isFinite(entry.unitPrice) ||
            entry.unitPrice <= 0 ||
            !Number.isSafeInteger(entry.listingCount) ||
            entry.listingCount <= 0
        )
            throw new Error("The Yellow Beast pool contains an unsupported or unpriced species.");
        listingCount += entry.listingCount;
        weightedPrice += entry.unitPrice * entry.listingCount;
    }
    if (!Number.isSafeInteger(listingCount) || !Number.isFinite(weightedPrice))
        throw new Error("The Yellow Beast pool exceeds supported numeric bounds.");
    return { unitPrice: weightedPrice / listingCount, listingCount };
}
