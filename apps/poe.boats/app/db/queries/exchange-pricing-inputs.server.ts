import { waitUntil } from "cloudflare:workers";
import type { ExchangeSnapshot } from "@poe-tools/market";
import type { MarketExchangeDaily } from "~/lib/market-exchange";
import {
    type ExchangePricingCache,
    readExchangeValue,
    writeExchangeValue,
} from "./exchange-pricing-cache.server";
import { type ExchangeHour, expandExchangeHours } from "./exchange-snapshots.queries";

export type ExchangeDay = [number, number, number, number, number | null];
export type PriceBook = Record<string, { hours: ExchangeHour[]; days: ExchangeDay[] }>;

export function expandPricingInputs(
    book: PriceBook,
    scope: Pick<ExchangeSnapshot, "realm" | "league">,
) {
    const snapshots: ExchangeSnapshot[] = [],
        days: MarketExchangeDaily[] = [];
    for (const [marketId, market] of Object.entries(book)) {
        for (const hour of expandExchangeHours(scope, marketId, market.hours)) snapshots.push(hour);
        for (const [day, firstVolume, secondVolume, tradedHours, latestHour] of market.days)
            days.push({ marketId, day, firstVolume, secondVolume, tradedHours, latestHour });
    }
    return { snapshots, days };
}

// A broad item fills complete 64-market groups. A cold thin item still reads only its own pairs.
const GROUP_SIZE = 64;
export async function exchangePricingBook(
    cache: ExchangePricingCache | undefined,
    listed: string[],
    requested: string[],
    anchors: string[],
    lookup: boolean,
    load: (ids: string[]) => Promise<PriceBook>,
) {
    const result: PriceBook = {};
    if (!cache || !requested.length)
        return {
            book: await load(requested),
            cachedMarkets: 0,
            readMarkets: requested.length,
            anchorCache: "bypass",
        };
    const needed = new Set(requested);
    const shared = new Set(anchors);
    const groups = Map.groupBy(
        listed.filter((id) => !shared.has(id)).toSorted(),
        (_, index) => `pairs/${Math.floor(index / GROUP_SIZE)}`,
    );
    if (anchors.length) groups.set("display-currency-pairs", anchors);
    const missing = new Set<string>();
    const fills = new Map<string, string[]>();
    let anchorCache = "bypass";
    await Promise.all(
        [...groups].map(async ([key, group]) => {
            const required = group.filter((id) => needed.has(id));
            if (!required.length) return;
            const cached = lookup ? await readExchangeValue<PriceBook>(cache, key) : undefined;
            const absent = required.filter((id) => !cached?.[id]);
            if (key === "display-currency-pairs") anchorCache = absent.length ? "miss" : "hit";
            for (const id of required) if (cached?.[id]) result[id] = cached[id];
            if (absent.length && absent.length * 2 >= group.length) {
                fills.set(key, group);
                for (const id of group) missing.add(id);
            } else for (const id of absent) missing.add(id);
        }),
    );
    const cachedMarkets = Object.keys(result).length;
    if (missing.size) {
        const loaded = await load([...missing]);
        for (const id of missing) if (needed.has(id)) result[id] = loaded[id]!;
        // Warm other items without delaying the initiating page. All database work is complete.
        if (fills.size)
            waitUntil(
                Promise.all(
                    [...fills].map(([key, ids]) =>
                        writeExchangeValue(
                            cache,
                            key,
                            Object.fromEntries(ids.map((id) => [id, loaded[id]])),
                        ),
                    ),
                ),
            );
    }
    return { book: result, cachedMarkets, readMarkets: missing.size, anchorCache };
}
