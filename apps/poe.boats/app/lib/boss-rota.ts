import type { BossEncounter, BossId, BossItem } from "~/data/boss-encounters";
import type { BossQuote } from "~/schemas/boss-rota";

export function bossItemLabel([name, , market]: BossItem) {
    return market === "unidentified" ? `Unidentified ${name}` : name;
}

export function calculateBossRota(
    id: BossId,
    boss: BossEncounter,
    runs: number,
    quotes: ReadonlyMap<string, BossQuote>,
) {
    function value(item: BossItem, quantityPerKill: number) {
        const name = bossItemLabel(item);
        const quote = item[2] === "unpriced" ? null : (quotes.get(name) ?? null);
        return {
            name,
            quantityPerKill,
            quote,
            valueChaos: quote && quote.unitChaos * quantityPerKill,
        };
    }
    const entries = boss.entries.map((item) => value(item, item[1]));
    const quantityBonus = boss.quantityBonus ?? 0;
    const drops = (boss.drops ?? []).map((item) => value(item, item[1] / 100));
    for (const item of boss.extraDrops ?? []) {
        drops.push(value(item, Math.min(1, (item[1] / 100) * (1 + quantityBonus / 100))));
    }
    if (boss.gemPool) {
        const { chance, weights } = boss.gemPool;
        const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
        for (const item of weights)
            drops.push(value(item, (chance / 100) * (item[1] / totalWeight)));
    }

    const entry = entries.every((row) => row.valueChaos !== null)
        ? entries.reduce((sum, row) => sum + row.valueChaos!, 0)
        : null;
    const priced = drops.flatMap((row) => row.valueChaos ?? []);
    const pricedLoot = priced.length ? priced.reduce((sum, amount) => sum + amount, 0) : null;
    const loot = priced.length === drops.length ? pricedLoot : null;
    function totals(kills: number) {
        return {
            entryChaos: entry === null ? null : entry * kills,
            lootChaos: loot === null ? null : loot * kills,
            profitChaos: entry === null || loot === null ? null : (loot - entry) * kills,
            pricedLootChaos: pricedLoot === null ? null : pricedLoot * kills,
            profitFromPricedDropsChaos:
                entry === null || pricedLoot === null ? null : (pricedLoot - entry) * kills,
        };
    }
    return {
        id,
        name: boss.name,
        quantityBonus,
        entries,
        drops,
        perKill: totals(1),
        total: totals(runs),
    };
}
