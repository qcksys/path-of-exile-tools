import { describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "../app/db/client";
import * as marketQueries from "../app/db/queries/crafting-market.queries";
import { CraftingGraphSimulation } from "../app/lib/crafting-graph-simulation";
import { bindCohortPurchasePrice, livePurchasePrices } from "../app/lib/crafting-market";
import { refreshCraftingMarketPrices } from "../app/operations/crafting-market.server";
import { catalog, currency, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import {
    scouringMarketFixture as fixture,
    sourceMarketPurchase as purchase,
} from "./crafting-source-market-fixtures";

describe("paid Scouring market source", () => {
    it("binds the raw ask while calculation charges preparation separately", () => {
        const { graph, candidate, profile } = fixture();
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        expect(purchase(bound).alternative.price?.amount).toBe(20);
        expect(livePurchasePrices(bound)[0]?.reference.sourcePreparation).toEqual(profile);
        bound.prices[currency("convert_to_normal").id] = quote(2);
        bound.iterations = 1;
        const simulation = new CraftingGraphSimulation(catalog, bound, { estimateIterations: 1 });
        while (!simulation.done) simulation.runBatch();
        expect(simulation.result()).toMatchObject({
            complete: true,
            meanCost: 30,
            meanActions: 3,
            missingPrices: [],
        });
    });

    it.each([
        "change",
        "remove",
        "override",
    ])("refuses direct calculation after source policy %s", (edit) => {
        const { graph, candidate } = fixture();
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        const { alternative } = purchase(bound);
        if (alternative.sourcePreparation?.kind !== "scour-v1")
            throw new Error("Expected Scouring source profile.");
        if (edit === "change") alternative.sourcePreparation.crafted = false;
        else if (edit === "remove") delete alternative.sourcePreparation;
        else {
            const other = fixture(false, true);
            const otherBound = bindCohortPurchasePrice(
                other.graph,
                engine,
                "base",
                "buy",
                other.candidate,
            );
            bound.prices["purchase:base:buy"] = purchase(otherBound).alternative.price!;
        }
        expect(
            () => new CraftingGraphSimulation(catalog, bound, { estimateIterations: 1 }),
        ).toThrow(/source preparation/i);
    });

    it("rejects ordinary and r11 bindings, but permits an explicit manual price with cleanup", () => {
        const { graph, candidate } = fixture();
        graph.ruleset.engine = "crafting-graph-11";
        expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", candidate)).toThrow(
            "engine 12",
        );
        graph.ruleset.engine = "crafting-graph-12";
        delete purchase(graph).alternative.sourcePreparation;
        expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", candidate)).toThrow(
            "different source preparation",
        );
        const bound = fixture().graph;
        bound.prices["purchase:base:buy"] = quote(17);
        bound.prices[currency("convert_to_normal").id] = quote(2);
        bound.iterations = 1;
        const simulation = new CraftingGraphSimulation(catalog, bound, { estimateIterations: 1 });
        while (!simulation.done) simulation.runBatch();
        expect(simulation.result()).toMatchObject({
            meanCost: 27,
            meanActions: 3,
            missingPrices: [],
        });
    });

    it("refreshes with the same source policy and preserves a newer unpriced correction", async () => {
        const { graph, candidate, profile } = fixture();
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        const latest = structuredClone(candidate);
        latest.latest.hour += 3600;
        latest.latest.prices = {};
        latest.covered = false;
        latest.reasons = ["No asking price in the comparison currency."];
        const lookup = vi.spyOn(marketQueries, "findCraftingMarketPrices").mockResolvedValue({
            candidates: [candidate, latest],
            truncated: false,
            message: null,
        });
        try {
            const result = await refreshCraftingMarketPrices(
                createDbConnection("mysql://test:test@localhost/poe_test"),
                bound,
                engine,
                latest.latest.hour,
            );
            expect(lookup).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ sourcePreparation: profile }),
                candidate.definition.id,
            );
            expect(result.graph).toEqual(bound);
            expect(result.issues).toHaveLength(1);
        } finally {
            lookup.mockRestore();
        }
    });
});
