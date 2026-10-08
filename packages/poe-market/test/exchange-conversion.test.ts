import { describe, expect, it } from "vite-plus/test";
import { convertExchangeQuote, quoteExchangeSnapshot } from "../src/exchange.ts";

const item = "Metadata/Items/Currency/EssenceTest";
const divine = "Metadata/Items/Currency/CurrencyModValues";
const chaos = "Metadata/Items/Currency/CurrencyRerollRare";
function leg(from: string, to: string, fromVolume: number, toVolume: number) {
    return quoteExchangeSnapshot(
        {
            realm: "pc",
            league: "Allflame",
            hour: 1791428400,
            marketId: `${from}|${to}`,
            volumeTraded: { [from]: fromVolume, [to]: toVolume },
            lowestRatio: null,
            highestRatio: null,
        },
        from,
        to,
    )!;
}
describe("exchange conversion", () => {
    it("retains both traded legs and never claims a direct traded volume or range", () => {
        const first = leg(item, divine, 100, 2);
        const second = leg(divine, chaos, 10, 3600);
        expect(convertExchangeQuote(first, second)).toMatchObject({
            itemId: item,
            quoteId: chaos,
            amount: 7.2,
            hour: first.hour,
            conversion: "reference-currency-v1",
            estimator: "cross-rate-v1",
            marketId: null,
            itemVolume: null,
            quoteVolume: null,
            low: null,
            high: null,
            legs: [first, second],
        });
    });
    it("refuses mixed scopes, hours, windows, unrelated legs and recursive conversion", () => {
        const first = leg(item, divine, 100, 2);
        const second = leg(divine, chaos, 10, 3600);
        for (const invalid of [
            { ...second, hour: second.hour! - 3600 },
            { ...second, league: "Standard" },
            { ...second, realm: "poe2" as const },
            { ...second, itemId: chaos },
            { ...second, windowStart: second.hour! - 3600 },
            { ...second, estimator: "cross-rate-v1" as const },
        ])
            expect(convertExchangeQuote(first, invalid)).toBeNull();
    });
});
