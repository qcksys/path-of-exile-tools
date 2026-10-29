/** A completed hour of captured listings. */
export const recipeSourceHour = 1791428400;

export const yellowBeastComponent = {
    itemKey: "yellow-beast",
    quantity: 2,
    unitPrice: 3,
    listingCount: 100,
    hour: recipeSourceHour,
    pool: {
        estimator: "listing-count-weighted-mean-v1" as const,
        species: [
            { name: "Mountain Lynx", unitPrice: 3, listingCount: 100, hour: recipeSourceHour },
        ],
    },
};
