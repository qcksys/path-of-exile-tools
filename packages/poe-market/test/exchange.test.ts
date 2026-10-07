import { describe, expect, it } from "vite-plus/test";
import {
    decodeExchangePriceReference,
    encodeExchangePriceReference,
    exchangeCurrencyId,
    exchangeSnapshotSchema,
    exchangeUnitQuote,
    quoteExchangeSnapshot,
} from "../src/exchange.ts";

const item = "Metadata/Items/Currency/CurrencyCorrupt";
const chaos = "Metadata/Items/Currency/CurrencyRerollRare";
const snapshot = exchangeSnapshotSchema.parse({
    realm: "pc",
    league: "Settlers",
    marketId: `${item}|${chaos}`,
    hour: 1722031200,
    volumeTraded: { [item]: 2, [chaos]: 4 },
    lowestRatio: { [item]: 1, [chaos]: 1 },
    highestRatio: { [item]: 1, [chaos]: 3 },
});
describe("currency exchange estimates", () => {
    it("uses traded volumes in the requested direction and normalizes ratio bounds", () => {
        expect(quoteExchangeSnapshot(snapshot, item, chaos)).toMatchObject({
            amount: 2,
            low: 1,
            high: 3,
            itemVolume: 2,
            quoteVolume: 4,
            estimator: "traded-volume-ratio-v1",
        });
        expect(quoteExchangeSnapshot(snapshot, chaos, item)).toMatchObject({
            amount: 0.5,
            low: 1 / 3,
            high: 1,
            itemVolume: 4,
            quoteVolume: 2,
        });
        expect(quoteExchangeSnapshot({ ...snapshot, realm: "poe2" }, item, chaos)?.realm).toBe(
            "poe2",
        );
    });
    it("never turns zero, missing, unsafe or unrelated volume into a price", () => {
        for (const volumeTraded of [
            null,
            {},
            { [item]: 0, [chaos]: 4 },
            { [item]: 2, [chaos]: 0 },
            { [item]: 2, [chaos]: Number.MAX_SAFE_INTEGER + 1 },
        ])
            expect(quoteExchangeSnapshot({ ...snapshot, volumeTraded }, item, chaos)).toBeNull();
        expect(quoteExchangeSnapshot(snapshot, item, "Metadata/Items/Currency/Other")).toBeNull();
        expect(quoteExchangeSnapshot(snapshot, item, item)).toBeNull();
        expect(
            quoteExchangeSnapshot({ ...snapshot, lowestRatio: null }, item, chaos),
        ).toMatchObject({ amount: 2, low: null, high: null });
    });
    it("keeps canonical IDs and scope in a retained-engine-compatible reference", () => {
        const reference = {
            realm: "pc" as const,
            league: "Settlers",
            itemId: item,
            quoteId: chaos,
        };
        expect(decodeExchangePriceReference(encodeExchangePriceReference(reference))).toEqual(
            reference,
        );
        expect(decodeExchangePriceReference("exchange:v1:%broken")).toBeNull();
        expect(exchangeCurrencyId("chaos")).toBe(chaos);
        expect(exchangeCurrencyId(item)).toBe(item);
        expect(exchangeCurrencyId("unknown")).toBeNull();
        expect(exchangeUnitQuote({ ...reference, itemId: chaos })).toMatchObject({
            amount: 1,
            hour: null,
            estimator: "currency-unit-v1",
        });
        expect(() => exchangeUnitQuote(reference)).toThrow("itself");
    });
});
