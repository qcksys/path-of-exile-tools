import { describe, expect, it } from "vite-plus/test";
import { bindExchangePrice, markExchangePriceUnavailable } from "../app/lib/crafting-exchange";
import { bindCraftingSourcePrice, markVendorPriceUnavailable } from "../app/lib/crafting-sources";
import {
    copyWorkbenchMarketPrices,
    workbenchPriceGraph,
} from "../app/lib/crafting-workbench-prices";
import { craftingProjectSchema } from "../app/schemas/crafting";
import { emptyResonatorQuote, legacyResonatorPrice } from "./crafting-commodity-fixtures";
import { exchangeQuote, transmuteId } from "./crafting-exchange-fixtures";
import { baseId, engine } from "./crafting-fixtures";
import { historyIndex } from "./crafting-history-fixtures";
import { vendorOutputId, vendorQuote } from "./crafting-vendor-upgrade-fixtures";

const ruleset = historyIndex.revisions.find(
    (entry) => entry.game === "poe1" && entry.revision === "r7",
)!;
function project() {
    return craftingProjectSchema.parse({
        format: 1,
        game: "poe1",
        patch: engine.catalog.patch,
        item: engine.createItem(baseId),
        method: { kind: "currency", id: transmuteId },
        target: { groups: [] },
        prices: { [transmuteId]: 123 },
        steps: [],
        seed: 1,
        iterations: 1,
        maxActions: 1,
    });
}

describe("workbench market price copies", () => {
    it("refuses legacy resonator market prices before they become numeric workbench assumptions", () => {
        const id = emptyResonatorQuote.id;
        const input = { ...project(), prices: { [id]: 123 } };
        const graph = workbenchPriceGraph(engine, input, ruleset, "Standard");
        graph.prices[id] = legacyResonatorPrice();
        expect(() => copyWorkbenchMarketPrices(input, graph, "Standard", [id])).toThrow(
            "no verified empty provenance",
        );
        expect(copyWorkbenchMarketPrices(input, graph, "Standard", [])).toEqual({ [id]: 123 });
        graph.prices[id] = { ...graph.prices[id]!, source: "manual" };
        expect(copyWorkbenchMarketPrices(input, graph, "Standard", [id])).toEqual({ [id]: 123 });
        expect(input.prices[id]).toBe(123);
    });
    it("uses shared quote validation and copies only selected amounts without inventing a base cost", () => {
        const input = project();
        const graph = workbenchPriceGraph(engine, input, ruleset, " Standard ");
        const bound = bindExchangePrice(graph, transmuteId, exchangeQuote);
        expect(copyWorkbenchMarketPrices(input, bound, "Standard", [transmuteId])).toEqual({
            [transmuteId]: 2,
        });
        expect(input.prices[transmuteId]).toBe(123);
        expect(input.baseCost).toBeUndefined();
        expect(copyWorkbenchMarketPrices(input, bound, "Standard", [])).toEqual(input.prices);
        const unavailable = markExchangePriceUnavailable(bound, transmuteId);
        expect(() =>
            copyWorkbenchMarketPrices(input, unavailable, "Standard", [transmuteId]),
        ).toThrow("exchange price is unavailable");
        expect(copyWorkbenchMarketPrices(input, unavailable, "Standard", [])).toEqual(input.prices);
        expect(graph.prices[transmuteId]).toMatchObject({
            amount: 123,
            currency: "chaos",
            source: "manual",
        });
    });

    it("refuses wrong catalog, game, league and accounting currency", () => {
        const input = project();
        const graph = workbenchPriceGraph(engine, input, ruleset, "Standard");
        expect(() =>
            workbenchPriceGraph(
                engine,
                input,
                { ...ruleset, craftingSha256: "0".repeat(64) },
                "Standard",
            ),
        ).toThrow("matching catalog");
        for (const wrong of [
            { ...graph, game: "poe2" as const },
            { ...graph, currency: "divine" },
            { ...graph, league: "Other" },
        ])
            expect(() =>
                copyWorkbenchMarketPrices(input, wrong, "Standard", [transmuteId]),
            ).toThrow("does not match");
    });

    it("refuses to copy an unavailable vendor ingredient while preserving manual assumptions", () => {
        const input = { ...project(), prices: { [vendorOutputId]: 123 } };
        const graph = workbenchPriceGraph(engine, input, ruleset, "Standard");
        const bound = bindCraftingSourcePrice(graph, engine, vendorOutputId, vendorQuote);
        const unavailable = markVendorPriceUnavailable(bound, vendorOutputId);
        expect(() =>
            copyWorkbenchMarketPrices(input, unavailable, "Standard", [vendorOutputId]),
        ).toThrow("vendor ingredient exchange price is unavailable");
        expect(copyWorkbenchMarketPrices(input, unavailable, "Standard", [])).toEqual(input.prices);
        expect(input.prices[vendorOutputId]).toBe(123);
    });
});
