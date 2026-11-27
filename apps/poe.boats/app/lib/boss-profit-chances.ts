import { type DropPool, PROFIT_RUNS } from "~/schemas/boss-rota";
import { seededFraction } from "./seeded-fraction";

type Drop = { pool: DropPool; quantityPerKill: number; quote: { unitChaos: number } | null };
export const PROFIT_TRIALS = 1000;

/** Each exclusive pool rolls once. Each additional drop gets its own roll. */
export function bossProfitChances(entry: number | null, drops: Drop[]) {
    if (entry === null || !drops.some((drop) => drop.quote))
        return PROFIT_RUNS.map((runs) => ({ runs, chance: null }));
    const groups = [
        ...(["Guaranteed", "Unique Pool", "Awakened Gems"] as const).map((pool) =>
            drops.filter((drop) => drop.pool === pool),
        ),
        ...drops.filter((drop) => drop.pool === "Additional Drops").map((drop) => [drop]),
    ];
    let payouts = new Map([[0, 1]]);
    for (const group of groups) {
        const outcomes = new Map<number, number>();
        let remaining = 1;
        for (const drop of group) {
            const probability = Math.min(remaining, drop.quantityPerKill);
            const price = drop.quote?.unitChaos ?? 0;
            outcomes.set(price, (outcomes.get(price) ?? 0) + probability);
            remaining -= probability;
        }
        if (remaining > 0) outcomes.set(0, (outcomes.get(0) ?? 0) + remaining);
        const combined = new Map<number, number>();
        for (const [amount, probability] of outcomes) {
            if (!probability) continue;
            for (const [prior, mass] of payouts)
                combined.set(
                    prior + amount,
                    (combined.get(prior + amount) ?? 0) + mass * probability,
                );
        }
        payouts = combined;
    }
    // Ignore floating point dust on a break-even run.
    const tolerance = Number.EPSILON * 32 * Math.max(1, entry);
    let single = 0;
    let cumulative = 0;
    const distribution = Array.from(payouts, ([amount, probability]) => {
        const net = amount - entry;
        if (net > tolerance) single += probability;
        cumulative += probability;
        return { net, cumulative };
    });
    if (distribution.every(({ net }) => net > tolerance) || single === 0)
        return PROFIT_RUNS.map((runs) => ({ runs, chance: single === 0 ? 0 : 1 }));

    const random = seededFraction(1);
    const wins = PROFIT_RUNS.map(() => 0);
    for (let trial = 0; trial < PROFIT_TRIALS; trial++) {
        let total = 0;
        let run = 0;
        for (const [index, horizon] of PROFIT_RUNS.entries()) {
            while (run < horizon) {
                const roll = random() * cumulative;
                let low = 0;
                let high = distribution.length - 1;
                while (low < high) {
                    const middle = (low + high) >>> 1;
                    if (roll < distribution[middle]!.cumulative) high = middle;
                    else low = middle + 1;
                }
                total += distribution[low]!.net;
                run++;
            }
            if (total > horizon * tolerance) wins[index]!++;
        }
    }
    return PROFIT_RUNS.map((runs, i) => ({
        runs,
        chance: runs === 1 ? Math.min(1, single / cumulative) : wins[i]! / PROFIT_TRIALS,
    }));
}
