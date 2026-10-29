import data from "./crafting-yellow-beasts.generated.json" with { type: "json" };

export const yellowBeastPolicy = "listing-count-weighted-mean-v1" as const;
export const yellowBeastId = "yellow-beast";
/** Species that can fill a recipe's generic rare sacrifices, which stash listings key by name. */
export const yellowBeastNames: readonly string[] = data.names;
/** Every capturable species: the generic ones and those recipes name or the game disables. */
export const bestiaryNames: readonly string[] = [...data.names, ...data.excludedNames];
const names = new Set(yellowBeastNames);

export interface YellowBeastEstimate {
    name: string;
    unitPrice: number;
    listingCount: number;
}

export function isYellowBeast(name: string) {
    return names.has(name);
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
