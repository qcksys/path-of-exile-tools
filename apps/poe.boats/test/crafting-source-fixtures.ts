export const yellowBeastComponent = {
    detailsId: "yellow-beast",
    name: "Yellow Beast",
    quantity: 2,
    unitPrice: 3,
    listingCount: 100,
    sourceUrl: "https://poe.ninja/poe1/api/economy/stash/current/item/overview",
    pool: {
        estimator: "listing-count-weighted-mean-v1" as const,
        species: [
            { detailsId: "mountain-lynx", name: "Mountain Lynx", unitPrice: 3, listingCount: 100 },
        ],
    },
};
