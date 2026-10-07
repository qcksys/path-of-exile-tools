import { itemQuerySchema } from "@poe-tools/item-query";
import { cohortPriceCoverage, decodeCohortPriceReference } from "@poe-tools/market";
import { describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "../app/db/client";
import * as marketQueries from "../app/db/queries/crafting-market.queries";
import { createCraftingItemQuery } from "../app/lib/crafting-item-query";
import {
    bindCohortPurchasePrice,
    latestCompatibleCohort,
    livePurchasePrices,
} from "../app/lib/crafting-market";
import {
    craftingMarketSnapshots,
    refreshCraftingMarketPrices,
} from "../app/operations/crafting-market.server";
import { engine } from "./crafting-fixtures";
import { firstItem, firstMod, graphFixture, secondMod } from "./crafting-graph-fixtures";
import { historyIndex, retainedRevision } from "./crafting-history-fixtures";
import {
    adaptiveMarketCandidate,
    donorFamilyMarketFixture,
    marketCandidate,
    marketGraph,
} from "./crafting-market-fixtures";

describe("crafting market price bindings", () => {
    it("uses a retained definition to recover older observations after a live revision change", async () => {
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const { graph, candidate: original } = donorFamilyMarketFixture();
        original.assumption = "display-equivalent-v1";
        const current = structuredClone(original);
        current.definition.revision = "current";
        current.latest.revision = "current";
        current.latest.hour += 3600;
        current.latest.prices.chaos!.median = 27;
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", current);
        const lookup = vi
            .spyOn(marketQueries, "findCraftingMarketPrices")
            .mockResolvedValue({ candidates: [original], truncated: false, message: null });
        const definition = vi
            .spyOn(marketQueries, "craftingMarketDefinition")
            .mockResolvedValue(current.definition);
        try {
            const snapshots = await craftingMarketSnapshots(db, bound, engine, [
                original.latest.hour,
            ]);
            expect(snapshots.points[0]?.issues).toEqual([]);
            expect(livePurchasePrices(snapshots.points[0]!.graph!)[0]).toMatchObject({
                reference: { revision: "test-market", assumption: "display-equivalent-v1" },
                alternative: { price: { amount: 20 } },
            });
            expect(definition).toHaveBeenCalledWith(db, original.definition.id, "current");
            expect(lookup.mock.calls[0]?.[2]).toBe(original.definition.id);
            expect(livePurchasePrices(bound)[0]?.alternative.price?.amount).toBe(27);
            expect(snapshots.points[0]!.graph!.ruleset).toEqual(bound.ruleset);
        } finally {
            lookup.mockRestore();
            definition.mockRestore();
        }
    });
    it("does not cross incompatible definitions or substitute an older usable price for a newer empty one", async () => {
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const graph = bindCohortPurchasePrice(
            marketGraph(),
            engine,
            "base",
            "buy",
            marketCandidate,
        );
        const candidate = structuredClone(marketCandidate);
        candidate.definition.revision = "next";
        candidate.latest.revision = "next";
        candidate.latest.hour += 3600;
        const lookup = vi.spyOn(marketQueries, "findCraftingMarketPrices");
        const definition = vi
            .spyOn(marketQueries, "craftingMarketDefinition")
            .mockResolvedValue(marketCandidate.definition);
        try {
            for (const change of [
                "purpose",
                "query",
                "missing-definition",
                "empty-price",
                "truncated",
            ] as const) {
                const next = structuredClone(candidate);
                if (change === "purpose") next.definition.purpose = "transfer-donor";
                if (change === "query")
                    next.definition.query.groups[0]!.filters.push({
                        kind: "range",
                        field: "ilvl",
                        value: { min: 84 },
                    });
                if (change === "empty-price") {
                    next.latest.prices = {};
                    next.covered = false;
                    next.reasons = ["No asking price in chaos is available."];
                }
                definition.mockResolvedValue(
                    change === "missing-definition" ? null : marketCandidate.definition,
                );
                lookup.mockResolvedValue({
                    candidates: change === "empty-price" ? [marketCandidate, next] : [next],
                    truncated: change === "truncated",
                    message: null,
                });
                const result = await refreshCraftingMarketPrices(db, graph, engine);
                expect(result.issues, change).toHaveLength(1);
                expect(result.graph, change).toEqual(graph);
            }
        } finally {
            lookup.mockRestore();
            definition.mockRestore();
        }
    });
    it("orders compatible observations by hour, source time and then the saved revision", () => {
        const candidate = structuredClone(marketCandidate);
        candidate.definition.revision = "next";
        candidate.latest.revision = "next";
        expect(
            latestCompatibleCohort([candidate, marketCandidate], marketCandidate.definition),
        ).toBe(marketCandidate);
        candidate.latest.lastSeenAt = "2026-10-01T00:30:00Z";
        expect(
            latestCompatibleCohort([marketCandidate, candidate], marketCandidate.definition),
        ).toBe(candidate);
        candidate.latest.hour -= 3600;
        expect(
            latestCompatibleCohort([candidate, marketCandidate], marketCandidate.definition),
        ).toBe(marketCandidate);
    });
    it("refreshes a saved purchase from a newer compatible cohort revision", async () => {
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const original = adaptiveMarketCandidate();
        const candidate = adaptiveMarketCandidate(27);
        candidate.definition.revision = "next-market";
        candidate.latest.revision = "next-market";
        candidate.latest.hour += 3600;
        const graph = bindCohortPurchasePrice(marketGraph(), engine, "base", "buy", original);
        const lookup = vi.spyOn(marketQueries, "findCraftingMarketPrices").mockResolvedValue({
            candidates: [original, candidate],
            truncated: false,
            message: null,
        });
        try {
            const refreshed = await refreshCraftingMarketPrices(db, graph, engine);
            expect(refreshed.issues).toEqual([]);
            expect(livePurchasePrices(refreshed.graph)[0]).toMatchObject({
                reference: { revision: "next-market", window: "adaptive-v1" },
                alternative: { price: { amount: 27 } },
            });
            expect(refreshed.graph.ruleset).toEqual(graph.ruleset);
            expect(livePurchasePrices(graph)[0]?.reference.revision).toBe("test-market");
        } finally {
            lookup.mockRestore();
        }
    });
    it("requires and retains the representative assumption through refresh and historical snapshots", async () => {
        const { graph, candidate } = donorFamilyMarketFixture();
        expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", candidate)).toThrow(
            "explicit modifier",
        );
        candidate.assumption = "display-equivalent-v1";
        const bound = bindCohortPurchasePrice(graph, engine, "base", "buy", candidate);
        expect(livePurchasePrices(bound)[0]?.reference.assumption).toBe("display-equivalent-v1");
        candidate.latest.prices.chaos!.median = 27;
        const lookup = vi
            .spyOn(marketQueries, "findCraftingMarketPrices")
            .mockResolvedValue({ candidates: [candidate], truncated: false, message: null });
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        try {
            const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
            expect(refreshed.issues).toEqual([]);
            const snapshots = await craftingMarketSnapshots(db, bound, engine, [
                candidate.latest.hour,
            ]);
            expect(snapshots.points[0]?.issues).toEqual([]);
            for (const next of [refreshed.graph, snapshots.points[0]!.graph!]) {
                expect(livePurchasePrices(next)[0]).toMatchObject({
                    reference: { assumption: "display-equivalent-v1" },
                    alternative: { price: { amount: 27 } },
                });
            }
            for (const [, input] of lookup.mock.calls)
                expect(input.assumption).toBe("display-equivalent-v1");
            expect(livePurchasePrices(bound)[0]?.alternative.price?.amount).toBe(20);
        } finally {
            lookup.mockRestore();
        }
    });
    it("does not let a representative assumption bypass eligibility or unrelated requirements", () => {
        const { graph, candidate } = donorFamilyMarketFixture();
        candidate.assumption = "display-equivalent-v1";
        for (const [replacement, message] of [
            ["missing-modifier", "absent from this crafting revision"],
            [firstMod, "not display-equivalent"],
        ]) {
            const changed = structuredClone(candidate);
            const mod = changed.definition.query.groups[0]!.filters.find(
                (filter) => filter.kind === "mod",
            )!;
            if (mod.kind !== "mod") throw new Error("Fixture");
            mod.ids![1] = replacement!;
            expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", changed)).toThrow(
                message,
            );
        }
        expect(() =>
            bindCohortPurchasePrice(marketGraph(), engine, "base", "buy", {
                ...marketCandidate,
                assumption: "display-equivalent-v1",
            }),
        ).toThrow("requires a display-equivalent donor family");
        const node = graph.nodes[0]!;
        node.output.groups.push({
            type: "and",
            filters: [{ kind: "range", field: "links", value: { min: 4 } }],
        });
        expect(() => bindCohortPurchasePrice(graph, engine, "base", "buy", candidate)).toThrow(
            "output requirement",
        );
        expect(
            decodeCohortPriceReference(
                livePurchasePrices(
                    bindCohortPurchasePrice(marketGraph(), engine, "base", "buy", marketCandidate),
                )[0]!.alternative.price!.cohortId,
            )?.assumption,
        ).toBeUndefined();
    });
    it("binds the selected window and preserves it through live and historical refresh", async () => {
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const candidate = adaptiveMarketCandidate();
        const graph = bindCohortPurchasePrice(marketGraph(), engine, "base", "buy", candidate);
        expect(livePurchasePrices(graph)[0]).toMatchObject({
            reference: { window: "adaptive-v1" },
            alternative: { price: { amount: 21, samples: 12 } },
        });
        const lookup = vi.spyOn(marketQueries, "findCraftingMarketPrices").mockResolvedValue({
            candidates: [adaptiveMarketCandidate(22)],
            truncated: false,
            message: null,
        });
        try {
            const { graph: refreshed, issues } = await refreshCraftingMarketPrices(
                db,
                graph,
                engine,
            );
            expect(issues).toEqual([]);
            expect(livePurchasePrices(refreshed)[0]).toMatchObject({
                reference: { window: "adaptive-v1" },
                alternative: { price: { amount: 22 } },
            });
            const history = await craftingMarketSnapshots(db, graph, engine, [
                candidate.latest.hour,
            ]);
            expect(
                livePurchasePrices(history.points[0]!.graph!)[0]?.alternative.price?.amount,
            ).toBe(22);
            for (const [, input] of lookup.mock.calls) expect(input.window).toBe("adaptive-v1");
            expect(livePurchasePrices(graph)[0]?.alternative.price?.amount).toBe(21);
        } finally {
            lookup.mockRestore();
        }
    });
    it("reprices ordered historical snapshots without leaking future quotes into gaps or mutating the live draft", async () => {
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const graph = bindCohortPurchasePrice(
            marketGraph(),
            engine,
            "base",
            "buy",
            marketCandidate,
        );
        const node = graph.nodes[0]!;
        if (node.kind !== "acquire") throw new Error("Fixture");
        node.choice = { mode: "pinned", alternativeId: "buy" };
        graph.prices.assumed = { amount: 7, currency: "chaos", source: "manual", confidence: null };
        const before = structuredClone(graph);
        const hour = marketCandidate.latest.hour;
        const lookup = vi
            .spyOn(marketQueries, "findCraftingMarketPrices")
            .mockImplementation(async (_db, input) => ({
                candidates:
                    input.at! < hour
                        ? []
                        : [
                              {
                                  ...marketCandidate,
                                  latest: {
                                      ...marketCandidate.latest,
                                      hour: input.at!,
                                      prices: {
                                          chaos: {
                                              ...marketCandidate.latest.prices.chaos!,
                                              median: input.at === hour ? 30 : 10,
                                          },
                                      },
                                  },
                              },
                          ],
                truncated: false,
                message: null,
            }));
        try {
            const result = await craftingMarketSnapshots(db, graph, engine, [
                hour + 3600,
                hour - 3600,
                hour,
                hour,
            ]);
            expect(result.points.map((point) => point.at)).toEqual([
                hour - 3600,
                hour,
                hour + 3600,
            ]);
            expect(result.points[0]).toMatchObject({
                graph: null,
                issues: [expect.stringContaining("no usable price")],
            });
            for (const [point, expected] of [
                [result.points[1]!, 30],
                [result.points[2]!, 10],
            ] as const) {
                expect(livePurchasePrices(point.graph!)[0]?.alternative.price?.amount).toBe(
                    expected,
                );
                expect(point.graph!.nodes[0]).toMatchObject({ choice: node.choice });
                expect(point.graph!.ruleset).toEqual(graph.ruleset);
                expect(point.graph!.prices.assumed).toEqual(graph.prices.assumed);
            }
            expect(graph).toEqual(before);
            expect(lookup).toHaveBeenCalledTimes(3);
            const unbound = await craftingMarketSnapshots(
                db,
                {
                    ...graph,
                    prices: {
                        stale: {
                            amount: 100,
                            currency: "chaos",
                            source: "market",
                            confidence: null,
                        },
                    },
                },
                engine,
                [hour],
            );
            expect(unbound.points[0]).toMatchObject({
                graph: null,
                issues: [expect.stringContaining("no supported historical binding")],
            });
            const sale = graphFixture();
            const craft = sale.nodes.find((node) => node.kind === "craft")!;
            craft.fallback = {
                kind: "sell",
                price: { amount: 100, currency: "chaos", source: "market", confidence: null },
            };
            const saleHistory = await craftingMarketSnapshots(db, sale, engine, [hour]);
            expect(saleHistory.points[0]).toMatchObject({
                graph: null,
                issues: [expect.stringContaining(`sale:${craft.id}:fallback`)],
            });
            expect(lookup).toHaveBeenCalledTimes(3);
        } finally {
            lookup.mockRestore();
        }
    });
    it("retains provenance without changing acquisition pinning or historical-engine compatibility", async () => {
        const graph = marketGraph();
        const next = bindCohortPurchasePrice(graph, engine, "base", "buy", marketCandidate);
        const [binding] = livePurchasePrices(next);
        expect(binding?.reference).toMatchObject({
            realm: "pc",
            league: "Standard",
            revision: "test-market",
            cohortId: marketCandidate.definition.id,
        });
        expect(binding?.alternative.price).toMatchObject({
            amount: 20,
            source: "market",
            samples: 10,
            confidence: 0.5,
        });
        expect(binding?.node.choice).toEqual({ mode: "automatic" });
        expect(graph.nodes[0]).not.toEqual(next.nodes[0]);
        const retained = await retainedRevision(
            historyIndex.revisions.find(
                (revision) =>
                    revision.game === "poe1" && revision.revision === next.ruleset.revision,
            )!,
        );
        const simulation = retained.runtime.createSimulation(retained.catalog, next, {
            estimateIterations: 3,
            workLimit: 10000,
        });
        while (!simulation.done) simulation.runBatch();
        expect(simulation.result().meanCost).toBe(20);
    });
    it("refuses uncovered item modifiers, tier requirements, slots, and another league or currency", () => {
        const graph = marketGraph();
        const node = graph.nodes[0]!;
        if (node.kind !== "acquire") throw new Error("Fixture");
        node.alternatives[0] = {
            ...node.alternatives[0]!,
            kind: "purchase",
            id: "buy",
            name: "Buy",
            item: firstItem,
            price: null,
        };
        expect(() =>
            bindCohortPurchasePrice(graph, engine, "base", "buy", marketCandidate),
        ).toThrow("explicit modifier");
        for (const condition of [
            { kind: "mod", ids: [firstMod], tier: { min: 1, max: 1 } },
            { kind: "range", field: "openPrefixes", value: { min: 1 } },
        ]) {
            const next = marketGraph();
            next.nodes[0]!.output = itemQuerySchema.parse({
                game: "poe1",
                groups: [{ type: "and", filters: [condition] }],
            });
            expect(() =>
                bindCohortPurchasePrice(next, engine, "base", "buy", marketCandidate),
            ).toThrow("output requirement");
        }
        expect(() =>
            bindCohortPurchasePrice(
                { ...marketGraph(), league: "Other" },
                engine,
                "base",
                "buy",
                marketCandidate,
            ),
        ).toThrow("league");
        expect(() =>
            bindCohortPurchasePrice(
                { ...marketGraph(), currency: "divine" },
                engine,
                "base",
                "buy",
                marketCandidate,
            ),
        ).toThrow("divine");
    });
    it("checks cohort ranges and logical coverage, retaining unknowns", () => {
        const graph = marketGraph();
        const node = graph.nodes[0]!;
        if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
            throw new Error("Fixture");
        const item = createCraftingItemQuery(engine).record(node.alternatives[0].item);
        for (const [min, covered] of [
            [84, true],
            [90, false],
        ] as const) {
            const query = itemQuerySchema.parse({
                game: "poe1",
                groups: [
                    { type: "and", filters: [{ kind: "range", field: "ilvl", value: { min } }] },
                ],
            });
            expect(cohortPriceCoverage(marketCandidate.definition, item, query).covered).toBe(
                covered,
            );
        }
        const unknown = { ...item, facts: { ...item.facts, modifiersComplete: false } };
        expect(cohortPriceCoverage(marketCandidate.definition, unknown, node.output).covered).toBe(
            false,
        );
        const linked = {
            ...item,
            facts: { ...item.facts, socketCount: 6, linkedSockets: { min: 6, max: 6 } },
        };
        expect(cohortPriceCoverage(marketCandidate.definition, linked, node.output).covered).toBe(
            false,
        );
        const sixLink = structuredClone(marketCandidate.definition);
        sixLink.query.groups.push({
            type: "and",
            filters: [{ kind: "range", field: "links", value: { min: 6 } }],
        });
        expect(cohortPriceCoverage(sixLink, linked, node.output).covered).toBe(true);
        const modifierCohort = structuredClone(marketCandidate.definition);
        modifierCohort.query.groups.push({
            type: "and",
            filters: [{ kind: "mod", ids: [firstMod], count: { min: 1, max: 1 } }],
        });
        const broaderCount = itemQuerySchema.parse({
            game: "poe1",
            groups: [
                {
                    type: "and",
                    filters: [{ kind: "mod", ids: [firstMod, secondMod], count: { max: 1 } }],
                },
            ],
        });
        expect(
            cohortPriceCoverage(
                modifierCohort,
                createCraftingItemQuery(engine).record(firstItem),
                broaderCount,
            ).reasons,
        ).toContain("The cohort does not guarantee every output requirement.");
    });
    it("requires manual pricing for prepared properties absent from equipment cohorts", () => {
        const graph = marketGraph();
        const node = graph.nodes[0]!;
        if (node.kind !== "acquire" || node.alternatives[0]?.kind !== "purchase")
            throw new Error("Fixture");
        node.alternatives[0].item.quality = 20;
        expect(() =>
            bindCohortPurchasePrice(graph, engine, node.id, "buy", marketCandidate),
        ).toThrow("prepared state (quality)");
        node.alternatives[0].item.quality = 0;
        node.alternatives[0].item.enchantments = [{ ...firstItem.mods[0]! }];
        expect(() =>
            bindCohortPurchasePrice(graph, engine, node.id, "buy", marketCandidate),
        ).toThrow("prepared state (enchantments)");
    });
    it("refreshes bound quotes, preserves manual overrides, and reports missing quotes without pretending the cached price is current", async () => {
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const graph = bindCohortPurchasePrice(
            marketGraph(),
            engine,
            "base",
            "buy",
            marketCandidate,
        );
        const candidate = structuredClone(marketCandidate);
        candidate.latest.prices.chaos!.median = 25;
        const lookup = vi
            .spyOn(marketQueries, "findCraftingMarketPrices")
            .mockResolvedValue({ candidates: [candidate], truncated: false, message: null });
        try {
            const refreshed = await refreshCraftingMarketPrices(db, graph, engine);
            expect(livePurchasePrices(refreshed.graph)[0]?.alternative.price?.amount).toBe(25);
            expect(refreshed.issues).toEqual([]);
            const manual = {
                ...graph,
                prices: {
                    "purchase:base:buy": {
                        amount: 5,
                        currency: "chaos",
                        source: "manual" as const,
                        confidence: null,
                    },
                },
            };
            expect((await refreshCraftingMarketPrices(db, manual, engine)).graph).toEqual(manual);
            expect(lookup).toHaveBeenCalledTimes(1);
            lookup.mockResolvedValue({ candidates: [], truncated: false, message: null });
            const missing = await refreshCraftingMarketPrices(db, graph, engine);
            expect(missing.issues).toHaveLength(1);
            expect(missing.graph).toEqual(graph);
        } finally {
            lookup.mockRestore();
        }
        expect(decodeCohortPriceReference("broken")).toBeNull();
    });
});
