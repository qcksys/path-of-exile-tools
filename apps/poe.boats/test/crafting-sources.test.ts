import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createDbConnection } from "~/db/client";
import {
    bindCraftingSourcePrice,
    craftingSourceRecipe,
    liveSourcePrices,
} from "~/lib/crafting-sources";
import {
    craftingMarketSnapshots,
    refreshCraftingMarketPrices,
} from "~/operations/crafting-market.server";
import { findCraftingSourcePrices } from "~/services/crafting-sources.server";
import { exchangeGraph } from "./crafting-exchange-fixtures";
import { engine } from "./crafting-fixtures";

const id = "EinharMasterCraftMorrigan7";
const assumption = "rare-beast-mountain-lynx-v1" as const;
const options = { ids: [id], realm: "pc" as const, assumption };
const lines = [
    ["black-morrigan", 600],
    ["craicic-sand-spitter", 1],
    ["mountain-lynx", 3],
    ["craicic-croaker", 360],
    ["craicic-savage-crab", 1],
    ["saqawine-cobra", 1],
    ["locus-of-corruption-tier-3-temple", 1000],
].map(([detailsId, amount]) => ({
    detailsId,
    name: detailsId,
    chaosValue: amount,
    divineValue: Number(amount) / 360,
    exaltedValue: Number(amount) / 2,
    listingCount: 100,
}));
const feed = (data = lines) =>
    new Response(JSON.stringify({ lines: data }), {
        headers: { "Cache-Control": "public, max-age=1800", etag: '"sample"' },
    });
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("supplemental crafting prices", () => {
    it("prices all four beasts, uses the current imprint identity, and binds a complete recipe", async () => {
        const fetcher = vi.fn().mockResolvedValue(feed());
        vi.stubGlobal("fetch", fetcher);
        const graph = { ...exchangeGraph(), league: "whole-recipe" };
        const result = await findCraftingSourcePrices(graph, engine, {
            ...options,
            ids: [id, "EinharMasterCraft27", "EinharMasterCraft49"],
        });
        expect(result.missing).toEqual({});
        expect(result.quotes[id]?.amount).toBe(607);
        expect(result.quotes[id]?.components.map(({ quantity }) => quantity)).toEqual([1, 1, 2]);
        expect(result.quotes.EinharMasterCraft27?.amount).toBe(369);
        expect(result.quotes.EinharMasterCraft49?.amount).toBe(8);
        expect(fetcher).toHaveBeenCalledTimes(1);
        const bound = bindCraftingSourcePrice(graph, engine, id, result.quotes[id]!);
        expect(bound.prices[id]).toMatchObject({ amount: 607, source: "market", confidence: null });
        expect(liveSourcePrices(bound)[0]?.reference.assumption).toBe(assumption);
        for (const wrong of [
            { league: "Other" },
            { currency: "divine" },
            { game: "poe2" as const },
        ])
            expect(() =>
                bindCraftingSourcePrice({ ...graph, ...wrong }, engine, id, result.quotes[id]!),
            ).toThrow("does not match");
        expect(() =>
            bindCraftingSourcePrice(graph, engine, id, {
                ...result.quotes[id]!,
                components: result.quotes[id]!.components.slice(0, 2),
            }),
        ).toThrow("every component");
    });
    it("refuses missing assumptions, level-sensitive beasts, other platforms and non-tradeable services without fetching", async () => {
        const fetcher = vi.fn();
        vi.stubGlobal("fetch", fetcher);
        const graph = exchangeGraph();
        const result = await findCraftingSourcePrices(graph, engine, {
            ...options,
            assumption: undefined,
            ids: [id, "EinharMasterCraft30", "service:recombine"],
        });
        expect(result.quotes).toEqual({});
        expect(result.missing[id]).toContain("Mountain Lynx");
        expect(result.missing.EinharMasterCraft30).toContain("level");
        expect(result.missing["service:recombine"]).toContain("non-tradeable");
        expect(
            (await findCraftingSourcePrices(graph, engine, { ...options, realm: "xbox" })).quotes,
        ).toEqual({});
        expect(fetcher).not.toHaveBeenCalled();
    });
    it("accepts a chaos quote when the feed omits the rounded divine value", async () => {
        const data = lines.map(({ divineValue: _, ...line }) => line);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(new Response(JSON.stringify({ lines: data }))),
        );
        const graph = { ...exchangeGraph(), league: "omitted-currency" };
        expect((await findCraftingSourcePrices(graph, engine, options)).quotes[id]?.amount).toBe(
            607,
        );
        const divine = await findCraftingSourcePrices(
            { ...graph, currency: "divine" },
            engine,
            options,
        );
        expect(divine.quotes).toEqual({});
        expect(divine.missing[id]).toContain("No positive divine");
    });
    it("keeps the whole recipe unknown when any required component is absent, ambiguous or zero", async () => {
        for (const [index, data] of [
            lines.slice(0, 2),
            [...lines, lines[0]!],
            lines.map((line) => ({ ...line, chaosValue: 0 })),
        ].entries()) {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue(feed(data)));
            const result = await findCraftingSourcePrices(
                { ...exchangeGraph(), league: `missing-${index}` },
                engine,
                options,
            );
            expect(result.quotes).toEqual({});
            expect(result.missing[id]).toContain("whole recipe remains unpriced");
        }
    });
    it("honors source cache lifetimes and ETags, and reports expired-source failures instead of stale quotes", async () => {
        vi.useFakeTimers();
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(feed())
            .mockResolvedValueOnce(
                new Response(null, { status: 304, headers: { "Cache-Control": "max-age=1800" } }),
            )
            .mockResolvedValueOnce(new Response(null, { status: 503 }));
        vi.stubGlobal("fetch", fetcher);
        const graph = { ...exchangeGraph(), league: "cache-scope" };
        const first = await findCraftingSourcePrices(graph, engine, options);
        expect(await findCraftingSourcePrices(graph, engine, options)).toEqual(first);
        expect(fetcher).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1800_001);
        expect(await findCraftingSourcePrices(graph, engine, options)).toEqual(first);
        expect(fetcher.mock.calls[1]![1].headers.get("If-None-Match")).toBe('"sample"');
        vi.advanceTimersByTime(1800_001);
        const unavailable = await findCraftingSourcePrices(graph, engine, options);
        expect(unavailable.quotes).toEqual({});
        expect(unavailable.missing[id]).toContain("503");
    });
    it("prices only the exact single Locus room and never uses today's source for history", async () => {
        const fetcher = vi.fn().mockResolvedValue(feed());
        vi.stubGlobal("fetch", fetcher);
        const graph = { ...exchangeGraph(), league: "temple-scope" };
        const templeId = engine.catalog.crafting.locus!.id;
        const result = await findCraftingSourcePrices(graph, engine, {
            ids: [templeId],
            realm: "pc",
        });
        const bound = bindCraftingSourcePrice(graph, engine, templeId, result.quotes[templeId]!);
        expect(bound.prices[templeId]?.amount).toBe(1000);
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
        expect(refreshed.issues).toEqual([]);
        const historical = await craftingMarketSnapshots(db, bound, engine, [1791428400]);
        expect(historical.points[0]?.graph).toBeNull();
        expect(historical.points[0]?.issues[0]).toContain("no captured historical source");
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(craftingSourceRecipe(engine, templeId).components).toEqual([
            { detailsId: "locus-of-corruption-tier-3-temple", quantity: 1 },
        ]);
    });
    it("does not edit the graph when a later source response has the same price", async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() => Promise.resolve(feed())),
        );
        const graph = { ...exchangeGraph(), league: "stable-refresh" };
        const result = await findCraftingSourcePrices(graph, engine, options);
        const bound = bindCraftingSourcePrice(graph, engine, id, result.quotes[id]!);
        vi.advanceTimersByTime(1800_001);
        const db = createDbConnection("mysql://test:test@localhost/poe_test");
        const refreshed = await refreshCraftingMarketPrices(db, bound, engine);
        expect(refreshed.issues).toEqual([]);
        expect(refreshed.graph).toEqual(bound);
    });
});
