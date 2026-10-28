import { describe, expect, it } from "vite-plus/test";
import {
    decodeExchangePriceReference,
    encodeExchangePriceReference,
    exchangeCurrencyId,
    exchangeMarketTracked,
    exchangeSnapshotSchema,
    exchangeUnitQuote,
    listingCurrencyId,
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

    it("maps every trade price currency to its exchange item for both games", () => {
        const wisdom = "Metadata/Items/Currency/CurrencyIdentification";
        expect(listingCurrencyId("wisdom", "poe1")).toBe(wisdom);
        expect(listingCurrencyId("wisdom", "poe2")).toBe(wisdom);
        expect(listingCurrencyId("whetstone", "poe1")).toBe(
            "Metadata/Items/Currency/CurrencyWeaponQuality",
        );
        expect(listingCurrencyId("chaos", "poe2")).toBe(chaos);
        expect(listingCurrencyId("greater-chaos-orb", "poe1")).toBeNull();
        expect(listingCurrencyId(item, "poe2")).toBe(item);
        expect(listingCurrencyId("toString", "poe1")).toBeNull();
    });
    it("tracks only markets with one of the game's price currencies", () => {
        const id = (currency: string, game: "poe1" | "poe2") => listingCurrencyId(currency, game)!;
        const mirror = id("mirror", "poe1");
        const fragmentedDelirium = "Metadata/Items/Currency/CurrencyAfflictionShardDelirium";
        const tracked = (realm: string, marketId: string) =>
            exchangeMarketTracked(realm, "Allflame", marketId);
        expect(tracked("pc", `${mirror}|${id("divine", "poe1")}`)).toBe(true);
        expect(tracked("pc", `${id("chaos", "poe1")}|${item}`)).toBe(true);
        expect(tracked("pc", `${mirror}|${fragmentedDelirium}`)).toBe(false);
        // Exalted and annulment price PoE 2 only.
        expect(tracked("pc", `${item}|${id("exalted", "poe1")}`)).toBe(false);
        expect(tracked("xbox", `${item}|${id("annul", "poe1")}`)).toBe(false);
        for (const currency of ["exalted", "chaos", "annul", "divine"])
            expect(tracked("poe2", `${item}|${id(currency, "poe2")}`)).toBe(true);
        expect(tracked("poe2", `${item}|${mirror}`)).toBe(false);
    });
    it("tracks no market of a Ruthless league", () => {
        const pair = `${item}|${chaos}`;
        for (const league of [
            "Ruthless Allflame",
            "HC Ruthless Allflame",
            "Ruthless Limey Whelps (PL87210)",
        ])
            expect(exchangeMarketTracked("pc", league, pair)).toBe(false);
        expect(exchangeMarketTracked("pc", "Hardcore Allflame", pair)).toBe(true);
    });
});
