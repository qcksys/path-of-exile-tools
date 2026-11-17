import { describe, expect, it } from "vite-plus/test";
import {
    CLUSTER_RECIPE_SIZES,
    clusterRecipeBand,
    clusterRecipeMarketValue,
} from "~/data/cluster-jewel-recipe";
import { calculateClusterRecipe } from "~/lib/cluster-recipe";
import type { ClusterRecipeSnapshot } from "~/schemas/arbitrage";

const outcomes = (baseType: string) =>
    CLUSTER_RECIPE_SIZES.find((size) => size.baseType === baseType)!.outcomes;

/** Four priced Small outcomes; the other 24 Small and every Medium and Large outcome are unpriced. */
const snapshot: ClusterRecipeSnapshot = {
    league: "Standard",
    band: { min: 84, max: 100 },
    fetchedAt: "2026-11-17T00:00:00.000Z",
    quotes: {
        "affliction_reservation_efficiency_small:3": { value: 280, listingCount: 7 },
        "affliction_maximum_energy_shield:3": { value: 20, listingCount: 3 },
        "affliction_armour:2": { value: 10, listingCount: 9 },
        "affliction_maximum_life:2": { value: 2, listingCount: 30 },
        // Removed enchantments are not outcomes, whatever they sell for.
        "affliction_strength:2": { value: 999, listingCount: 1 },
    },
};

describe("cluster jewel recipe catalog", () => {
    it("lists each rollable enchantment at each passive count, without removed ones", () => {
        expect(CLUSTER_RECIPE_SIZES.map((size) => [size.baseType, size.outcomes.length])).toEqual([
            ["Small Cluster Jewel", 14 * 2],
            ["Medium Cluster Jewel", 19 * 3],
            ["Large Cluster Jewel", 17 * 5],
        ]);
        const ids = CLUSTER_RECIPE_SIZES.flatMap((size) => size.outcomes.map(({ id }) => id));
        expect(new Set(ids).size).toBe(ids.length);
        const labels = (baseType: string) => outcomes(baseType).map(({ label }) => label);
        expect(labels("Medium Cluster Jewel")).not.toContain(
            "3% increased effect of Non-Curse Auras from your Skills",
        );
        expect(labels("Medium Cluster Jewel")).not.toContain("2% increased Effect of your Curses");
        expect(labels("Small Cluster Jewel")).toContain("2% increased Effect of your Curses");
        expect(labels("Small Cluster Jewel")).not.toContain("+10 to Strength");
        expect(outcomes("Large Cluster Jewel").map(({ passives }) => passives)).toContain(12);
    });

    it("prices an outcome from the market band holding the lowest input item level", () => {
        expect(clusterRecipeBand(84)).toEqual({ min: 84, max: 100 });
        expect(clusterRecipeBand(83)).toEqual({ min: 75, max: 83 });
        const minion = outcomes("Large Cluster Jewel").find(
            (outcome) => outcome.id === "affliction_minion_damage:12",
        )!;
        expect(clusterRecipeMarketValue(minion, clusterRecipeBand(100))).toBe(
            "Minions deal 10% increased Damage · 12 passives · ilvl 84+",
        );
    });
});

describe("cluster jewel recipe expected value", () => {
    it("averages every outcome equally, counting unpriced outcomes as worth nothing", () => {
        const [small, medium, large] = calculateClusterRecipe(snapshot, { buffer: 0 }).sizes;
        expect(small).toMatchObject({
            baseType: "Small Cluster Jewel",
            outcomeCount: 28,
            pricedCount: 4,
            medianValue: 0,
            cheapestInput: 2,
            cost: 10,
            chanceAboveCost: 3 / 28,
        });
        expect(small!.expectedValue).toBeCloseTo(312 / 28);
        expect(small!.expectedValueWithoutTop).toBeCloseTo(32 / 28);
        expect(small!.breakEvenInput).toBeCloseTo(312 / 28 / 5);
        expect(small!.profit).toBeCloseTo(312 / 28 - 10);
        expect(small!.roi).toBeCloseTo(((312 / 28 - 10) / 10) * 100);
        expect(small!.outcomes[0]).toMatchObject({
            id: "affliction_reservation_efficiency_small:3",
            value: 280,
            listingCount: 7,
        });
        expect(small!.outcomes[0]!.share).toBeCloseTo(280 / 312);
        expect(small!.outcomes.at(-1)).toMatchObject({ value: null, listingCount: 0, share: 0 });

        for (const size of [medium, large])
            expect(size).toMatchObject({
                pricedCount: 0,
                expectedValue: 0,
                cheapestInput: null,
                cost: null,
                profit: null,
                roi: null,
                chanceAboveCost: null,
                recycled: { below: 0, breakEvenInput: 0 },
            });
    });

    it("finds the ask below which outputs are worth more as recipe inputs", () => {
        const [small] = calculateClusterRecipe(snapshot, { buffer: 0 }).sizes;
        // Keeping asks of 10+ re-feeds 25 of 28 outputs: 310 chaos per craft over 5 − 25/28 inputs.
        expect(small!.recycled.below).toBe(10);
        expect(small!.recycled.breakEvenInput).toBeCloseTo(310 / 115);
        expect(small!.recycled.breakEvenInput).toBeGreaterThan(small!.breakEvenInput);
    });

    it("takes the buffer off sale values and adds it to input costs", () => {
        const [small] = calculateClusterRecipe(snapshot, { buffer: 10 }).sizes;
        expect(small!.expectedValue).toBeCloseTo((312 / 28) * 0.9);
        expect(small!.cost).toBeCloseTo(11);
        expect(small!.breakEvenInput).toBeCloseTo(((312 / 28) * 0.9) / 5.5);
        expect(small!.chanceAboveCost).toBe(2 / 28);
        expect(small!.recycled.breakEvenInput).toBeCloseTo((310 * 0.9) / (115 * 1.1));
    });

    it("refuses a buffer outside 0–99", () => {
        expect(() => calculateClusterRecipe(snapshot, { buffer: 100 })).toThrow();
    });
});
