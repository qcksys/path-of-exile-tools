import {
    BOSS_ENCOUNTERS,
    BOSS_RATES,
    type BossEncounter,
    type BossId,
    type BossItem,
} from "~/data/boss-encounters";
import type { TDatabase } from "~/db/client";
import { findBossStashQuotes } from "~/db/queries/boss-rota.queries";
import { getMarketExchangePrices, getMarketSeasons } from "~/db/queries/market.queries";
import { bossItemLabel, calculateBossRota } from "~/lib/boss-rota";
import { marketExchangeItemId } from "~/lib/market-exchange.server";
import type { BossRotaInput, BossRotaResult } from "~/schemas/boss-rota";

// These tradable entries share a catalog name with a quest item or a legacy fragment.
const fragmentIds: Readonly<Record<string, string>> = {
    "Fragment of the Phoenix": "CurrencyShaperFragment1",
    "Fragment of the Minotaur": "CurrencyShaperFragment2",
    "Fragment of the Chimera": "CurrencyShaperFragment3",
    "Fragment of the Hydra": "CurrencyShaperFragment4",
    "Echo of Reverence": "AtlasMemory/CurrencyBenevolenceKey",
    "Echo of Loneliness": "AtlasMemory/CurrencyIgnoranceKey",
    "Echo of Trauma": "AtlasMemory/CurrencyFearKey",
    "Polaric Invitation": "Primordial/CurrencyCleansingFireKey",
    "Incandescent Invitation": "Primordial/CurrencyCleansingFireBossKey",
    "Writhing Invitation": "Primordial/CurrencyTangleKey",
    "Screaming Invitation": "Primordial/CurrencyTangleBossKey",
};

export async function loadBossRota(db: TDatabase, input: BossRotaInput): Promise<BossRotaResult> {
    const { seasons } = await getMarketSeasons(db, "pc");
    const leagues = seasons.map(({ league }) => league);
    const league = input.league || leagues[0] || "";
    const runs = input.runs;
    if (!leagues.includes(league))
        return { rates: BOSS_RATES, leagues, league, runs, encounters: [] };

    const bosses = (Object.entries(BOSS_ENCOUNTERS) as [BossId, BossEncounter][]).filter(
        ([id]) => input.boss === "all" || id === input.boss,
    );
    const items = new Map<string, BossItem>();
    for (const [, boss] of bosses) {
        for (const item of [
            ...boss.entries,
            ...(boss.drops ?? []),
            ...(boss.extraDrops ?? []),
            ...(boss.gemPool?.weights ?? []),
        ]) {
            if (item[2] !== "unpriced") items.set(bossItemLabel(item), item);
        }
    }
    const ids = new Map<string, string>();
    for (const [name, item] of items) {
        if (item[2]) continue;
        const fragment = fragmentIds[name];
        const id = fragment
            ? `Metadata/Items/MapFragments/${fragment}`
            : marketExchangeItemId("poe1", name);
        if (id) ids.set(name, id);
    }
    const { prices } = await getMarketExchangePrices(db, {
        realm: "pc",
        league,
        itemIds: [...ids.values()],
    });
    const quotes = await findBossStashQuotes(
        db,
        league,
        [...items]
            .filter(([name]) => {
                const id = ids.get(name);
                return !id || !prices.has(id);
            })
            .map(([, item]) => item),
    );
    for (const [name, id] of ids) {
        const quote = prices.get(id);
        if (quote && quote.price > 0)
            quotes.set(name, { source: "exchange", unitChaos: quote.price, hour: quote.hour });
    }
    const encounters = bosses.map(([id, boss]) => calculateBossRota(id, boss, runs, quotes));
    encounters.sort((a, b) => {
        const left = a.perKill.profitFromPricedDropsChaos;
        const right = b.perKill.profitFromPricedDropsChaos;
        if (left === null || right === null) return Number(left === null) - Number(right === null);
        return right - left;
    });
    return { rates: BOSS_RATES, league, leagues, runs, encounters };
}
