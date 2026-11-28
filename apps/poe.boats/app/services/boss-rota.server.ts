import {
    FORBIDDEN_JEWEL_ICONS,
    FORBIDDEN_JEWEL_LEVEL_KIND,
    isForbiddenJewelLevel,
    marketLeagueTracked,
    TEMPLE_CHRONICLE,
} from "@poe-tools/market";
import {
    BOSS_ENCOUNTERS,
    BOSS_RATES,
    type BossEncounter,
    type BossId,
    type BossItem,
    bossInvitation,
} from "~/data/boss-encounters";
import type { TDatabase } from "~/db/client";
import {
    findBossItemArt,
    findBossLeagues,
    findBossStashQuotes,
} from "~/db/queries/boss-rota.queries";
import { getMarketExchangePrices, getMarketSeasons } from "~/db/queries/market.queries";
import { bossItemLabel, calculateBossRota } from "~/lib/boss-rota";
import { isForbiddenJewel } from "~/lib/forbidden-jewels";
import { marketCategory } from "~/lib/market-categories.server";
import { marketExchangeItemId } from "~/lib/market-exchange.server";
import type { BossItemMarket, BossOrder, BossRotaInput, BossRotaResult } from "~/schemas/boss-rota";
import { marketExchangeLink, marketFiltersSchema, marketLink } from "~/schemas/market";

// These tradable entries share a catalog name with a quest item or a legacy fragment.
const fragmentIds: Readonly<Record<string, string>> = {
    "Fragment of the Phoenix": "CurrencyShaperFragment1",
    "Fragment of the Minotaur": "CurrencyShaperFragment2",
    "Fragment of the Chimera": "CurrencyShaperFragment3",
    "Fragment of the Hydra": "CurrencyShaperFragment4",
    "Echo of Reverence": "AtlasMemory/CurrencyBenevolenceKey",
    "Echo of Loneliness": "AtlasMemory/CurrencyIgnoranceKey",
    "Echo of Trauma": "AtlasMemory/CurrencyFearKey",
};

function priorBossLeagues(
    league: string,
    seasons: { league: string; firstHour: number | null }[],
    calendar: Awaited<ReturnType<typeof findBossLeagues>>,
) {
    const starts = new Map<string, number>();
    for (const { league: name, firstHour } of seasons) {
        if (firstHour !== null && marketLeagueTracked(name)) starts.set(name, firstHour);
    }
    const hardcore = new Set<string>();
    for (const row of calendar) {
        if (!marketLeagueTracked(row.league)) continue;
        starts.set(
            row.league,
            row.startAt ?? Math.min(starts.get(row.league) ?? Infinity, row.firstListedAt),
        );
        if (row.rules.includes("Hardcore")) hardcore.add(row.league);
    }
    // Legacy market captures can predate collection of GGG's league list.
    const isHardcore = (name: string) => hardcore.has(name) || /^(Hardcore|HC)\b/i.test(name);
    const permanent = isHardcore(league) ? "Hardcore" : "Standard";
    const start = starts.get(league);
    if (league === permanent || start === undefined) return [];
    return [...starts]
        .filter(
            ([name, at]) =>
                name !== permanent && at < start && isHardcore(name) === isHardcore(league),
        )
        .sort(([a, first], [b, second]) => second - first || a.localeCompare(b))
        .map(([name]) => name)
        .concat(permanent);
}

export async function loadBossRota(db: TDatabase, input: BossRotaInput): Promise<BossRotaResult> {
    const [{ seasons }, calendar] = await Promise.all([
        getMarketSeasons(db, "pc"),
        findBossLeagues(db),
    ]);
    const leagues = seasons.map(({ league }) => league);
    const league = input.league || leagues[0] || "";
    const runs = input.runs;
    if (!leagues.includes(league))
        return {
            rates: BOSS_RATES,
            leagues,
            league,
            priorLeagues: [],
            runs,
            chaosPerDivine: null,
            encounters: [],
        };

    const bosses = (Object.entries(BOSS_ENCOUNTERS) as [BossId, BossEncounter][]).filter(
        ([id, boss]) =>
            input.boss === "all"
                ? boss.name.toLowerCase().includes(input.q.toLowerCase())
                : id === input.boss,
    );
    const items = new Map<string, BossItem>();
    for (const [, boss] of bosses) {
        for (const item of [
            ...boss.entries,
            ...(boss.guaranteedDrops ?? []),
            ...(boss.drops ?? []),
            ...(boss.extraDrops ?? []),
            ...(boss.gemPool?.weights ?? []),
        ]) {
            items.set(bossItemLabel(item), item);
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
    const divineId = marketExchangeItemId("poe1", "Divine Orb")!;
    const { prices } = await getMarketExchangePrices(db, {
        realm: "pc",
        league,
        itemIds: [...new Set([...ids.values(), divineId])],
        includeVolume: true,
    });
    const quotes = await findBossStashQuotes(
        db,
        league,
        [...items]
            .filter(([name, item]) => {
                const id = ids.get(name);
                return item[2] !== "unpriced" && (!id || !prices.has(id));
            })
            .map(([, item]) => item),
    );
    for (const [name, id] of ids) {
        const quote = prices.get(id);
        if (quote && quote.price > 0)
            quotes.set(name, {
                source: "exchange",
                unitChaos: quote.price,
                hour: quote.hour,
                units24h: quote.units24h,
            });
    }
    const filters = marketFiltersSchema.parse({ league, currency: "chaos" });
    const markets = new Map<string, BossItemMarket>();
    for (const [label, [name, , kind]] of items) {
        const itemId = ids.get(label);
        if (itemId) {
            const category = marketCategory("pc", name);
            markets.set(label, {
                artName: name,
                itemId,
                href: marketExchangeLink({ ...filters, category }, itemId),
                exact: true,
            });
        } else if (isForbiddenJewelLevel(kind) && isForbiddenJewel(name)) {
            const iconAsset = FORBIDDEN_JEWEL_ICONS[name];
            markets.set(label, {
                artName: name,
                iconAsset,
                href: marketLink(
                    { ...filters, category: "forbidden", corruption: "all" },
                    {
                        itemKey: `unid:${iconAsset}`,
                        identified: false,
                        corrupted: true,
                        signatureKind: FORBIDDEN_JEWEL_LEVEL_KIND,
                        signatureValue: kind,
                    },
                ),
                exact: true,
            });
        } else if (kind === "temple-room") {
            markets.set(label, {
                artName: TEMPLE_CHRONICLE,
                href: marketLink(
                    { ...filters, category: "encounters" },
                    {
                        itemKey: TEMPLE_CHRONICLE,
                        signatureKind: kind,
                        signatureValue: name,
                        identified: true,
                        corrupted: false,
                    },
                ),
                exact: true,
            });
        } else if (!quotes.get(label)?.market) {
            let item = name.replace(/^(Unidentified |Veiled )/, "").replace(/ \([^)]+\)$/, "");
            if (item === "Devouring Diadem" || item === "Queen's Hunger") item = `The ${item}`;
            markets.set(label, {
                artName: item,
                href: `/1/market/items/${encodeURIComponent(item)}?${new URLSearchParams({ league })}`,
                exact: false,
            });
        }
    }
    const families = [...markets.values()].filter((market) => !market.exact);
    const art = await findBossItemArt(db, league, [
        ...new Set(families.flatMap(({ artName }) => [artName, artName.replace(/^Foulborn /, "")])),
    ]);
    for (const family of families)
        family.iconAsset =
            art.get(family.artName) ?? art.get(family.artName.replace(/^Foulborn /, ""));
    const encounters = bosses
        .map(([id, boss]) => {
            const invitation = bossInvitation(id);
            return calculateBossRota(
                id,
                boss,
                runs,
                quotes,
                markets,
                invitation && input[invitation.field],
            );
        })
        .filter(({ perKill }) => {
            if (input.boss !== "all" || input.pricing === "all") return true;
            if (perKill.profitChaos !== null) return input.pricing === "complete";
            return (
                input.pricing ===
                (perKill.profitFromPricedDropsChaos === null ? "unknown" : "partial")
            );
        });
    encounters.sort((a, b) => {
        const sign = input.direction === "asc" ? 1 : -1;
        if (input.order === "name") return sign * a.name.localeCompare(b.name);
        const left = sortValue(a, input.order);
        const right = sortValue(b, input.order);
        if (left === null || right === null) return Number(left === null) - Number(right === null);
        return sign * (left - right) || a.name.localeCompare(b.name);
    });
    return {
        rates: BOSS_RATES,
        league,
        leagues,
        priorLeagues: priorBossLeagues(league, seasons, calendar),
        runs,
        chaosPerDivine: prices.get(divineId)?.price || null,
        encounters,
    };
}

function sortValue(boss: BossRotaResult["encounters"][number], order: BossOrder) {
    switch (order) {
        case "cost":
            return boss.total.entryChaos;
        case "loot":
            return boss.total.pricedLootChaos;
        case "profit":
            return boss.perKill.profitFromPricedDropsChaos;
        case "total":
            return boss.total.profitFromPricedDropsChaos;
        case "coverage":
            return boss.drops.filter((row) => row.quote).length / boss.drops.length;
        default:
            return boss.profitChances.find(({ runs }) => order === `chance${runs}`)?.chance ?? null;
    }
}
