import { describe, expect, it } from "vite-plus/test";
import { BOSS_ENCOUNTERS } from "~/data/boss-encounters";
import { bossProfitChances } from "~/lib/boss-profit-chances";
import { calculateBossRota } from "~/lib/boss-rota";
import type { BossQuote } from "~/schemas/boss-rota";

const shaper = BOSS_ENCOUNTERS.shaper;
const quotes = new Map<string, BossQuote>();
for (const [name] of shaper.entries)
    quotes.set(name, { source: "exchange", hour: 3600, unitChaos: 3 });
for (const [name] of [...shaper.guaranteedDrops, ...shaper.drops, ...shaper.extraDrops]) {
    quotes.set(name, {
        source: "stash",
        hour: 3600,
        unitChaos: name.startsWith("Fragment of") ? 20 : 4,
    });
}

describe("solo boss rota", () => {
    it("charges four fragments per Shaper instance and counts each modeled drop once", () => {
        const result = calculateBossRota("shaper", shaper, 10, quotes);
        expect(result.perKill).toMatchObject({ entryChaos: 12, lootChaos: 25, profitChaos: 13 });
        expect(result.total).toMatchObject({ entryChaos: 120, lootChaos: 250, profitChaos: 130 });
        expect(result.profitChances.map(({ runs, chance }) => [runs, chance])).toEqual([
            [1, 1],
            [5, 1],
            [10, 1],
            [50, 1],
            [100, 1],
        ]);
        expect(result.drops.find((row) => row.name === "Fragment of Shape")?.pool).toBe(
            "Guaranteed",
        );
        expect(result.drops.find((drop) => drop.name === "Dying Sun")).toMatchObject({
            quantityPerKill: 0.02,
            valueChaos: 0.08,
        });
    });

    it("rolls one outcome per pool and independent additional drops, with strict break-even", () => {
        const half = { quantityPerKill: 0.5, quote: { unitChaos: 10 } };
        const exclusive = [
            { ...half, pool: "Unique Pool" },
            { ...half, pool: "Unique Pool" },
        ] as const;
        expect(bossProfitChances(10, [...exclusive]).map((x) => x.chance)).toEqual([0, 0, 0, 0, 0]);
        const drops = [
            { ...half, pool: "Additional Drops" },
            { ...half, pool: "Awakened Gems" },
        ] as const;
        const odds = bossProfitChances(10, [...drops]);
        expect(odds[0]?.chance).toBe(0.25);
        // Five runs profit on at least six successes out of ten independent 50% rolls.
        expect(Math.abs(odds[1]!.chance! - 386 / 1024)).toBeLessThan(0.05);
        expect(bossProfitChances(10, [...drops])).toEqual(odds);
        expect(bossProfitChances(null, [...drops]).every((x) => x.chance === null)).toBe(true);
        expect(
            bossProfitChances(10, [{ ...half, pool: "Guaranteed", quote: null }]).every(
                (x) => x.chance === null,
            ),
        ).toBe(true);
    });

    it("keeps missing revenue separate from missing entry costs and preserves losses", () => {
        const partial = new Map(quotes);
        partial.delete("Dying Sun");
        partial.set("Fragment of the Hydra", { source: "exchange", hour: 3600, unitChaos: 100 });
        const result = calculateBossRota("shaper", shaper, 10, partial);
        expect(result.total.profitChaos).toBeNull();
        expect(result.total.lootChaos).toBeNull();
        expect(result.total.profitFromPricedDropsChaos).toBeCloseTo(-840.8);
        partial.delete("Fragment of the Phoenix");
        expect(calculateBossRota("shaper", shaper, 10, partial).total).toMatchObject({
            entryChaos: null,
            profitFromPricedDropsChaos: null,
        });
        expect(calculateBossRota("shaper", shaper, 1, new Map()).total.pricedLootChaos).toBeNull();
    });

    it("uses four Uber fragments and distributes Maven's gem pool chance by weight", () => {
        const result = calculateBossRota(
            "uber-maven",
            BOSS_ENCOUNTERS["uber-maven"],
            5,
            new Map([["Reality Fragment", { source: "exchange", hour: 3600, unitChaos: 7 }]]),
        );
        expect(result.total.entryChaos).toBe(140);
        const gems = result.drops.filter((row) => row.name.startsWith("Awakened"));
        expect(gems).toHaveLength(3);
        expect(gems.reduce((sum, row) => sum + row.quantityPerKill, 0)).toBeCloseTo(0.02);
    });

    it("applies the source's invitation quantity only to the extra drops", () => {
        const result = calculateBossRota(
            "searing-exarch",
            BOSS_ENCOUNTERS["searing-exarch"],
            1,
            new Map(),
        );
        expect(result.quantityBonus).toBe(70);
        expect(result.drops.find((drop) => drop.name === "Dawnbreaker")?.quantityPerKill).toBe(
            0.63,
        );
        expect(
            result.drops.find((drop) => drop.name === "Exceptional Eldritch Ember")
                ?.quantityPerKill,
        ).toBeCloseTo(0.255);
    });
});
