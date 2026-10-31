import { expect, it } from "vite-plus/test";
import { marketListingPrices, marketLockedPrice } from "~/lib/market-listing-prices";

const summary = (median: number, count: number) => ({ count, min: median, median, max: median });

it("locks the most listed currency's median in chaos and divine", () => {
    const rates = { divine: 200, vaal: 2 };
    expect(marketLockedPrice({ chaos: summary(30, 13), divine: summary(7, 4) }, rates)).toEqual({
        priceChaos: 30,
        priceDivine: 0.15,
    });
    expect(marketLockedPrice({ divine: summary(20, 11) }, rates)).toEqual({
        priceChaos: 4000,
        priceDivine: 20,
    });
    expect(marketLockedPrice({ vaal: summary(50, 3), chaos: summary(1, 1) }, rates)).toEqual({
        priceChaos: 100,
        priceDivine: 0.5,
    });
});

it("locks what it can without a rate, and nothing for a market without prices", () => {
    expect(marketLockedPrice({ divine: summary(20, 1) }, {})).toEqual({
        priceChaos: null,
        priceDivine: 20,
    });
    expect(marketLockedPrice({ chaos: summary(30, 1) }, {})).toEqual({
        priceChaos: 30,
        priceDivine: null,
    });
    expect(marketLockedPrice({ fragment: summary(1, 9), chaos: summary(5, 1) }, {})).toEqual({
        priceChaos: null,
        priceDivine: null,
    });
    expect(marketLockedPrice(null, { divine: 200 })).toEqual({
        priceChaos: null,
        priceDivine: null,
    });
});

it("orders currencies cheapest first in chaos, then by listing count", () => {
    const prices = marketListingPrices(
        {
            divine: summary(6, 1),
            chaos: summary(1, 32),
            alt: summary(4, 1),
            vaal: summary(1, 2),
            scour: summary(2, 3),
            fragment: summary(1, 9),
            unknown: summary(1, 1),
        },
        { divine: 200, alt: 0.25, vaal: 1, scour: 0.5 },
    );
    // chaos, scour, vaal and alt all cost 1 chaos, so listing count breaks the tie.
    expect(prices.map((price) => price.currency)).toEqual([
        "chaos",
        "scour",
        "vaal",
        "alt",
        "divine",
        "fragment",
        "unknown",
    ]);
    expect(prices.map((price) => price.chaos)).toEqual([1, 1, 1, 1, 1200, undefined, undefined]);
});

it("restates chaos in divine, divine in chaos, and other currencies in whichever reads better", () => {
    const prices = Object.fromEntries(
        marketListingPrices(
            {
                chaos: summary(50, 1),
                divine: summary(2, 1),
                vaal: summary(3, 1),
                mirror: summary(1, 1),
                fragment: summary(1, 1),
            },
            { divine: 200, vaal: 1, mirror: 40_000 },
        ).map((price) => [price.currency, price.equivalent]),
    );
    expect(prices).toEqual({
        chaos: { amount: 0.25, currency: "divine" },
        divine: { amount: 400, currency: "chaos" },
        vaal: { amount: 3, currency: "chaos" },
        mirror: { amount: 200, currency: "divine" },
        fragment: undefined,
    });
});

it("keeps chaos values but skips divine equivalents when divine has no rate", () => {
    expect(
        marketListingPrices({ chaos: summary(50, 1), vaal: summary(3, 1) }, { vaal: 1 }),
    ).toEqual([
        {
            currency: "vaal",
            median: 3,
            count: 1,
            chaos: 3,
            equivalent: { amount: 3, currency: "chaos" },
            outlier: false,
        },
        {
            currency: "chaos",
            median: 50,
            count: 1,
            chaos: 50,
            equivalent: undefined,
            outlier: false,
        },
    ]);
});

it("flags currencies costing more than three times the most listed currency", () => {
    const outliers = (prices: Parameters<typeof marketListingPrices>[0]) =>
        marketListingPrices(prices, { divine: 200, vaal: 1 })
            .filter((price) => price.outlier)
            .map((price) => price.currency);
    expect(outliers({ chaos: summary(1, 32), vaal: summary(3, 2), divine: summary(6, 1) })).toEqual(
        ["divine"],
    );
    // A cheaper currency than the most listed one is never hidden.
    expect(outliers({ divine: summary(1, 10), chaos: summary(20, 1) })).toEqual([]);
    expect(outliers({ divine: summary(1, 10), chaos: summary(601, 1) })).toEqual(["chaos"]);
    // Tied most listed currencies are both kept; only currencies dearer than both are hidden.
    expect(outliers({ chaos: summary(60, 11), divine: summary(6, 11) })).toEqual([]);
    expect(
        outliers({ chaos: summary(60, 11), vaal: summary(60, 11), divine: summary(1, 1) }),
    ).toEqual(["divine"]);
    // Without a rate for the most listed currency there is nothing to compare against.
    expect(outliers({ fragment: summary(1, 32), divine: summary(6, 1) })).toEqual([]);
});
