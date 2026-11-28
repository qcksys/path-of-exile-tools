import { type BossEncounter, type BossId, type BossItem, bossIcon } from "~/data/boss-encounters";
import {
    type BossItemMarket,
    DROP_POOLS,
    type DropPool,
    type LocatedBossQuote,
} from "~/schemas/boss-rota";
import { bossProfitChances } from "./boss-profit-chances";

export function bossItemLabel([name, , market]: BossItem) {
    return market === "unidentified" ? `Unidentified ${name}` : name;
}

export function calculateBossRota(
    id: BossId,
    boss: BossEncounter,
    runs: number,
    quotes: ReadonlyMap<string, LocatedBossQuote>,
    markets?: ReadonlyMap<string, BossItemMarket>,
) {
    function value(item: BossItem, quantityPerKill: number) {
        const name = bossItemLabel(item);
        const located = item[2] === "unpriced" ? null : quotes.get(name);
        const quote = located
            ? {
                  source: located.source,
                  foulbornState: located.foulbornState,
                  unitChaos: located.unitChaos,
                  hour: located.hour,
                  units24h: located.units24h,
                  listings: located.listings,
                  likelySales24h: located.likelySales24h,
              }
            : null;
        return {
            name,
            quantityPerKill,
            quote,
            market: located?.market ?? markets?.get(name) ?? null,
            valueChaos: quote && quote.unitChaos * quantityPerKill,
        };
    }
    const entries = boss.entries.map((item) => value(item, item[1]));
    const quantityBonus = boss.quantityBonus ?? 0;
    const drop = (item: BossItem, chance: number, pool: DropPool) => ({
        ...value(item, chance),
        pool,
    });
    const drops = [
        ...(boss.guaranteedDrops ?? []).map((item) => drop(item, item[1] / 100, "Guaranteed")),
        ...(boss.drops ?? []).map((item) => drop(item, item[1] / 100, "Unique Pool")),
    ];
    for (const item of boss.extraDrops ?? []) {
        drops.push(
            drop(
                item,
                Math.min(1, (item[1] / 100) * (1 + quantityBonus / 100)),
                "Additional Drops",
            ),
        );
    }
    if (boss.gemPool) {
        const { chance, weights } = boss.gemPool;
        const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
        for (const item of weights)
            drops.push(drop(item, (chance / 100) * (item[1] / totalWeight), "Awakened Gems"));
    }

    const entry = entries.every((row) => row.valueChaos !== null)
        ? entries.reduce((sum, row) => sum + row.valueChaos!, 0)
        : null;
    const priced = drops.flatMap((row) => row.valueChaos ?? []);
    const pricedLoot = priced.length ? priced.reduce((sum, amount) => sum + amount, 0) : null;
    const loot = priced.length === drops.length ? pricedLoot : null;
    const poolValues = DROP_POOLS.flatMap((pool) => {
        const group = drops.filter((row) => row.pool === pool);
        if (!group.length) return [];
        const amounts = group.flatMap((row) => row.valueChaos ?? []);
        const subtotal = amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) : null;
        return [
            {
                pool,
                pricedChaosPerKill: subtotal,
                shareOfPricedLoot: subtotal !== null && pricedLoot ? subtotal / pricedLoot : null,
                fullyPriced: group.length === amounts.length,
            },
        ];
    });
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
        icon: bossIcon(id),
        quantityBonus,
        entries,
        drops,
        profitChances: bossProfitChances(entry, drops).map((horizon) => {
            const average = totals(horizon.runs);
            return {
                ...horizon,
                averageNetChaos: average.profitChaos,
                pricedAverageNetChaos: average.profitFromPricedDropsChaos,
            };
        }),
        poolValues,
        askOnlyChaosPerKill: drops.reduce(
            (sum, row) => sum + (row.quote?.likelySales24h === 0 ? (row.valueChaos ?? 0) : 0),
            0,
        ),
        perKill: totals(1),
        total: totals(runs),
    };
}
