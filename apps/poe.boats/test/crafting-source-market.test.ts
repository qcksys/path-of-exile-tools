import { cohortPriceCoverage, decodeCohortPriceReference } from "@poe-tools/market";
import { describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "../app/db/client";
import * as marketQueries from "../app/db/queries/crafting-market.queries";
import { CraftingGraphSimulation } from "../app/lib/crafting-graph-simulation";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import { bindCohortPurchasePrice, livePurchasePrices } from "../app/lib/crafting-market";
import {
    purchaseSourceProfile,
    sourcePreparationCosts,
} from "../app/lib/crafting-source-preparation";
import { refreshCraftingMarketPrices } from "../app/operations/crafting-market.server";
import { catalog, currency, engine } from "./crafting-fixtures";
import { quote } from "./crafting-graph-fixtures";
import {
    sourceMarketFixture as fixture,
    sourceMarketPurchase as purchase,
} from "./crafting-source-market-fixtures";

describe("intrinsic fractured-source market bindings", () => {
    it.each([
        [false, false],
        [true, false],
        [false, true],
        [true, true],
    ])("binds only its declared crafted=%s/enchantment=%s source partition", (crafted, enchanted) => {
        const { graph, candidate, profile } = fixture(crafted, enchanted);
        const { node, alternative } = purchase(graph);
        const record = createCraftingItemQuery(engine).record(alternative.item);
        expect(
            cohortPriceCoverage(candidate.definition, record, node.output, undefined, profile),
        ).toEqual({
            covered: true,
            reasons: [],
        });
        const bound = bindCohortPurchasePrice(graph, engine, node.id, alternative.id, candidate);
        expect(purchase(bound).alternative.price?.amount).toBe(20);
        expect(livePurchasePrices(bound)[0]!.reference.sourcePreparation).toEqual(profile);
        const wrong = structuredClone(candidate);
        wrong.sourcePreparation = { ...profile, crafted: !crafted };
        expect(() =>
            bindCohortPurchasePrice(graph, engine, node.id, alternative.id, wrong),
        ).toThrow("different source preparation");
        wrong.sourcePreparation = profile;
        wrong.definition.query.sourcePreparation = { ...profile, enchanted: !enchanted };
        expect(() =>
            bindCohortPurchasePrice(graph, engine, node.id, alternative.id, wrong),
        ).toThrow("does not definitely match");
    });

    it("refuses source quotes on an ordinary purchase even if the candidate advertises coverage", () => {
        const { graph, candidate } = fixture();
        const { alternative } = purchase(graph);
        delete alternative.sourcePreparation;
        expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", candidate)).toThrow(
            "different source preparation",
        );
        delete candidate.sourcePreparation;
        expect(candidate.covered).toBe(true);
        expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", candidate)).toThrow(
            "does not definitely match",
        );
    });

    it("refuses an ordinary-item quote for a source preparation purchase", () => {
        const { graph, candidate } = fixture();
        delete candidate.definition.query.sourcePreparation;
        expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", candidate)).toThrow(
            "does not definitely match",
        );
    });

    it("refuses source binding on a retained engine that cannot execute preparation", () => {
        const { graph, candidate } = fixture();
        graph.ruleset.engine = "crafting-graph-10";
        graph.ruleset.revision = "r10";
        expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", candidate)).toThrow(
            "Source preparation requires crafting engine 11",
        );
    });

    it("refuses source binding with an unavailable preparation method", () => {
        const { graph, candidate } = fixture();
        const source = purchase(graph).alternative.sourcePreparation;
        if (source?.kind !== "fractured-fossil-v1") throw new Error("Missing fossil source.");
        source.fossils.ids = ["missing-fossil"];
        expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", candidate)).toThrow();
    });

    it("does not use the projected source counts to guarantee the prepared acquisition output", () => {
        const { graph, candidate } = fixture();
        purchase(graph).node.output.groups[0]!.filters.push({
            kind: "range",
            field: "prefixes",
            value: { min: 0, max: 0 },
        });
        expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", candidate)).toThrow(
            "can guarantee only its base, level and retained fracture",
        );
    });

    it("refreshes a retained compatible source quote with its policy and original amount", async () => {
        const { graph, candidate, profile } = fixture();
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        const newer = structuredClone(candidate);
        newer.latest.hour += 3600;
        newer.latest.prices.chaos!.median = 31;
        newer.definition.revision = newer.latest.revision = "new-source-revision";
        const lookup = vi.spyOn(marketQueries, "findCraftingMarketPrices").mockResolvedValue({
            candidates: [candidate, newer],
            truncated: false,
            message: null,
        });
        try {
            const db = createDbConnection("mysql://test:test@localhost/poe_test");
            const refreshed = await refreshCraftingMarketPrices(
                db,
                bound,
                engine,
                newer.latest.hour,
            );
            expect(refreshed.issues).toEqual([]);
            expect(lookup).toHaveBeenCalledWith(
                db,
                expect.objectContaining({
                    sourcePreparation: profile,
                    at: newer.latest.hour,
                }),
                candidate.definition.id,
            );
            const updated = purchase(refreshed.graph).alternative;
            expect(updated.sourcePreparation).toEqual(
                purchase(bound).alternative.sourcePreparation,
            );
            expect(updated.price).toMatchObject({ amount: 31, samples: 10, source: "market" });
            expect(decodeCohortPriceReference(updated.price!.cohortId)).toMatchObject({
                revision: "new-source-revision",
                sourcePreparation: profile,
            });
        } finally {
            lookup.mockRestore();
        }
    });

    it.each([
        "change",
        "remove",
    ])("preserves a saved quote and reports a %s of its intrinsic policy", async (edit) => {
        const { graph, candidate } = fixture();
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        const { alternative } = purchase(bound);
        if (alternative.sourcePreparation?.kind !== "fractured-fossil-v1")
            throw new Error("Expected fractured source profile.");
        if (edit === "remove") delete alternative.sourcePreparation;
        else alternative.sourcePreparation.crafted = false;
        const lookup = vi.spyOn(marketQueries, "findCraftingMarketPrices");
        try {
            const result = await refreshCraftingMarketPrices(
                createDbConnection("mysql://test:test@localhost/poe_test"),
                bound,
                engine,
            );
            expect(result.graph).toEqual(bound);
            expect(result.issues).toEqual([
                expect.stringContaining("different source preparation"),
            ]);
            expect(lookup).not.toHaveBeenCalled();
        } finally {
            lookup.mockRestore();
        }
    });

    it("keeps preparation when a source quote is replaced manually and skips market refresh", async () => {
        const { graph, candidate, profile } = fixture();
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        purchase(bound).alternative.price = quote(17);
        const lookup = vi.spyOn(marketQueries, "findCraftingMarketPrices");
        try {
            const result = await refreshCraftingMarketPrices(
                createDbConnection("mysql://test:test@localhost/poe_test"),
                bound,
                engine,
            );
            expect(result).toEqual({ graph: bound, issues: [] });
            expect(purchaseSourceProfile(purchase(result.graph).alternative)).toEqual(profile);
            expect(lookup).not.toHaveBeenCalled();
        } finally {
            lookup.mockRestore();
        }
    });

    it.each([
        "change",
        "remove",
        "override",
    ])("refuses direct calculation after a %s makes the saved source quote incompatible", (edit) => {
        const { graph, candidate } = fixture();
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        const { alternative } = purchase(bound);
        if (alternative.sourcePreparation?.kind !== "fractured-fossil-v1")
            throw new Error("Expected fractured source profile.");
        if (edit === "change") alternative.sourcePreparation.crafted = false;
        else if (edit === "remove") delete alternative.sourcePreparation;
        else {
            const other = fixture(false, true);
            const differentlyBound = bindCohortPurchasePrice(
                other.graph,
                engine,
                "base",
                "buy",
                other.candidate,
            );
            bound.prices["purchase:base:buy"] = purchase(differentlyBound).alternative.price!;
        }
        expect(
            () => new CraftingGraphSimulation(catalog, bound, { estimateIterations: 1 }),
        ).toThrow(/source preparation/i);
    });

    it("allows an explicit manual replacement while charging the revised preparation policy", () => {
        const { graph, candidate } = fixture();
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        const { alternative } = purchase(bound);
        if (alternative.sourcePreparation?.kind !== "fractured-fossil-v1")
            throw new Error("Expected fractured source profile.");
        alternative.sourcePreparation.crafted = false;
        bound.prices["purchase:base:buy"] = quote(17);
        for (const cost of sourcePreparationCosts(
            engine,
            alternative.sourcePreparation!,
            alternative.item,
        ))
            bound.prices[cost.id] = quote(2);
        const simulation = new CraftingGraphSimulation(catalog, bound, { estimateIterations: 1 });
        while (!simulation.done) simulation.runBatch();
        expect(simulation.result()).toMatchObject({
            complete: true,
            probability: 1,
            meanCost: 31,
            meanActions: 4,
            missingPrices: [],
            errors: {},
        });
    });

    it.each([
        [false, false],
        [true, false],
        [false, true],
        [true, true],
    ])("charges preparation separately from the source quote for crafted=%s/enchantment=%s", (crafted, enchanted) => {
        const { graph, candidate } = fixture(crafted, enchanted);
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        const { alternative } = purchase(bound);
        const costs = sourcePreparationCosts(
            engine,
            alternative.sourcePreparation!,
            alternative.item,
        );
        for (const cost of costs) bound.prices[cost.id] = quote(2);
        const simulation = new CraftingGraphSimulation(catalog, bound, { estimateIterations: 1 });
        while (!simulation.done) simulation.runBatch();
        const result = simulation.result();
        expect(result).toMatchObject({
            complete: true,
            trials: 1,
            probability: 1,
            meanCost: 28 + 2 * Number(crafted) + 6 * Number(enchanted),
            meanActions: 3 + Number(crafted) + Number(enchanted),
            errors: {},
            missingPrices: [],
        });
        expect(alternative.price?.amount).toBe(20);
        expect(livePurchasePrices(bound)).toHaveLength(1);
        expect(result.acquisitions.base?.alternatives[0]).toMatchObject({
            expectedCost: result.meanCost,
            expectedActions: result.meanActions,
        });
        const scour = currency("convert_to_normal").id;
        expect(
            costs.filter((cost) => cost.id === scour).reduce((sum, cost) => sum + cost.amount, 0),
        ).toBe(Number(crafted) + 3 * Number(enchanted));
    });

    it("does not treat a priced source as a complete acquisition when cleanup has no price", () => {
        const { graph, candidate } = fixture();
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        const { node, alternative } = purchase(bound);
        node.choice = { mode: "pinned", alternativeId: alternative.id };
        const scour = currency("convert_to_normal").id;
        for (const cost of sourcePreparationCosts(
            engine,
            alternative.sourcePreparation!,
            alternative.item,
        ))
            if (cost.id !== scour) bound.prices[cost.id] = quote(2);
        const simulation = new CraftingGraphSimulation(catalog, bound, { estimateIterations: 1 });
        while (!simulation.done) simulation.runBatch();
        const result = simulation.result();
        expect(result).toMatchObject({
            complete: true,
            probability: 1,
            meanCost: null,
            missingPrices: [scour],
            errors: {},
        });
        expect(result.acquisitions.base?.alternatives[0]).toMatchObject({
            expectedCost: null,
            missingPrices: [scour],
        });
        expect(alternative.price?.amount).toBe(20);
    });
});
