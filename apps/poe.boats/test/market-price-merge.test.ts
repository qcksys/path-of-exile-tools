import { type ExchangeSnapshot, exchangeCurrencyId, listingCurrencyId } from "@poe-tools/market";
import { describe, expect, it } from "vite-plus/test";
import {
    chaosRatesByHour,
    marketDisplayRate,
    marketRatePairs,
    mergeMarketPrices,
} from "~/lib/market-price-merge";

const hour = 1_792_836_000;
const chaos = exchangeCurrencyId("chaos")!;
const divine = exchangeCurrencyId("divine")!;
const mirror = exchangeCurrencyId("mirror")!;
const exalted = exchangeCurrencyId("exalted")!;
const wisdom = listingCurrencyId("wisdom", "poe1")!;

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
