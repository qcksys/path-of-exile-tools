import {
    type ExchangeSnapshot,
    exchangeCurrencyId,
    listingCurrencyId,
    quoteExchangeWindow,
} from "@poe-tools/market";
import type { MarketPriceSummary } from "~/db/schema/stash.unique-hourly";
import type { MergedMarketPrice } from "~/schemas/market";

const CHAOS = exchangeCurrencyId("chaos")!;
const DIVINE = exchangeCurrencyId("divine")!;
const EXALTED = exchangeCurrencyId("exalted")!;
export const MARKET_RATE_MAX_AGE = 86400;

type Game = "poe1" | "poe2";

function pairIds(item: string, quote: string) {
    return [`${item}|${quote}`, `${quote}|${item}`];
}

export function marketGame(realm: string): Game {
    return realm === "poe2" ? "poe2" : "poe1";
}

/** Exchange market IDs needed to price each listing currency in chaos, directly or via divine or exalted. */
export function marketRatePairs(currencies: string[], game: Game) {
    const ids = new Set([
        ...pairIds(DIVINE, CHAOS),
        ...pairIds(EXALTED, CHAOS),
        ...pairIds(EXALTED, DIVINE),
    ]);
    for (const currency of currencies) {
        const id = listingCurrencyId(currency, game);
        if (!id || id === CHAOS || id === DIVINE || id === EXALTED) continue;
        for (const quote of [CHAOS, DIVINE, EXALTED])
            for (const pair of pairIds(id, quote)) ids.add(pair);
    }
    return [...ids];
}

function product(...amounts: (number | undefined)[]) {
    return amounts.every((amount) => amount) ? amounts.reduce((a, b) => a! * b!, 1) : undefined;
}

/**
 * Chaos per unit of each listing currency, keyed by the exchange hour that observed it. A
 * currency takes the cheapest of its chaos pair and its divine or exalted pair bridged to chaos;
 * divine and exalted fall back to each other when they lack a chaos pair.
 */
export function chaosRatesByHour(snapshots: ExchangeSnapshot[], currencies: string[]) {
    const hours = new Map<number, ExchangeSnapshot[]>();
    for (const row of snapshots) hours.set(row.hour, [...(hours.get(row.hour) ?? []), row]);
    const rates = new Map<number, Map<string, number>>();
    for (const [hour, rows] of hours) {
        const { realm, league } = rows[0]!;
        const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
        const pairs = new Map<string, ExchangeSnapshot[]>();
        for (const row of rows) {
            const [a, b] = row.marketId.split("|");
            if (!a || !b) continue;
            const key = pairKey(a, b);
            pairs.set(key, [...(pairs.get(key) ?? []), row]);
        }
        const quote = (itemId: string, quoteId: string) => {
            const matching = pairs.get(pairKey(itemId, quoteId));
            if (!matching) return undefined;
            return (
                quoteExchangeWindow(matching, { realm, league, itemId, quoteId }, hour)?.amount ||
                undefined
            );
        };
        const divineDirect = quote(DIVINE, CHAOS);
        const exaltedDirect = quote(EXALTED, CHAOS);
        const divine = divineDirect ?? product(quote(DIVINE, EXALTED), exaltedDirect);
        const exalted = exaltedDirect ?? product(quote(EXALTED, DIVINE), divineDirect);
        const hourRates = new Map<string, number>();
        for (const currency of currencies) {
            const id = listingCurrencyId(currency, marketGame(realm));
            if (!id || id === CHAOS) continue;
            const paths =
                id === DIVINE
                    ? [divine]
                    : id === EXALTED
                      ? [exalted]
                      : [
                            quote(id, CHAOS),
                            product(quote(id, DIVINE), divine),
                            product(quote(id, EXALTED), exalted),
                        ];
            const quoted = paths.filter((rate): rate is number => rate !== undefined);
            if (quoted.length) hourRates.set(currency, Math.min(...quoted));
        }
        rates.set(hour, hourRates);
    }
    return rates;
}

function chaosRate(rates: Map<number, Map<string, number>>, currency: string, hour: number) {
    if (exchangeCurrencyId(currency) === CHAOS) return 1;
    for (let at = hour; at >= hour - MARKET_RATE_MAX_AGE; at -= 3600) {
        const rate = rates.get(at)?.get(currency);
        if (rate) return rate;
    }
    return undefined;
}

/** Converts one display-currency unit per listing-currency unit at an hour, through chaos. */
export function marketDisplayRate(
    rates: Map<number, Map<string, number>>,
    display: string,
    hour: number,
) {
    const target = chaosRate(rates, display, hour);
    return (currency: string) => {
        if (currency === display) return 1;
        const source = chaosRate(rates, currency, hour);
        return source && target ? source / target : undefined;
    };
}

type Point = { x: number; q: number };
const QUANTILES = [
    ["min", 0],
    ["p10", 0.1],
    ["p25", 0.25],
    ["median", 0.5],
    ["p75", 0.75],
    ["p90", 0.9],
    ["max", 1],
] as const;

// Piecewise-linear CDF through a summary's stored quantiles; `left` gives the limit from below.
function cdf(points: Point[], x: number, left: boolean) {
    const below = (point: Point) => (left ? point.x < x : point.x <= x);
    let index = -1;
    for (let next = 0; next < points.length && below(points[next]!); next++) index = next;
    if (index === -1) return 0;
    if (index === points.length - 1) return 1;
    const from = points[index]!;
    const to = points[index + 1]!;
    return to.x === from.x ? from.q : from.q + ((to.q - from.q) * (x - from.x)) / (to.x - from.x);
}

/**
 * Merges per-currency listing summaries into one distribution in the display currency. Each
 * currency's stored quantiles define its CDF; the merged CDF is their listing-count-weighted
 * mixture, so a single contributing currency reproduces its own quantiles exactly.
 */
export function mergeMarketPrices(
    prices: Record<string, MarketPriceSummary> | null,
    rate: (currency: string) => number | undefined,
): MergedMarketPrice | null {
    const components: { weight: number; mean: number | null; points: Point[] }[] = [];
    let unconverted = 0;
    for (const [currency, summary] of Object.entries(prices ?? {})) {
        const multiplier = rate(currency);
        if (!multiplier) {
            unconverted += summary.count;
            continue;
        }
        components.push({
            weight: summary.count,
            mean: summary.mean === undefined ? null : summary.mean * multiplier,
            points: QUANTILES.flatMap(([key, q]) => {
                const value = summary[key];
                return value === undefined ? [] : [{ x: value * multiplier, q }];
            }),
        });
    }
    const count = components.reduce((total, component) => total + component.weight, 0);
    if (!count) return null;
    const mixture = (x: number, left: boolean) =>
        components.reduce(
            (total, component) => total + component.weight * cdf(component.points, x, left),
            0,
        ) / count;
    const xs = [...new Set(components.flatMap((component) => component.points.map((p) => p.x)))];
    xs.sort((a, b) => a - b);
    function quantile(q: number) {
        for (let index = 0; index < xs.length; index++) {
            const x = xs[index]!;
            const before = mixture(x, true);
            if (index > 0 && before >= q) {
                const previous = xs[index - 1]!;
                const start = mixture(previous, false);
                return previous + ((q - start) / (before - start)) * (x - previous);
            }
            if (mixture(x, false) >= q) return x;
        }
        return xs.at(-1)!;
    }
    const means = components.map((component) => component.mean);
    return {
        count,
        unconverted,
        mean: means.every((mean) => mean !== null)
            ? components.reduce((total, c) => total + c.weight * c.mean!, 0) / count
            : null,
        min: xs[0]!,
        p10: quantile(0.1),
        p25: quantile(0.25),
        median: quantile(0.5),
        p75: quantile(0.75),
        p90: quantile(0.9),
        max: xs.at(-1)!,
    };
}
