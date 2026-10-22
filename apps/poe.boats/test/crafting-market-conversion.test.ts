import { decodeCohortPriceReference, exchangeCurrencyId } from "@poe-tools/market";
import { describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "../app/db/client";
import * as queries from "../app/db/queries/crafting-market.queries";
import {
    bindCohortPurchasePrice,
    livePurchasePrices,
    selectCraftingMarketPrice,
} from "../app/lib/crafting-market";
import { refreshCraftingMarketPrices } from "../app/operations/crafting-market.server";
import { craftingMarketCandidateSchema } from "../app/schemas/crafting-market";
import { engine } from "./crafting-fixtures";
import { marketCandidate, marketGraph } from "./crafting-market-fixtures";

export function convertedCandidate() {
    return craftingMarketCandidateSchema.parse({
        ...marketCandidate,
        latest: {
            ...marketCandidate.latest,
            prices: { divine: marketCandidate.latest.prices.chaos },
        },
        conversion: "exchange-v1",
        exchange: {
            currency: "divine",
            quote: {
                realm: "pc",
                league: "Standard",
                itemId: exchangeCurrencyId("divine"),
                quoteId: exchangeCurrencyId("chaos"),
                amount: 100,
                hour: marketCandidate.latest.hour,
                marketId: `${exchangeCurrencyId("divine")}|${exchangeCurrencyId("chaos")}`,
                low: 99,
                high: 101,
                itemVolume: 10,
                quoteVolume: 1000,
                estimator: "traded-volume-ratio-v1",
            },
        },
    });
}

describe("equipment asking-price conversion", () => {
    it("binds an explicitly converted median and retains both observation sources", () => {
        const candidate = convertedCandidate();
        const selected = selectCraftingMarketPrice(candidate, "chaos");
        expect(selected).toMatchObject({ min: 1000, median: 2000, max: 3000, hours: 1, count: 10 });
        const bound = bindCohortPurchasePrice(marketGraph(), engine, "base", "buy", candidate);
        const price = livePurchasePrices(bound)[0]!.alternative.price!;
        expect(price).toMatchObject({ amount: 2000, currency: "chaos", confidence: null });
        expect(decodeCohortPriceReference(price.cohortId)).toMatchObject({
            conversion: "exchange-v1",
            exchange: candidate.exchange,
        });
    });

    it("requires explicit conversion, the same hour, realm, league and currency pair", () => {
        for (const change of [
            "policy",
            "hour",
            "realm",
            "league",
            "itemId",
            "quoteId",
            "window",
        ] as const) {
            const candidate = convertedCandidate();
            if (change === "policy") delete candidate.conversion;
            else if (change === "hour") candidate.exchange!.quote.hour! -= 3600;
            else if (change === "realm") candidate.exchange!.quote.realm = "sony";
            else if (change === "league") candidate.exchange!.quote.league = "Other";
            else if (change === "window")
                candidate.exchange!.quote.windowStart = candidate.latest.hour - 3600;
            else candidate.exchange!.quote[change] = exchangeCurrencyId("exalted")!;
            expect(selectCraftingMarketPrice(candidate, "chaos"), change).toBeNull();
            expect(() =>
                bindCohortPurchasePrice(marketGraph(), engine, "base", "buy", candidate),
            ).toThrow("No asking price");
        }
    });

    it("uses native prices first and never applies one-hour exchange rates to wider listing windows", () => {
        const candidate = convertedCandidate();
        candidate.window = "adaptive-v1";
        candidate.latest.prices.divine!.sellers = 1;
        candidate.latest.prices.divine!.windows = {
            6: {
                min: 18,
                median: 21,
                max: 23,
                count: 12,
                sellers: 12,
                confidence: 0.6,
                listingCount: 12,
                unknownCount: 0,
                hourlyMedianMin: 20,
                hourlyMedianMax: 21,
            },
        };
        expect(selectCraftingMarketPrice(candidate, "chaos")).toMatchObject({
            median: 2000,
            hours: 1,
        });
        candidate.latest.prices.chaos = marketCandidate.latest.prices.chaos;
        expect(selectCraftingMarketPrice(candidate, "chaos")?.median).toBe(20);
    });

    it("preserves conversion consent on refresh and retains a saved price if aligned exchange data is missing", async () => {
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const candidate = convertedCandidate();
        const graph = bindCohortPurchasePrice(marketGraph(), engine, "base", "buy", candidate);
        const lookup = vi
            .spyOn(queries, "findCraftingMarketPrices")
            .mockResolvedValue({ candidates: [], truncated: false, message: null });
        try {
            const result = await refreshCraftingMarketPrices(db, graph, engine);
            expect(lookup.mock.calls[0]?.[1].conversion).toBe("exchange-v1");
            expect(result.issues).toHaveLength(1);
            expect(result.graph).toEqual(graph);
        } finally {
            lookup.mockRestore();
        }
    });
});
