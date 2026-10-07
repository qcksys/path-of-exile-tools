import { describe, expect, it } from "vite-plus/test";
import {
    decodeExchangePriceReference,
    type ExchangeSnapshot,
    encodeExchangePriceReference,
} from "../src/exchange.ts";
import { quoteExchangeWindow } from "../src/exchange-window.ts";

const itemId = "Metadata/Items/Currency/CurrencyCorrupt";
const quoteId = "Metadata/Items/Currency/CurrencyRerollRare";
const reference = {
    realm: "pc" as const,
    league: "Test",
    itemId,
    quoteId,
    window: "adaptive-v1" as const,
};
const end = 1722031200;
function history(volume = 2): ExchangeSnapshot[] {
    return Array.from({ length: 24 }, (_, offset) => ({
        realm: reference.realm,
        league: reference.league,
        marketId: `${itemId}|${quoteId}`,
        hour: end - offset * 3600,
        volumeTraded: { [itemId]: volume, [quoteId]: volume * 2 },
        lowestRatio: { [itemId]: 1, [quoteId]: 1 },
        highestRatio: { [itemId]: 1, [quoteId]: 3 },
    }));
}
describe("adaptive exchange estimates", () => {
    it("keeps busy markets hourly, widens stable thin markets, and preserves the policy in references", () => {
        for (const [volume, hours] of [
            [100, 1],
            [20, 6],
            [2, 24],
        ]) {
            expect(quoteExchangeWindow(history(volume), reference, end)).toMatchObject({
                amount: 2,
                itemVolume: volume! * hours!,
                quoteVolume: volume! * hours! * 2,
                hour: end,
                windowStart: end - (hours! - 1) * 3600,
                estimator: "adaptive-volume-ratio-v1",
                window: "adaptive-v1",
                low: 1,
                high: 3,
            });
        }
        expect(decodeExchangePriceReference(encodeExchangePriceReference(reference))).toEqual(
            reference,
        );
    });
    it("uses summed volumes instead of averaging hourly prices and does not double-count inverse pairs", () => {
        const rows = history(20);
        rows[0]!.volumeTraded = { [itemId]: 10, [quoteId]: 21 };
        const expected = (21 + 5 * 40) / 110;
        rows.push({ ...rows[0]!, marketId: `${quoteId}|${itemId}` });
        expect(quoteExchangeWindow(rows.toReversed(), reference, end)).toMatchObject({
            amount: expected,
            itemVolume: 110,
            windowStart: end - 5 * 3600,
        });
        rows.push({ ...rows[0]!, volumeTraded: { [itemId]: 10, [quoteId]: 22 } });
        expect(quoteExchangeWindow(rows, reference, end)).toBeNull();
    });
    it("stops at price changes, missing hours and invalid volumes without masking an empty latest hour", () => {
        const rows = history();
        rows[8]!.volumeTraded = { [itemId]: 2, [quoteId]: 10 };
        expect(quoteExchangeWindow(rows, reference, end)?.windowStart).toBe(end - 5 * 3600);
        rows[2]!.volumeTraded = { [itemId]: 2, [quoteId]: 10 };
        expect(quoteExchangeWindow(rows, reference, end)?.windowStart).toBe(end);
        expect(
            quoteExchangeWindow(
                history().filter((_, i) => i !== 1),
                reference,
                end,
            )?.windowStart,
        ).toBe(end);
        for (const volumeTraded of [
            null,
            {},
            { [itemId]: 0, [quoteId]: 0 },
            { [itemId]: Number.MAX_SAFE_INTEGER + 1, [quoteId]: 2 },
        ])
            expect(
                quoteExchangeWindow(
                    [{ ...rows[0]!, volumeTraded }, ...rows.slice(1)],
                    reference,
                    end,
                ),
            ).toBeNull();
    });
    it("requires captured hours, permits observed zero-trade hours, and isolates historical scope", () => {
        const rows = history();
        rows[1]!.volumeTraded = { [itemId]: 0, [quoteId]: 0 };
        rows[2]!.lowestRatio = null;
        rows.push({ ...rows[0]!, hour: end + 3600, volumeTraded: { [itemId]: 2, [quoteId]: 200 } });
        rows.push({ ...rows[0]!, realm: "poe2", volumeTraded: { [itemId]: 2, [quoteId]: 200 } });
        expect(quoteExchangeWindow(rows, reference, end)).toMatchObject({
            amount: 2,
            itemVolume: 46,
            windowStart: end - 23 * 3600,
            low: null,
            high: null,
        });
        expect(quoteExchangeWindow(rows, { ...reference, league: "Other" }, end)).toBeNull();
        expect(quoteExchangeWindow(rows, { ...reference, realm: "poe2" }, end)?.amount).toBe(100);
        expect(quoteExchangeWindow(rows, reference, end - 3600)).toBeNull();
    });
});
