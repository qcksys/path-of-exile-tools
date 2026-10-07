import { describe, expect, it } from "vite-plus/test";
import { selectCohortPrice } from "../src/equipment-window.ts";
import { cohortHourlySchema } from "../src/prices.ts";
import { decodeCohortPriceReference, encodeCohortPriceReference } from "../src/reference.ts";

function fixture() {
    const price = { count: 1, sellers: 1, min: 20, median: 20, max: 20, confidence: 0.09 };
    return cohortHourlySchema.parse({
        realm: "pc",
        league: "Standard",
        hour: 1_790_899_200,
        revision: "test",
        cohortId: "base",
        listingCount: 1,
        uniqueSellers: 1,
        unknownCount: 0,
        confidenceMethod: "asking-sellers-coverage-v1",
        firstSeenAt: null,
        lastSeenAt: null,
        prices: {
            chaos: {
                ...price,
                windows: {
                    "6": {
                        ...price,
                        count: 6,
                        sellers: 6,
                        median: 21,
                        listingCount: 6,
                        unknownCount: 2,
                        hourlyMedianMin: 20,
                        hourlyMedianMax: 21,
                    },
                    "24": {
                        ...price,
                        count: 24,
                        sellers: 24,
                        median: 20.5,
                        listingCount: 24,
                        unknownCount: 3,
                        hourlyMedianMin: 20,
                        hourlyMedianMax: 21,
                    },
                },
            },
        },
    });
}

describe("equipment price windows", () => {
    it("preserves hourly prices and widens thin stable markets until the seller threshold", () => {
        const row = fixture();
        expect(selectCohortPrice(row, "chaos")).toMatchObject({ median: 20, hours: 1 });
        expect(selectCohortPrice(row, "chaos", "adaptive-v1")).toMatchObject({
            median: 20.5,
            count: 24,
            sellers: 24,
            hours: 24,
            windowStart: row.hour - 23 * 3600,
            unknownCount: 3,
        });
        row.prices.chaos!.windows![6]!.sellers = 10;
        expect(selectCohortPrice(row, "chaos", "adaptive-v1")).toMatchObject({
            median: 21,
            hours: 6,
        });
        row.prices.chaos!.sellers = 10;
        expect(selectCohortPrice(row, "chaos", "adaptive-v1")).toMatchObject({
            median: 20,
            hours: 1,
        });
    });
    it("does not bridge missing windows, widen moving prices, or revive absent latest prices", () => {
        const row = fixture();
        row.prices.chaos!.windows![24]!.hourlyMedianMax = 40;
        expect(selectCohortPrice(row, "chaos", "adaptive-v1")?.hours).toBe(6);
        delete row.prices.chaos!.windows![6];
        expect(selectCohortPrice(row, "chaos", "adaptive-v1")?.hours).toBe(1);
        delete row.prices.chaos!.windows;
        expect(selectCohortPrice(row, "chaos", "adaptive-v1")?.hours).toBe(1);
        expect(selectCohortPrice(row, "divine", "adaptive-v1")).toBeNull();
    });
    it("retains old hourly references and explicitly saves adaptive policy", () => {
        const { realm, league, revision, cohortId } = fixture();
        const reference = { realm, league, revision, cohortId };
        for (const value of [reference, { ...reference, window: "adaptive-v1" as const }])
            expect(decodeCohortPriceReference(encodeCohortPriceReference(value))).toEqual(value);
    });
});
