import { type ExchangeSnapshot, exchangeCurrencyId, quoteExchangeWindow } from "@poe-tools/market";
import type { MarketCategory } from "~/lib/market-categories";

const CHAOS = exchangeCurrencyId("chaos")!;
const DIVINE = exchangeCurrencyId("divine")!;
const EXALTED = exchangeCurrencyId("exalted")!;

function twoLegRates(snapshots: ExchangeSnapshot[], hour: number, rates: Map<string, number>) {
    const first = snapshots[0];
    if (!first) return;
    const pairs = new Map<string, ExchangeSnapshot[]>();
    for (const snapshot of snapshots) {
        const ids = snapshot.marketId.split("|");
        if (ids.length !== 2) continue;
        const key = ids.sort().join("|");
        pairs.set(key, [...(pairs.get(key) ?? []), snapshot]);
    }
    const quote = (itemId: string, quoteId: string) => {
        const rows = pairs.get([itemId, quoteId].sort().join("|"));
        return rows
            ? quoteExchangeWindow(
                  rows,
                  { realm: first.realm, league: first.league, itemId, quoteId },
                  hour,
              )?.amount
            : undefined;
    };
    const direct = new Map<string, number>();
    for (const key of pairs.keys()) {
        const ids = key.split("|");
        if (!ids.includes(CHAOS)) continue;
        const bridge = ids.find((id) => id !== CHAOS);
        if (!bridge) continue;
        const amount = quote(bridge, CHAOS);
        if (amount) direct.set(bridge, amount);
    }
    for (const [item, amount] of direct) rates.set(item, amount);
    const candidates = new Map<string, string[]>();
    for (const key of pairs.keys()) {
        const [a, b] = key.split("|");
        if (!a || !b || a === CHAOS || b === CHAOS) continue;
        if (direct.has(b)) candidates.set(a, [...(candidates.get(a) ?? []), b]);
        if (direct.has(a)) candidates.set(b, [...(candidates.get(b) ?? []), a]);
    }
    for (const [item, bridges] of candidates) {
        if (rates.has(item)) continue;
        const priority = (id: string) => (id === DIVINE ? 0 : id === EXALTED ? 1 : 2);
        for (const bridge of bridges.sort(
            (a, b) => priority(a) - priority(b) || (a < b ? -1 : a > b ? 1 : 0),
        )) {
            const amount = quote(item, bridge);
            const converted = amount && amount * direct.get(bridge)!;
            if (converted && Number.isFinite(converted)) {
                rates.set(item, converted);
                break;
            }
        }
    }
}

export type MarketExchangeRow = {
    itemId: string;
    name: string;
    category: MarketCategory;
    /** Chaos per unit from selected-hour exchange trades; null without a usable path. */
    chaos: number | null;
    /** Units traded across the item's markets in the selected hour. */
    volume: number;
    /** The selected hour when any of the item's markets traded; null otherwise. */
    hour: number | null;
};

/**
 * One row per exchange item. Only trades from `latestHour` contribute to prices and volume.
 * `listed` items with no traded snapshot get a row without a price.
 */
export function marketExchangeRows(
    snapshots: ExchangeSnapshot[],
    latestHour: number,
    describe: (itemId: string) => { name: string; category: MarketCategory } | undefined,
    listed: string[] = [],
): MarketExchangeRow[] {
    const current = snapshots.filter((snapshot) => snapshot.hour === latestHour);
    // A pair can be stored under both orders; count its volume only once.
    const pairs = new Map<string, ExchangeSnapshot>();
    for (const snapshot of current) {
        const key = snapshot.marketId.split("|").sort().join("|");
        if (!pairs.has(key)) pairs.set(key, snapshot);
    }
    const items = new Map<string, { volume: number; hour: number | null }>(
        listed.map((id) => [id, { volume: 0, hour: null }]),
    );
    for (const snapshot of pairs.values()) {
        const ids = snapshot.marketId.split("|");
        if (ids.length !== 2 || ids.some((id) => !(snapshot.volumeTraded?.[id] ?? 0))) continue;
        for (const id of snapshot.marketId.split("|")) {
            const item = items.get(id) ?? { volume: 0, hour: null };
            item.volume += snapshot.volumeTraded?.[id] ?? 0;
            item.hour = Math.max(item.hour ?? 0, snapshot.hour);
            items.set(id, item);
        }
    }
    const rates = new Map<string, number>();
    twoLegRates(current, latestHour, rates);
    return [...items].flatMap(([itemId, { volume, hour }]) => {
        const item = describe(itemId);
        if (!item) return [];
        const chaos = itemId === CHAOS ? 1 : (rates.get(itemId) ?? null);
        return [{ itemId, ...item, chaos, volume, hour }];
    });
}
