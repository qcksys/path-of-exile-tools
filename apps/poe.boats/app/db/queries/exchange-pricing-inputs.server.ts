import type { ExchangeSnapshot } from "@poe-tools/market";
import type { MarketExchangeDaily } from "~/lib/market-exchange";
import {
    type ExchangePricingCache,
    readExchangeValue,
    writeExchangeValue,
} from "./exchange-pricing-cache.server";

type Inputs = { snapshots: ExchangeSnapshot[]; days: MarketExchangeDaily[] };
type Side = number | null;
type MarketInputs = {
    hours: [number, Side, Side, Side, Side, Side, Side][];
    days: [number, number, number, number, number | null][];
};
type Book = Record<string, MarketInputs>;

// Store both sides in market-ID order. quoteExchangeWindow compares the volumes AND ranges of
// inverse copies before accepting their rate, even when the caller only displays the price.
function pack(inputs: Inputs, markets: Set<string>): Book {
    const book: Book = Object.fromEntries([...markets].map((id) => [id, { hours: [], days: [] }]));
    for (const row of inputs.snapshots) {
        const market = book[row.marketId];
        if (!market) continue;
        const [a, b] = row.marketId.split("|") as [string, string];
        market.hours.push([
            row.hour,
            row.volumeTraded?.[a] ?? null,
            row.volumeTraded?.[b] ?? null,
            row.lowestRatio?.[a] ?? null,
            row.lowestRatio?.[b] ?? null,
            row.highestRatio?.[a] ?? null,
            row.highestRatio?.[b] ?? null,
        ]);
    }
    for (const row of inputs.days)
        book[row.marketId]?.days.push([
            row.day,
            row.firstVolume,
            row.secondVolume,
            row.tradedHours,
            row.latestHour,
        ]);
    return book;
}

function unpack(
    inputs: Inputs,
    marketId: string,
    market: MarketInputs,
    scope: Pick<ExchangeSnapshot, "realm" | "league">,
) {
    const [a, b] = marketId.split("|") as [string, string];
    const sides = (first: Side, second: Side) =>
        first === null && second === null
            ? null
            : {
                  ...(first !== null ? { [a]: first } : {}),
                  ...(second !== null ? { [b]: second } : {}),
              };
    for (const [hour, av, bv, al, bl, ah, bh] of market.hours)
        inputs.snapshots.push({
            ...scope,
            marketId,
            hour,
            volumeTraded: sides(av, bv),
            lowestRatio: sides(al, bl),
            highestRatio: sides(ah, bh),
        });
    for (const [day, firstVolume, secondVolume, tradedHours, latestHour] of market.days)
        inputs.days.push({ marketId, day, firstVolume, secondVolume, tradedHours, latestHour });
}

// A broad item fills complete 64-market groups. A cold thin item still reads only its own pairs.
const GROUP_SIZE = 64;
export async function exchangePricingBook(
    cache: ExchangePricingCache | undefined,
    scope: Pick<ExchangeSnapshot, "realm" | "league">,
    listed: string[],
    requested: string[],
    load: (ids: string[]) => Promise<Inputs>,
) {
    if (!cache || !requested.length)
        return { ...(await load(requested)), cachedMarkets: 0, readMarkets: requested.length };
    const needed = new Set(requested);
    const groups = Map.groupBy(listed.toSorted(), (_, index) => Math.floor(index / GROUP_SIZE));
    const inputs: Inputs = { snapshots: [], days: [] };
    const missing = new Set<string>();
    const fills = new Map<string, string[]>();
    const keys = new Set<string>();
    let cachedMarkets = 0;
    await Promise.all(
        [...groups].map(async ([index, group]) => {
            const required = group.filter((id) => needed.has(id));
            if (!required.length) return;
            const key = `pairs/${index}`;
            const book = await readExchangeValue<Book>(cache, key);
            const absent = required.filter((id) => !book?.[id]);
            for (const id of required) {
                if (!book?.[id]) continue;
                unpack(inputs, id, book[id], scope);
                cachedMarkets++;
            }
            if (!absent.length) return;
            if (absent.length * 2 >= group.length) {
                fills.set(key, group);
                for (const id of group) {
                    missing.add(id);
                    keys.add(id);
                }
            } else for (const id of absent) missing.add(id);
        }),
    );
    if (missing.size) {
        const loaded = await load([...missing]);
        // Return only the scope of the original item calculation, even when a group fill read more.
        inputs.snapshots = inputs.snapshots.filter((row) => !missing.has(row.marketId));
        inputs.days = inputs.days.filter((row) => !missing.has(row.marketId));
        for (const row of loaded.snapshots)
            if (needed.has(row.marketId)) inputs.snapshots.push(row);
        for (const row of loaded.days) if (needed.has(row.marketId)) inputs.days.push(row);
        if (fills.size) {
            const book = pack(loaded, keys);
            await Promise.all(
                [...fills].map(([key, group]) =>
                    writeExchangeValue(
                        cache,
                        key,
                        Object.fromEntries(group.map((id) => [id, book[id]])),
                    ),
                ),
            );
        }
    }
    return { ...inputs, cachedMarkets, readMarkets: missing.size };
}
