import { type ExchangeSnapshot, exchangeCurrencyId } from "@poe-tools/market";
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
    it("requests direct and divine-bridged pairs for each listing currency", () => {
        expect(marketRatePairs(["chaos", "divine", "mirror", "not-a-currency"]).sort()).toEqual(
            [
                `${chaos}|${divine}`,
                `${divine}|${chaos}`,
                `${mirror}|${chaos}`,
                `${chaos}|${mirror}`,
                `${mirror}|${divine}`,
                `${divine}|${mirror}`,
            ].sort(),
        );
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
