/** biome-ignore-all lint/style/useNamingConvention: Fixtures use the trade API's field names. */
import { describe, expect, it } from "vite-plus/test";
import {
    extensionEnvelopeSchema,
    isTradeApiPath,
    pageEnvelope,
    pageEnvelopeSchema,
    scrubTradeListing,
    tradeFetchPath,
    tradeSearchPath,
} from "../src/index.ts";

const entry = {
    id: "abc123",
    listing: {
        method: "psapi",
        indexed: "2026-10-27T10:00:00Z",
        stash: { name: "~b/o 5 chaos", x: 1, y: 2 },
        whisper: "@Seller Hi, I would like to buy your item",
        whisper_token: "secret-token",
        account: { name: "Seller#1234", lastCharacterName: "SellerChar", online: { league: "X" } },
        price: { type: "~b/o", amount: 5, currency: "chaos" },
    },
    item: {
        name: "Doom Bane",
        typeLine: "Vaal Regalia",
        baseType: "Vaal Regalia",
        rarity: "Rare",
        ilvl: 86,
        identified: true,
        note: "~b/o 5 chaos",
        icon: "https://example.invalid/icon.png",
        explicitMods: ["+80 to maximum Life"],
        extended: { prefixes: 1, suffixes: 0, es: 300, mods: { explicit: [] }, hashes: {} },
    },
};

describe("listing scrubbing", () => {
    it("keeps price, time and item facts and drops seller details", () => {
        const listing = scrubTradeListing(entry, "instant");
        expect(listing).toEqual({
            id: "abc123",
            indexed: "2026-10-27T10:00:00Z",
            price: { amount: 5, currency: "chaos" },
            sale: "instant",
            item: {
                name: "Doom Bane",
                typeLine: "Vaal Regalia",
                baseType: "Vaal Regalia",
                rarity: "Rare",
                ilvl: 86,
                identified: true,
                explicitMods: ["+80 to maximum Life"],
                extended: { prefixes: 1, suffixes: 0, mods: { explicit: [] }, hashes: {} },
            },
        });
        const text = JSON.stringify(listing);
        for (const secret of ["Seller", "secret-token", "~b/o", "icon"])
            expect(text).not.toContain(secret);
    });

    it("drops vanished, unpriced and non-positive listings", () => {
        expect(scrubTradeListing(null, "instant")).toBeNull();
        expect(
            scrubTradeListing({ ...entry, listing: { ...entry.listing, price: null } }, "instant"),
        ).toBeNull();
        expect(
            scrubTradeListing(
                {
                    ...entry,
                    listing: { ...entry.listing, price: { amount: 0, currency: "chaos" } },
                },
                "in-person",
            ),
        ).toBeNull();
    });
});

describe("trade API paths", () => {
    it("builds search and fetch paths for both games", () => {
        expect(tradeSearchPath("poe1", "Settlers of Kalguur")).toBe(
            "/api/trade/search/Settlers%20of%20Kalguur",
        );
        expect(tradeSearchPath("poe2", "Standard")).toBe("/api/trade2/search/poe2/Standard");
        expect(tradeFetchPath("poe1", ["a", "b"], "q1")).toBe("/api/trade/fetch/a,b?query=q1");
        expect(tradeFetchPath("poe2", ["a"], "q1")).toBe("/api/trade2/fetch/a?query=q1&realm=poe2");
        expect(() => tradeFetchPath("poe1", [], "q1")).toThrow();
        expect(() => tradeFetchPath("poe1", ["a/../b"], "q1")).toThrow();
    });

    it("allows only trade search and fetch paths", () => {
        for (const path of [
            tradeSearchPath("poe1", "Standard"),
            tradeSearchPath("poe2", "Hardcore Standard"),
            tradeFetchPath("poe1", ["a", "b"], "q1"),
            tradeFetchPath("poe2", ["a"], "q1"),
        ])
            expect(isTradeApiPath(path)).toBe(true);
        for (const path of [
            "/api/profile",
            "/my-account",
            "/api/trade/search/Standard/extra",
            "/api/trade/fetch/a?query=q1&other=1",
            "https://example.com/api/trade/search/Standard",
        ])
            expect(isTradeApiPath(path)).toBe(false);
    });
});

describe("bridge envelopes", () => {
    it("accepts known page messages and refuses unknown ones", () => {
        expect(pageEnvelopeSchema.safeParse(pageEnvelope({ kind: "hello" })).success).toBe(true);
        expect(
            pageEnvelopeSchema.safeParse({
                source: "poe-boats",
                bridge: 1,
                message: { kind: "fetchAnything", url: "https://example.com" },
            }).success,
        ).toBe(false);
        expect(
            extensionEnvelopeSchema.safeParse({
                source: "poe-boats-extension",
                bridge: 1,
                message: { kind: "ready", version: "0.1.0", bridge: 1 },
            }).success,
        ).toBe(true);
    });
});
