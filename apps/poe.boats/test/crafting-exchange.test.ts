import { describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "~/db/client";
import * as queries from "~/db/queries/crafting-exchange.queries";
import {
    bindExchangePrice,
    liveExchangePrices,
    unavailableExchangePrices,
} from "~/lib/crafting-exchange";
import { calculateCraftingGraph } from "~/lib/crafting-graph-simulation";
import { assertCraftingSourcePrices } from "~/lib/crafting-sources";
import {
    craftingMarketSnapshots,
    refreshCraftingMarketPrices,
} from "~/operations/crafting-market.server";
import { craftingExchangeInputSchema } from "~/schemas/crafting-exchange";
import { exchangeGraph, exchangeQuote, transmuteId } from "./crafting-exchange-fixtures";
import { catalog, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";

describe("crafting exchange bindings", () => {
    it("retains optional conversion on a direct quote through refresh and historical cutoffs", async () => {
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const converted = { ...exchangeQuote, conversion: "reference-currency-v1" as const };
        const graph = bindExchangePrice(exchangeGraph(), transmuteId, converted);
        const lookup = vi
            .spyOn(queries, "findCraftingExchangePrices")
            .mockResolvedValue({ quotes: { [transmuteId]: converted }, missing: {} });
        try {
            expect(
                (await refreshCraftingMarketPrices(db, graph, engine, exchangeQuote.hour!)).issues,
            ).toEqual([]);
            expect(lookup).toHaveBeenCalledWith(
                db,
                expect.objectContaining({
                    conversion: "reference-currency-v1",
                    at: exchangeQuote.hour,
                }),
            );
            expect(liveExchangePrices(graph)[0]?.reference.conversion).toBe(
                "reference-currency-v1",
            );
        } finally {
            lookup.mockRestore();
        }
    });
    it("retains adaptive policy through historical refresh and keeps hourly bindings in a separate lookup", async () => {
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const otherId = "Metadata/Items/Currency/CurrencyRerollMagic";
        const adaptive = {
            ...exchangeQuote,
            window: "adaptive-v1" as const,
            estimator: "adaptive-volume-ratio-v1" as const,
            windowStart: exchangeQuote.hour! - 5 * 3600,
        };
        const graph = bindExchangePrice(
            bindExchangePrice(exchangeGraph(), transmuteId, adaptive),
            otherId,
            { ...exchangeQuote, itemId: otherId },
        );
        const lookup = vi
            .spyOn(queries, "findCraftingExchangePrices")
            .mockImplementation(async (_, input) => ({
                quotes: Object.fromEntries(
                    input.itemIds.map((id) => [
                        id,
                        {
                            ...(input.window ? adaptive : exchangeQuote),
                            itemId: id,
                        },
                    ]),
                ),
                missing: {},
            }));
        try {
            const at = exchangeQuote.hour!;
            const refreshed = await refreshCraftingMarketPrices(db, graph, engine, at);
            expect(refreshed.issues).toEqual([]);
            expect(refreshed.graph).toEqual(graph);
            expect(lookup).toHaveBeenCalledTimes(2);
            expect(lookup).toHaveBeenCalledWith(
                db,
                expect.objectContaining({
                    itemIds: [transmuteId],
                    window: "adaptive-v1",
                    at,
                }),
            );
            expect(lookup).toHaveBeenCalledWith(
                db,
                expect.objectContaining({
                    itemIds: [otherId],
                    window: undefined,
                    at,
                }),
            );
            expect(liveExchangePrices(refreshed.graph)[0]!.reference.window).toBe("adaptive-v1");
        } finally {
            lookup.mockRestore();
        }
    });
    it("prices a whole craft and refuses another game, league, item or currency", () => {
        const graph = bindExchangePrice(exchangeGraph(), transmuteId, exchangeQuote);
        expect(calculateCraftingGraph(catalog, graph, { estimateIterations: 3 }).meanCost).toBe(12);
        expect(liveExchangePrices(graph)[0]?.reference.itemId).toBe(transmuteId);
        for (const wrong of [
            { league: "Other" },
            { currency: "divine" },
            { game: "poe2" as const },
        ])
            expect(() =>
                bindExchangePrice({ ...graph, ...wrong }, transmuteId, exchangeQuote),
            ).toThrow("does not match");
        expect(() => bindExchangePrice(graph, "service:recombine", exchangeQuote)).toThrow(
            "does not match",
        );
        expect(
            craftingExchangeInputSchema.safeParse({
                game: "poe2",
                realm: "pc",
                league: "Standard",
                currency: "chaos",
                itemIds: [transmuteId],
            }).success,
        ).toBe(false);
    });
    it("blocks unavailable estimates while retaining bindings for later refresh", async () => {
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const graph = bindExchangePrice(exchangeGraph(), transmuteId, exchangeQuote);
        const lookup = vi.spyOn(queries, "findCraftingExchangePrices").mockResolvedValue({
            quotes: { [transmuteId]: { ...exchangeQuote, amount: 3 } },
            missing: {},
        });
        try {
            const next = await refreshCraftingMarketPrices(db, graph, engine);
            expect(next.issues).toEqual([]);
            expect(next.graph.prices[transmuteId]?.amount).toBe(3);
            const manual = { ...graph, prices: { [transmuteId]: quote(4) } };
            expect((await refreshCraftingMarketPrices(db, manual, engine)).graph).toEqual(manual);
            expect(lookup).toHaveBeenCalledTimes(1);
            lookup.mockResolvedValue({
                quotes: {},
                missing: { [transmuteId]: "No positive volume" },
            });
            const missing = await refreshCraftingMarketPrices(db, graph, engine);
            expect(graph.prices[transmuteId]?.amount).toBe(2);
            expect(missing.graph.prices[transmuteId]?.amount).toBe(2);
            expect(missing.issues[0]).toContain("No positive volume");
            expect(unavailableExchangePrices(missing.graph)).toEqual([transmuteId]);
            expect(liveExchangePrices(missing.graph)).toEqual(liveExchangePrices(graph));
            expect(() => assertCraftingSourcePrices(missing.graph)).toThrow(
                "exchange price is unavailable",
            );
            expect((await refreshCraftingMarketPrices(db, missing.graph, engine)).graph).toEqual(
                missing.graph,
            );
            const historicalMissing = await craftingMarketSnapshots(db, missing.graph, engine, [
                exchangeQuote.hour!,
            ]);
            expect(historicalMissing.points[0]?.graph).toBeNull();
            const wrongScope = await refreshCraftingMarketPrices(
                db,
                { ...graph, league: "Other" },
                engine,
            );
            expect(wrongScope.issues[0]).toContain("does not match");
            expect(() => assertCraftingSourcePrices(wrongScope.graph)).toThrow(
                "exchange price is unavailable",
            );
            lookup.mockResolvedValue({
                quotes: { [transmuteId]: { ...exchangeQuote, amount: 4 } },
                missing: {},
            });
            const recovered = await refreshCraftingMarketPrices(db, missing.graph, engine);
            expect(recovered.issues).toEqual([]);
            expect(recovered.graph.prices[transmuteId]?.amount).toBe(4);
            expect(unavailableExchangePrices(recovered.graph)).toEqual([]);
            expect(() => assertCraftingSourcePrices(recovered.graph)).not.toThrow();
            const historical = await craftingMarketSnapshots(db, missing.graph, engine, [
                exchangeQuote.hour!,
            ]);
            expect(historical.points[0]?.issues).toEqual([]);
            expect(historical.points[0]?.graph?.prices[transmuteId]?.amount).toBe(4);
            expect(() => assertCraftingSourcePrices(historical.points[0]!.graph!)).not.toThrow();
        } finally {
            lookup.mockRestore();
        }
    });
});
