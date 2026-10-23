import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "~/db/client";
import { bindCraftingSourcePrice, liveSourcePrices } from "~/lib/crafting-sources";
import { isYellowBeastIdentity, yellowBeastPool } from "~/lib/crafting-yellow-beasts";
import identities from "~/lib/crafting-yellow-beasts.generated.json";
import { refreshCraftingMarketPrices } from "~/operations/crafting-market.server";
import { findCraftingSourcePrices } from "~/services/crafting-sources.server";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { engine } from "./crafting-fixtures";

const id = "EinharMasterCraft27";
const options = { ids: [id], realm: "pc" as const };
const species = [
    { detailsId: "mountain-lynx", name: "Mountain Lynx", unitPrice: 3, listingCount: 1 },
    { detailsId: "cave-beast", name: "Cave Beast", unitPrice: 7, listingCount: 3 },
];
const feedLines = [
    { detailsId: "craicic-croaker", name: "Craicic Croaker", chaosValue: 10, listingCount: 100 },
    ...species.map(({ unitPrice, ...entry }) => ({ ...entry, chaosValue: unitPrice })),
    {
        detailsId: "wild-bristle-matron",
        name: "Wild Bristle Matron",
        chaosValue: 9999,
        listingCount: 9999,
    },
    { detailsId: "unknown-beast", name: "Unknown Beast", chaosValue: 1, listingCount: 9999 },
];
const feed = (lines = feedLines) =>
    new Response(JSON.stringify({ lines }), { headers: { "Cache-Control": "max-age=0" } });
afterEach(() => {
    vi.unstubAllGlobals();
});

describe("generic yellow-beast prices", () => {
    it("retains a pinned derived allowlist with unique feed identities and disjoint exclusions", () => {
        expect(identities.build).toBe("3.29.3.3");
        expect(identities.names).toHaveLength(169);
        const ids = identities.names.map((name) =>
            name
                .toLowerCase()
                .replaceAll("'", "")
                .replace(/[^a-z0-9]+/g, "-"),
        );
        expect(new Set(ids).size).toBe(identities.names.length);
        expect(identities.names.some((name) => identities.excludedNames.includes(name))).toBe(
            false,
        );
        expect(
            identities.excludedNames.every(
                (name) =>
                    !isYellowBeastIdentity(
                        name
                            .toLowerCase()
                            .replaceAll("'", "")
                            .replace(/[^a-z0-9]+/g, "-"),
                        name,
                    ),
            ),
        ).toBe(true);
    });
    it.each([
        ["mountain-lynx", "Mountain Lynx"],
        ["cave-beast", "Cave Beast"],
        ["chimeric-croaker", "Chimeric Croaker"],
        ["plummeting-ursa", "Plummeting Ursa"],
        ["crustacean-sniper", "Crustacean Sniper"],
    ])("accepts the reviewed generic species %s", (detailsId, name) => {
        expect(isYellowBeastIdentity(detailsId, name)).toBe(true);
    });
    it.each([
        ["craicic-croaker", "Craicic Croaker"],
        ["farric-lynx-alpha", "Farric Lynx Alpha"],
        ["wild-bristle-matron", "Wild Bristle Matron"],
        ["primal-crushclaw", "Primal Crushclaw"],
        ["black-morrigan", "Black Mórrigan"],
        ["farrul-first-of-the-plains", "Farrul, First of the Plains"],
        ["the-great-white-beast", "The Great White Beast"],
        ["albino-rhoa", "Albino Rhoa"],
        ["carrion-minion", "Carrion Minion"],
        ["unknown-beast", "Unknown Beast"],
        ["craicic-croaker", "Mountain Lynx"],
    ])("excludes named, disabled, unknown or mismatched species %s", (detailsId, name) => {
        expect(isYellowBeastIdentity(detailsId, name)).toBe(false);
    });
    it("uses a listing-count-weighted mean, not a median or a seller count", () => {
        expect(yellowBeastPool(species)).toEqual({ unitPrice: 6, listingCount: 4 });
        expect(() => yellowBeastPool([...species, species[0]!])).toThrow("unambiguous");
        expect(() => yellowBeastPool([{ ...species[0]!, listingCount: 0 }])).toThrow("unpriced");
        expect(() => yellowBeastPool([{ ...species[0]!, unitPrice: 0 }])).toThrow("unpriced");
    });
    it("prices three generic sacrifices from the pool while keeping the named imprint beast separate", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(feed()));
        const graph = { ...exchangeGraph(), league: "yellow-pool" };
        const result = await findCraftingSourcePrices(graph, engine, options);
        expect(result.missing).toEqual({});
        const quote = result.quotes[id]!;
        expect(quote.amount).toBe(28);
        if (quote.source !== "poe.ninja") throw new Error("Expected beast source");
        expect(quote.components).toHaveLength(2);
        expect(quote.components[1]).toMatchObject({
            detailsId: "yellow-beast",
            name: "Yellow Beast",
            quantity: 3,
            unitPrice: 6,
            listingCount: 4,
            pool: { estimator: "listing-count-weighted-mean-v1", species },
        });
        const bound = bindCraftingSourcePrice(graph, engine, id, quote);
        expect(bound.prices[id]?.amount).toBe(28);
        expect(bound.prices[id]?.samples).toBeUndefined();
        expect(liveSourcePrices(bound)[0]?.reference).toMatchObject({
            yellowBeasts: "listing-count-weighted-mean-v1",
        });
        expect(() =>
            bindCraftingSourcePrice(graph, engine, id, {
                ...quote,
                components: quote.components.map((entry) =>
                    entry.pool ? { ...entry, unitPrice: 2 } : entry,
                ),
            }),
        ).toThrow("weighted");
        expect(() =>
            bindCraftingSourcePrice(graph, engine, id, {
                ...quote,
                components: quote.components.map((entry) =>
                    entry.pool
                        ? {
                              ...entry,
                              pool: {
                                  ...entry.pool,
                                  species: [
                                      {
                                          ...species[0]!,
                                          detailsId: "craicic-croaker",
                                          name: "Craicic Croaker",
                                      },
                                  ],
                              },
                          }
                        : entry,
                ),
            }),
        ).toThrow("unsupported");
        expect(() =>
            bindCraftingSourcePrice(graph, engine, id, { ...quote, yellowBeasts: undefined }),
        ).toThrow("policy");
    });
    it("refuses an empty or ambiguous pool rather than using a named proxy", async () => {
        for (const [index, lines] of [
            feedLines.filter((line) => !isYellowBeastIdentity(line.detailsId, line.name)),
            feedLines.map((line) =>
                isYellowBeastIdentity(line.detailsId, line.name)
                    ? { ...line, chaosValue: 0 }
                    : line,
            ),
            [...feedLines, feedLines[1]!],
        ].entries()) {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue(feed(lines)));
            const result = await findCraftingSourcePrices(
                { ...exchangeGraph(), league: `empty-yellow-${index}` },
                engine,
                options,
            );
            expect(result.quotes).toEqual({});
            expect(result.missing[id]).toContain("whole recipe remains unpriced");
        }
    });
    it("preserves a saved species-specific value and reports that explicit rebinding is needed", async () => {
        const fetcher = vi.fn();
        vi.stubGlobal("fetch", fetcher);
        const graph = exchangeGraph();
        graph.prices[id] = {
            amount: 369,
            currency: "chaos",
            source: "market",
            confidence: null,
            cohortId: `poeninja:v1:${encodeURIComponent(JSON.stringify({ source: "poe.ninja", game: "poe1", realm: "pc", league: graph.league, currency: "chaos", id, assumption: "rare-beast-mountain-lynx-v1" }))}`,
        };
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const result = await refreshCraftingMarketPrices(db, graph, engine);
        expect(result.graph).toEqual(graph);
        expect(result.issues.join(" ")).toContain("rebind");
        expect(fetcher).not.toHaveBeenCalled();
    });
    it("reports an unpriced current pool on refresh and does not replace it with stale or manual prices", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce(feed())
                .mockResolvedValueOnce(feed(feedLines.map((line) => ({ ...line, chaosValue: 0 })))),
        );
        const graph = { ...exchangeGraph(), league: "yellow-correction" };
        const first = await findCraftingSourcePrices(graph, engine, options);
        const bound = bindCraftingSourcePrice(graph, engine, id, first.quotes[id]!);
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const result = await refreshCraftingMarketPrices(db, bound, engine);
        expect(result.graph).toEqual(bound);
        expect(result.issues.join(" ")).toContain("unpriced");
        const manual = {
            ...bound,
            prices: {
                ...bound.prices,
                [id]: {
                    amount: 123,
                    currency: "chaos",
                    source: "manual" as const,
                    confidence: null,
                },
            },
        };
        expect((await refreshCraftingMarketPrices(db, manual, engine)).graph).toEqual(manual);
    });
});
