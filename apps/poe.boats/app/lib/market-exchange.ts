import { type ExchangeSnapshot, exchangeCurrencyId, quoteExchangeWindow } from "@poe-tools/market";
import type { MarketCategory } from "~/lib/market-categories";

const CHAOS = exchangeCurrencyId("chaos")!;
const DIVINE = exchangeCurrencyId("divine")!;
const EXALTED = exchangeCurrencyId("exalted")!;
const DAY = 86400;

/** Days of exchange trades behind the list's trend, volume, most traded pair and stale prices. */
export const MARKET_EXCHANGE_DAYS = 7;

/** A `stash_currency_daily` row: units of each side traded in the day's hours where both traded. */
export type MarketExchangeDaily = {
    marketId: string;
    day: number;
    firstVolume: number;
    secondVolume: number;
    latestHour: number | null;
};

type Describe = (itemId: string) => { name: string; category: MarketCategory } | undefined;
type Quote = (itemId: string, quoteId: string) => number | undefined;
type ChaosRate = { chaos: number; via: string };

/** The day's markets with trades, one per pair: a pair stored under both orders keeps its first ID. */
function tradedDays(daily: MarketExchangeDaily[]) {
    const days = new Map<number, Map<string, MarketExchangeDaily>>();
    for (const row of daily.toSorted((a, b) => (a.marketId < b.marketId ? -1 : 1))) {
        const ids = row.marketId.split("|");
        if (ids.length !== 2 || !(row.firstVolume > 0) || !(row.secondVolume > 0)) continue;
        const pairs = days.get(row.day) ?? new Map<string, MarketExchangeDaily>();
        const key = ids.toSorted().join("|");
        if (!pairs.has(key)) pairs.set(key, row);
        days.set(row.day, pairs);
    }
    return days;
}

/** Units of `itemId` traded in a daily row, and of the other side. */
function dailyVolumes(row: MarketExchangeDaily, itemId: string) {
    const [first] = row.marketId.split("|");
    return first === itemId
        ? { item: row.firstVolume, other: row.secondVolume }
        : { item: row.secondVolume, other: row.firstVolume };
}

function dailyQuote(pairs: Map<string, MarketExchangeDaily>): Quote {
    return (itemId, quoteId) => {
        const row = pairs.get([itemId, quoteId].sort().join("|"));
        if (!row) return undefined;
        const { item, other } = dailyVolumes(row, itemId);
        return other / item;
    };
}

/**
 * Chaos per unit of every item with a usable path: its own chaos pair, or else a pair with an item
 * that has one (divine first, then exalted, then by ID).
 */
function chaosRates(pairs: string[][], quote: Quote) {
    const rates = new Map<string, ChaosRate>();
    for (const ids of pairs) {
        const item = ids.find((id) => id !== CHAOS);
        if (!item || !ids.includes(CHAOS)) continue;
        const amount = quote(item, CHAOS);
        if (amount) rates.set(item, { chaos: amount, via: CHAOS });
    }
    const direct = new Map(rates);
    const candidates = new Map<string, string[]>();
    for (const [a, b] of pairs) {
        if (!a || !b || a === CHAOS || b === CHAOS) continue;
        if (direct.has(b)) candidates.set(a, [...(candidates.get(a) ?? []), b]);
        if (direct.has(a)) candidates.set(b, [...(candidates.get(b) ?? []), a]);
    }
    const priority = (id: string) => (id === DIVINE ? 0 : id === EXALTED ? 1 : 2);
    for (const [item, bridges] of candidates) {
        if (rates.has(item)) continue;
        for (const bridge of bridges.sort(
            (a, b) => priority(a) - priority(b) || (a < b ? -1 : a > b ? 1 : 0),
        )) {
            const amount = quote(item, bridge);
            const converted = amount && amount * direct.get(bridge)!.chaos;
            if (converted && Number.isFinite(converted)) {
                rates.set(item, { chaos: converted, via: bridge });
                break;
            }
        }
    }
    return rates;
}

/**
 * Chaos rates from one hour's snapshots, where both orders of a pair must agree, and the items
 * of every pair in which both sides traded.
 */
function hourRates(snapshots: ExchangeSnapshot[], hour: number) {
    const pairs = new Map<string, ExchangeSnapshot[]>();
    const traded = new Set<string>();
    for (const snapshot of snapshots) {
        const ids = snapshot.marketId.split("|");
        if (ids.length !== 2) continue;
        const key = ids.toSorted().join("|");
        pairs.set(key, [...(pairs.get(key) ?? []), snapshot]);
        if (ids.every((id) => snapshot.volumeTraded?.[id])) for (const id of ids) traded.add(id);
    }
    const full = (itemId: string, quoteId: string) => {
        const rows = pairs.get([itemId, quoteId].sort().join("|"));
        return rows?.[0]
            ? quoteExchangeWindow(
                  rows,
                  { realm: rows[0].realm, league: rows[0].league, itemId, quoteId },
                  hour,
              )
            : null;
    };
    const quote: Quote = (itemId, quoteId) => full(itemId, quoteId)?.amount;
    return {
        rates: chaosRates(
            [...pairs.keys()].map((key) => key.split("|")),
            quote,
        ),
        quote,
        full,
        traded,
    };
}

/** Each day's chaos rates from that day's volume-weighted pair prices. */
function exchangeDailyChaos(daily: MarketExchangeDaily[]) {
    const result = new Map<number, Map<string, ChaosRate>>();
    for (const [day, pairs] of tradedDays(daily))
        result.set(
            day,
            chaosRates(
                [...pairs.keys()].map((key) => key.split("|")),
                dailyQuote(pairs),
            ),
        );
    return result;
}

export type MarketExchangeRow = {
    itemId: string;
    name: string;
    category: MarketCategory;
    /**
     * Chaos per unit from the latest hour's trades, or else from the newest of the last
     * MARKET_EXCHANGE_DAYS days that traded; null without a usable path.
     */
    chaos: number | null;
    /** The item the price was converted through; chaos for a direct chaos pair. */
    via: { itemId: string; name: string } | null;
    /** The newest hour the price reflects, or without a price the item's newest traded hour. */
    hour: number | null;
    /** The price comes from the latest hour's trades. */
    current: boolean;
    /** Chaos value traded per hour over the last MARKET_EXCHANGE_DAYS days. */
    volume: number | null;
    /** Chaos per unit on each of the last MARKET_EXCHANGE_DAYS days, oldest first. */
    history: (number | null)[];
    /** Change from the first to the last priced day in `history`, as a fraction. */
    change: number | null;
    /** The pair with the most units of this item traded in the period, at its newest rate. */
    pair: { quoteId: string; name: string; rate: number } | null;
};

/**
 * One row per `listed` item and per item traded in the latest hour. `snapshots` are the latest
 * hour's markets and `daily` the last MARKET_EXCHANGE_DAYS days of daily totals. Items without
 * trades get a row without a price. Volumes average over the hours since the window's first day,
 * or since `leagueStart` (the league's first exchange hour) when that is later.
 */
export function marketExchangeRows(
    snapshots: ExchangeSnapshot[],
    daily: MarketExchangeDaily[],
    latestHour: number,
    describe: Describe,
    listed: string[] = [],
    leagueStart = 0,
): MarketExchangeRow[] {
    const current = hourRates(
        snapshots.filter((snapshot) => snapshot.hour === latestHour),
        latestHour,
    );
    const days = tradedDays(daily);
    const dayRates = exchangeDailyChaos(daily);
    const lastDay = Math.floor(latestHour / DAY) * DAY;
    const window = Array.from(
        { length: MARKET_EXCHANGE_DAYS },
        (_, index) => lastDay - (MARKET_EXCHANGE_DAYS - 1 - index) * DAY,
    );
    const hours = (latestHour - Math.max(window[0]!, leagueStart)) / 3600 + 1;
    const items = new Map<
        string,
        { units: number; pairs: Map<string, { quoteId: string; units: number }> }
    >([...listed, ...current.traded].map((id) => [id, { units: 0, pairs: new Map() }]));
    for (const pairs of days.values())
        for (const [key, row] of pairs)
            for (const itemId of key.split("|")) {
                const item = items.get(itemId);
                if (!item) continue;
                const units = dailyVolumes(row, itemId).item;
                const quoteId = key.split("|").find((id) => id !== itemId)!;
                const pair = item.pairs.get(key) ?? { quoteId, units: 0 };
                pair.units += units;
                item.units += units;
                item.pairs.set(key, pair);
            }
    return [...items].flatMap(([itemId, { units, pairs }]) => {
        const item = describe(itemId);
        if (!item) return [];
        const history = window.map((day) =>
            itemId === CHAOS && days.has(day) ? 1 : (dayRates.get(day)?.get(itemId)?.chaos ?? null),
        );
        const fresh =
            itemId === CHAOS
                ? current.traded.has(CHAOS)
                    ? { chaos: 1, via: CHAOS }
                    : undefined
                : current.rates.get(itemId);
        const staleDay = window.findLast((_, index) => history[index] !== null);
        const stale =
            staleDay === undefined
                ? undefined
                : itemId === CHAOS
                  ? { chaos: 1, via: CHAOS }
                  : dayRates.get(staleDay)!.get(itemId)!;
        const price = fresh ?? stale ?? null;
        const priced = history.filter((value) => value !== null);
        const top = [...pairs.values()].sort((a, b) => b.units - a.units)[0];
        const topRate = top && pairRate(itemId, top.quoteId, current.quote, days, window);
        const quoteName = top && describe(top.quoteId)?.name;
        return [
            {
                itemId,
                ...item,
                chaos: price?.chaos ?? null,
                via: price
                    ? { itemId: price.via, name: describe(price.via)?.name ?? price.via }
                    : null,
                hour:
                    fresh || (!stale && current.traded.has(itemId))
                        ? latestHour
                        : latestTraded(days, itemId, stale ? [staleDay!] : window.toReversed()),
                current: Boolean(fresh),
                volume: price && hours > 0 ? (units * price.chaos) / hours : null,
                history,
                change: priced.length > 1 ? priced.at(-1)! / priced[0]! - 1 : null,
                pair:
                    top && topRate && quoteName
                        ? { quoteId: top.quoteId, name: quoteName, rate: topRate }
                        : null,
            },
        ];
    });
}

/** Units of `quoteId` per `itemId`: the latest hour's rate, else the newest traded day's. */
function pairRate(
    itemId: string,
    quoteId: string,
    currentQuote: Quote | undefined,
    days: Map<number, Map<string, MarketExchangeDaily>>,
    window: number[],
) {
    const fresh = currentQuote?.(itemId, quoteId);
    if (fresh) return fresh;
    for (const day of window.toReversed()) {
        const rate = days.get(day) && dailyQuote(days.get(day)!)(itemId, quoteId);
        if (rate) return rate;
    }
    return undefined;
}

/** The item's newest traded hour on the first of `candidates` (days, newest first) it traded. */
function latestTraded(
    days: Map<number, Map<string, MarketExchangeDaily>>,
    itemId: string,
    candidates: number[],
) {
    for (const day of candidates) {
        let latest: number | null = null;
        for (const [key, row] of days.get(day) ?? [])
            if (key.split("|").includes(itemId) && row.latestHour !== null)
                latest = Math.max(latest ?? 0, row.latestHour);
        if (latest !== null) return latest;
    }
    return null;
}

/** One traded hour: the volume-weighted rate, the hour's lowest and highest rates, and units traded. */
export type MarketExchangePoint = {
    hour: number;
    rate: number;
    low: number | null;
    high: number | null;
    units: number;
};

export type MarketExchangePairHistory = {
    quoteId: string;
    name: string;
    /** Units of the other item per unit, per traded hour. */
    hours: MarketExchangePoint[];
};

/**
 * An item's hourly history: its chaos price (directly or through another item, whose chaos rate
 * scales the pair's lowest and highest rates) and units traded per hour, and each pair's hourly
 * rates. `snapshots` hold the item's markets and the chaos markets of the items it trades against.
 */
export function marketExchangeHistory(
    snapshots: ExchangeSnapshot[],
    itemId: string,
    describe: Describe,
) {
    const pairs = new Map<string, MarketExchangePairHistory>();
    const chaos: (Omit<MarketExchangePoint, "rate"> & {
        chaos: number | null;
        via: string | null;
    })[] = [];
    const hours = Map.groupBy(snapshots, (snapshot) => snapshot.hour);
    for (const [hour, rows] of [...hours].sort(([a], [b]) => a - b)) {
        const { rates, full } = hourRates(rows, hour);
        let units = 0;
        for (const key of new Set(
            rows.map((row) => row.marketId.split("|").toSorted().join("|")),
        )) {
            const ids = key.split("|");
            if (ids.length !== 2 || !ids.includes(itemId)) continue;
            const quoteId = ids.find((id) => id !== itemId)!;
            const quote = full(itemId, quoteId);
            if (!quote?.itemVolume) continue;
            units += quote.itemVolume;
            const name = describe(quoteId)?.name;
            if (!name) continue;
            const pair = pairs.get(quoteId) ?? { quoteId, name, hours: [] };
            pair.hours.push({
                hour,
                rate: quote.amount,
                low: quote.low,
                high: quote.high,
                units: quote.itemVolume,
            });
            pairs.set(quoteId, pair);
        }
        if (!units) continue;
        const rate = itemId === CHAOS ? { chaos: 1, via: CHAOS } : rates.get(itemId);
        const leg = rate && itemId !== CHAOS ? full(itemId, rate.via) : null;
        const scale = rate?.via === CHAOS ? 1 : rate ? rates.get(rate.via)?.chaos : undefined;
        chaos.push({
            hour,
            chaos: rate?.chaos ?? null,
            low: leg?.low && scale ? leg.low * scale : null,
            high: leg?.high && scale ? leg.high * scale : null,
            via: rate?.via ?? null,
            units,
        });
    }
    return {
        chaos,
        pairs: [...pairs.values()].sort(
            (a, b) =>
                b.hours.reduce((sum, point) => sum + point.units, 0) -
                    a.hours.reduce((sum, point) => sum + point.units, 0) ||
                a.name.localeCompare(b.name),
        ),
    };
}
