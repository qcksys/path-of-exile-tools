import { type ExchangeSnapshot, exchangeCurrencyId } from "@poe-tools/market";
import type { MarketCategory } from "~/lib/market-categories";
import { chaosRatesByHour } from "~/lib/market-price-merge";

const CHAOS = exchangeCurrencyId("chaos")!;

export type MarketExchangeRow = {
    itemId: string;
    name: string;
    category: MarketCategory;
    /** Chaos per unit at the best rate via chaos, divine or exalted; null without a usable pair. */
    chaos: number | null;
    /** Units traded across the item's markets in each market's latest traded hour. */
    volume: number;
    /** The newest hour any of the item's markets traded; null when none traded. */
    hour: number | null;
};

/**
 * One row per exchange item. `snapshots` holds each market's newest traded hour, which stands
 * in for `latestHour` so items that did not trade in the latest hour keep their last rate.
 * `listed` items with no traded snapshot get a row without a price.
 */
export function marketExchangeRows(
    snapshots: ExchangeSnapshot[],
    latestHour: number,
    describe: (itemId: string) => { name: string; category: MarketCategory } | undefined,
    listed: string[] = [],
): MarketExchangeRow[] {
    // A pair can be stored under both orders; keep its newest observation only.
    const pairs = new Map<string, ExchangeSnapshot>();
    for (const snapshot of snapshots) {
        const key = snapshot.marketId.split("|").sort().join("|");
        const kept = pairs.get(key);
        if (!kept || snapshot.hour > kept.hour) pairs.set(key, snapshot);
    }
    const items = new Map<string, { volume: number; hour: number | null }>(
        listed.map((id) => [id, { volume: 0, hour: null }]),
    );
    for (const snapshot of pairs.values())
        for (const id of snapshot.marketId.split("|")) {
            const item = items.get(id) ?? { volume: 0, hour: null };
            item.volume += snapshot.volumeTraded?.[id] ?? 0;
            item.hour = Math.max(item.hour ?? 0, snapshot.hour);
            items.set(id, item);
        }
    const rates =
        chaosRatesByHour(
            [...pairs.values()].map((snapshot) => ({ ...snapshot, hour: latestHour })),
            [...items.keys()],
        ).get(latestHour) ?? new Map<string, number>();
    return [...items].flatMap(([itemId, { volume, hour }]) => {
        const item = describe(itemId);
        if (!item) return [];
        const chaos = itemId === CHAOS ? 1 : (rates.get(itemId) ?? null);
        return [{ itemId, ...item, chaos, volume, hour }];
    });
}
