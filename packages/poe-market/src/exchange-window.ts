import {
    type ExchangePriceReference,
    type ExchangeQuote,
    type ExchangeSnapshot,
    quoteExchangeSnapshot,
} from "./exchange.ts";

export const adaptiveExchangePolicy = { minimumItemVolume: 100, maximumMovement: 0.1 } as const;

export function quoteExchangeWindow(
    snapshots: ExchangeSnapshot[],
    reference: ExchangePriceReference,
    at: number,
): ExchangeQuote | null {
    const { itemId, quoteId, realm, league } = reference;
    const hours = new Map<number, ExchangeSnapshot[]>();
    for (const row of snapshots) {
        const pair = row.marketId.split("|");
        if (
            row.realm !== realm ||
            row.league !== league ||
            row.hour > at ||
            pair.length !== 2 ||
            !pair.includes(itemId) ||
            !pair.includes(quoteId)
        )
            continue;
        hours.set(row.hour, [...(hours.get(row.hour) ?? []), row]);
    }
    const latestHour = Math.max(...hours.keys());
    function observation(hour: number) {
        const rows = hours.get(hour);
        if (!rows?.length) return null;
        const candidates = rows.map((row) => {
            const quote = quoteExchangeSnapshot(row, itemId, quoteId);
            const itemVolume = row.volumeTraded?.[itemId];
            const quoteVolume = row.volumeTraded?.[quoteId];
            return { quote, itemVolume, quoteVolume };
        });
        const first = candidates[0]!;
        const key = ({ quote, itemVolume, quoteVolume }: typeof first) =>
            JSON.stringify([itemVolume, quoteVolume, quote?.low, quote?.high]);
        // Reversed pair IDs can repeat the same observation; conflicting copies are unusable.
        if (candidates.some((candidate) => key(candidate) !== key(first))) return null;
        return first.quote || (first.itemVolume === 0 && first.quoteVolume === 0) ? first : null;
    }
    const latest = observation(latestHour)?.quote;
    if (!latest) return null;
    let result: ExchangeQuote = {
        ...latest,
        window: "adaptive-v1",
        windowStart: latestHour,
        estimator: "adaptive-volume-ratio-v1",
    };
    for (const size of [6, 24]) {
        if (result.itemVolume! >= adaptiveExchangePolicy.minimumItemVolume) break;
        const quotes: ExchangeQuote[] = [];
        for (let offset = 0; offset < size; offset++) {
            const row = observation(latestHour - offset * 3600);
            if (!row) return result;
            if (row.quote) quotes.push(row.quote);
        }
        const amounts = quotes.map((quote) => quote.amount);
        if (
            Math.max(...amounts) / Math.min(...amounts) >
            1 + adaptiveExchangePolicy.maximumMovement
        )
            break;
        const itemVolume = quotes.reduce((total, quote) => total + quote.itemVolume!, 0);
        const quoteVolume = quotes.reduce((total, quote) => total + quote.quoteVolume!, 0);
        if (!Number.isSafeInteger(itemVolume) || !Number.isSafeInteger(quoteVolume)) break;
        const completeRange = quotes.every((quote) => quote.low !== null && quote.high !== null);
        result = {
            ...result,
            amount: quoteVolume / itemVolume,
            itemVolume,
            quoteVolume,
            low: completeRange ? Math.min(...quotes.map((quote) => quote.low!)) : null,
            high: completeRange ? Math.max(...quotes.map((quote) => quote.high!)) : null,
            windowStart: latestHour - (size - 1) * 3600,
        };
    }
    return result;
}
