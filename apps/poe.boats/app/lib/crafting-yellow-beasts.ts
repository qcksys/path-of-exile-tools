import { isYellowBeast } from "@poe-tools/market";

export {
    bestiaryNames,
    isYellowBeast,
    yellowBeastMarket,
    yellowBeastNames,
} from "@poe-tools/market";

export const yellowBeastPolicy = "listing-count-weighted-mean-v1" as const;
export const yellowBeastId = "yellow-beast";

export interface YellowBeastEstimate {
    name: string;
    unitPrice: number;
    listingCount: number;
}

export function yellowBeastPool(estimates: YellowBeastEstimate[]) {
    if (
        !estimates.length ||
        new Set(estimates.map((entry) => entry.name)).size !== estimates.length
    )
        throw new Error("The Yellow Beast pool needs unambiguous positive species estimates.");
    let listingCount = 0;
    let weightedPrice = 0;
    for (const entry of estimates) {
        if (
            !isYellowBeast(entry.name) ||
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
