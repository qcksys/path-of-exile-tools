import { type ExchangeSnapshot, exchangeCurrencyId, listingCurrencyId } from "@poe-tools/market";
import { describe, expect, it } from "vite-plus/test";
import type { MarketPriceSummary, TStashUniqueHourlyS } from "~/db/schema/stash.unique-hourly";
import { marketExchangePriceRates } from "~/lib/market-exchange";
import {
    chaosRatesByHour,
    marketDisplayRate,
    marketPriceRates,
    marketRatePairs,
    mergeMarketPrices,
    mergeMarketRows,
    mergePriceSummaries,
} from "~/lib/market-price-merge";

const hour = 1_792_836_000;
const chaos = exchangeCurrencyId("chaos")!;
const divine = exchangeCurrencyId("divine")!;
const mirror = exchangeCurrencyId("mirror")!;
const exalted = exchangeCurrencyId("exalted")!;
const wisdom = listingCurrencyId("wisdom", "poe1")!;
const annul = listingCurrencyId("annul", "poe2")!;

function snapshot(
    item: string,
    itemVolume: number,
    quote: string,
    quoteVolume: number,
    at = hour,
): ExchangeSnapshot {
    return {
        realm: "pc",
        league: "Season",
        marketId: `${item}|${quote}`,
        hour: at,
        volumeTraded: { [item]: itemVolume, [quote]: quoteVolume },
        lowestRatio: null,
        highestRatio: null,
    };
}

describe("merging listing currencies", () => {
    it("reproduces a single currency's stored quantiles exactly", () => {
        const summary = {
            count: 20,
            min: 1,
            mean: 3.5,
            p10: 1.5,
            p25: 2,
            median: 3,
            p75: 4,
            p90: 6,
            max: 10,
        };
        const expected = {
            mean: 525,
            min: 150,
            p10: 225,
            p25: 300,
            median: 450,
            p75: 600,
            p90: 900,
            max: 1500,
        };
        expect(mergeMarketPrices({ divine: summary }, () => 150)).toEqual({
            count: 20,
            unconverted: 0,
            ...Object.fromEntries(
                Object.entries(expected).map(([key, value]) => [key, expect.closeTo(value, 9)]),
            ),
        });
    });

    it("weights each currency's distribution by its listing count", () => {
        const merged = mergeMarketPrices(
            {
                chaos: { count: 30, min: 90, mean: 100, median: 100, max: 110 },
                divine: { count: 10, min: 2, mean: 2, median: 2, max: 2 },
            },
            (currency) => (currency === "divine" ? 100 : 1),
        )!;
        expect(merged.count).toBe(40);
        expect(merged.mean).toBe(125);
        expect(merged.min).toBe(90);
        expect(merged.max).toBe(200);
        // Three quarters of the listings sit between 90 and 110 chaos.
        expect(merged.median).toBeGreaterThan(90);
        expect(merged.median).toBeLessThan(110);
        expect(merged.p90).toBe(200);
    });

    it("counts listings without an exchange rate instead of guessing a price", () => {
        const merged = mergeMarketPrices(
            {
                chaos: { count: 3, min: 5, median: 5, max: 5 },
                "unknown-orb": { count: 2, min: 1, median: 1, max: 1 },
            },
            (currency) => (currency === "chaos" ? 1 : undefined),
        );
        expect(merged).toMatchObject({ count: 3, unconverted: 2, median: 5, mean: null });
        expect(
            mergeMarketPrices(
                { "unknown-orb": { count: 2, min: 1, median: 1, max: 1 } },
                () => undefined,
            ),
        ).toBeNull();
        expect(mergeMarketPrices(null, () => 1)).toBeNull();
    });
});

describe("merging foil variations", () => {
    function row(
        listingCount: number,
        prices: Record<string, MarketPriceSummary> | null,
        overrides: Partial<TStashUniqueHourlyS> = {},
    ) {
        return {
            foilVariation: 3,
            name: "Example",
            listingCount,
            uniqueSellers: listingCount,
            removedCount: 1,
            likelySales: 1,
            relistedCount: 0,
            pendingCount: 2,
            prices,
            salesPrices: null,
            firstSeenAt: "2026-10-24T02:00:00Z",
            lastSeenAt: "2026-10-24T02:00:00Z",
            ...overrides,
        };
    }

    it("keeps a single currency summary as stored and mixes repeated ones", () => {
        const chaosA = { count: 3, min: 10, mean: 10, median: 10, max: 10 };
        const chaosB = { count: 1, min: 50, mean: 50, median: 50, max: 50 };
        const divine = { count: 2, min: 1, median: 1, max: 1 };
        const merged = mergePriceSummaries([{ chaos: chaosA, divine }, { chaos: chaosB }, null])!;
        expect(merged.divine).toBe(divine);
        expect(merged.chaos).toMatchObject({ count: 4, min: 10, mean: 20, median: 10, max: 50 });
        expect(mergePriceSummaries([null, {}])).toBeNull();
    });

    it("sums counts, mixes prices and keeps the most listed row's details", () => {
        const merged = mergeMarketRows([
            row(1, { chaos: { count: 1, min: 100, median: 100, max: 100 } }, { name: "Few" }),
            row(
                3,
                { chaos: { count: 3, min: 20, median: 20, max: 20 } },
                {
                    foilVariation: 7,
                    name: "Most",
                    firstSeenAt: "2026-10-24T01:00:00Z",
                    salesPrices: { chaos: { count: 1, min: 25, median: 25, max: 25 } },
                },
            ),
            row(0, null, { lastSeenAt: "2026-10-24T03:00:00Z" }),
        ]);
        expect(merged).toMatchObject({
            foilVariation: 7,
            name: "Most",
            listingCount: 4,
            uniqueSellers: 4,
            removedCount: 3,
            likelySales: 3,
            pendingCount: 6,
            firstSeenAt: "2026-10-24T01:00:00Z",
            lastSeenAt: "2026-10-24T03:00:00Z",
            salesPrices: { chaos: { count: 1, median: 25 } },
        });
        expect(merged.prices!.chaos).toMatchObject({ count: 4, min: 20, median: 20, max: 100 });
    });

    it("returns a lone row unchanged", () => {
        const only = row(2, null);
        expect(mergeMarketRows([only])).toBe(only);
    });
});

describe("chaos exchange rates", () => {
    it("requests chaos, divine and exalted pairs for each listing currency", () => {
        const pairs = (a: string, b: string) => [`${a}|${b}`, `${b}|${a}`];
        const bridges = [
            ...pairs(divine, chaos),
            ...pairs(exalted, chaos),
            ...pairs(exalted, divine),
        ];
        expect(
            marketRatePairs(["chaos", "divine", "mirror", "not-a-currency"], "poe1").sort(),
        ).toEqual(
            [
                ...bridges,
                ...pairs(mirror, chaos),
                ...pairs(mirror, divine),
                ...pairs(mirror, exalted),
            ].sort(),
        );
        for (const game of ["poe1", "poe2"] as const)
            expect(marketRatePairs(["wisdom"], game)).toContain(`${wisdom}|${chaos}`);
    });

    it("takes the cheapest of the direct, divine and exalted paths for trade currencies", () => {
        const rates = chaosRatesByHour(
            [
                snapshot(divine, 10, chaos, 2000),
                snapshot(exalted, 10, chaos, 50),
                // 1 wisdom: 0.02 chaos direct, 0.01 chaos via exalted, 0.04 chaos via divine.
                snapshot(wisdom, 100, chaos, 2),
                snapshot(wisdom, 500, exalted, 1),
                snapshot(wisdom, 5000, divine, 1),
            ],
            ["wisdom", "divine", "exalted"],
        ).get(hour)!;
        expect(rates.get("wisdom")).toBeCloseTo(0.01);
        expect(rates.get("divine")).toBe(200);
        expect(rates.get("exalted")).toBe(5);
    });

    it("bridges divine through exalted when divine has no chaos pair", () => {
        const rates = chaosRatesByHour(
            [snapshot(divine, 1, exalted, 100), snapshot(exalted, 10, chaos, 20)],
            ["divine", "annul"],
        ).get(hour)!;
        expect(rates.get("divine")).toBe(200);
        expect(rates.has("annul")).toBe(false);
    });

    it("converts through chaos, bridges via divine and reuses rates up to a day old", () => {
        const rates = chaosRatesByHour(
            [snapshot(divine, 10, chaos, 1500), snapshot(mirror, 1, divine, 400)],
            ["chaos", "divine", "mirror"],
        );
        const now = marketDisplayRate(rates, "divine", hour);
        expect(now("chaos")).toBeCloseTo(1 / 150);
        expect(now("divine")).toBe(1);
        expect(now("mirror")).toBeCloseTo(400);
        expect(marketDisplayRate(rates, "chaos", hour + 86400)("divine")).toBe(150);
        expect(marketDisplayRate(rates, "chaos", hour + 86400 + 3600)("divine")).toBeUndefined();
        expect(marketDisplayRate(rates, "chaos", hour - 3600)("divine")).toBeUndefined();
    });
});

describe("price currencies", () => {
    it("rates each price currency per unit of the game's first one at that hour", () => {
        const rates = chaosRatesByHour(
            [
                snapshot(divine, 10, chaos, 1000),
                snapshot(divine, 10, chaos, 2000, hour + 3600),
                snapshot(exalted, 10, chaos, 50, hour + 3600),
                snapshot(annul, 1, exalted, 4, hour + 3600),
            ],
            ["divine", "exalted", "annul"],
        );
        expect(marketPriceRates(rates, "poe1", hour)).toEqual({ chaos: 1, divine: 0.01 });
        expect(marketPriceRates(rates, "poe1", hour + 3600)).toEqual({ chaos: 1, divine: 0.005 });
        expect(marketPriceRates(rates, "poe2", hour + 3600)).toEqual({
            exalted: 1,
            chaos: 5,
            annul: 0.25,
            divine: 0.025,
        });
        // Without a divine rate in the past day, only chaos remains.
        expect(marketPriceRates(rates, "poe1", hour - 3600)).toEqual({ chaos: 1 });
    });

    it("converts listings at their own hour's rate before merging them", () => {
        const prices = {
            chaos: { count: 1, min: 50, median: 50, max: 50 },
            divine: { count: 1, min: 1, median: 1, max: 1 },
        };
        const rates = chaosRatesByHour(
            [snapshot(divine, 1, chaos, 100), snapshot(divine, 1, chaos, 200, hour + 3600)],
            ["divine"],
        );
        expect(mergeMarketPrices(prices, marketDisplayRate(rates, "chaos", hour))).toMatchObject({
            count: 2,
            min: 50,
            max: 100,
        });
        expect(
            mergeMarketPrices(prices, marketDisplayRate(rates, "chaos", hour + 3600)),
        ).toMatchObject({ count: 2, min: 50, max: 200 });
    });

    it("rates price currencies from exchange rows priced in the game's unit", () => {
        const annulPoe2 = listingCurrencyId("annul", "poe2")!;
        expect(
            marketExchangePriceRates(
                [
                    { itemId: divine, price: 400 },
                    { itemId: chaos, price: 0.25 },
                    { itemId: annulPoe2, price: null },
                ],
                "poe2",
            ),
        ).toEqual({ exalted: 1, chaos: 4, divine: 1 / 400 });
        expect(marketExchangePriceRates([], "pc")).toEqual({ chaos: 1 });
    });
});
