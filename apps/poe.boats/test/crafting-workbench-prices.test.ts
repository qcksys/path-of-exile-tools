import { describe, expect, it } from "vite-plus/test";
import { bindExchangePrice } from "../app/lib/crafting-exchange";
import {
    copyWorkbenchMarketPrices,
    workbenchPriceGraph,
} from "../app/lib/crafting-workbench-prices";
import { craftingProjectSchema } from "../app/schemas/crafting";
import { exchangeQuote, transmuteId } from "./crafting-exchange-fixtures";
import { baseId, engine } from "./crafting-fixtures";
import { historyIndex } from "./crafting-history-fixtures";

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
});
