import type { ListingBatch, PageMessage, TradeListing } from "@poe-tools/trade-bridge";
import { describe, expect, it, vi } from "vite-plus/test";
import { buyInStageKey, buyInStages, buyInTradeSearches } from "../app/lib/crafting-buy-in";
import { priceBuyInStage } from "../app/lib/crafting-buy-in-price";
import {
    type BuyInRunState,
    createBuyInRun,
    fetchListingRates,
    stagesToSearch,
} from "../app/lib/crafting-buy-in-run";
import { loadCraftingTradeMetadata } from "../app/lib/crafting-trade";
import type { CraftingGraph } from "../app/schemas/crafting-graph";
import { catalog, engine } from "./crafting-fixtures";
import { graphFixture } from "./crafting-graph-fixtures";

const both = {
    rarity: "Rare",
    name: "Doom Bane",
    typeLine: "Plate Vest",
    baseType: "Plate Vest",
    ilvl: 86,
    identified: true,
    explicitMods: ["+7 to maximum Life", "23% increased Armour"],
};
const lifeOnly = { ...both, explicitMods: ["+7 to maximum Life"] };
const listing = (
    item: Record<string, unknown>,
    amount: number,
    currency = "chaos",
): TradeListing => ({
    id: `${amount}-${currency}-${item.explicitMods}`.replace(/\W/g, ""),
    indexed: null,
    price: { amount, currency },
    sale: "instant",
    item,
});

async function setup(graph: CraftingGraph = { ...graphFixture(), league: "Standard" }) {
    let current = graph;
    const sent: PageMessage[] = [];
    const states: BuyInRunState[] = [];
    const rates = vi.fn(async (currencies: string[]) =>
        Object.fromEntries(
            currencies.map((currency) => [currency, currency === "divine" ? 150 : 1]),
        ),
    );
    const run = createBuyInRun({
        send: (message) => sent.push(message),
        graph: () => current,
        save: (next) => {
            current = next;
        },
        rates,
        price: async (...args) => priceBuyInStage(engine, ...args),
        onState: (state) => states.push(state),
        id: () => "run-1",
    });
    const searches = buyInTradeSearches(current, catalog, await loadCraftingTradeMetadata("poe1"));
    return { run, sent, states, rates, searches, graph: () => current };
}

const batch = (graph: CraftingGraph, extra: Partial<ListingBatch>): ListingBatch => ({
    runId: "run-1",
    graphId: graph.id,
    batchId: "batch-1",
    stageId: "combine",
    stageKey: buyInStageKey(graph, buyInStages(graph)[0]!),
    fetches: 1,
    sale: "instant",
    total: 40,
    available: 40,
    listings: [],
    receivedAt: "2026-10-27T10:00:00.000Z",
    ...extra,
});

describe("buy-in pricing run", () => {
    it("starts a run with each stage's instant-buyout search and stage key", async () => {
        const { run, sent, searches, graph } = await setup();
        run.start(searches);
        expect(sent).toEqual([
            {
                kind: "startRun",
                runId: "run-1",
                graphId: graph().id,
                game: "poe1",
                league: "Standard",
                stages: [
                    {
                        stageId: "combine",
                        stageKey: buyInStageKey(graph(), buyInStages(graph())[0]!),
                        name: "Combine donors",
                        instant: searches[0]!.instant!.payload,
                    },
                ],
            },
        ]);
    });

    it("asks for more listings when none match, then saves the cheapest match", async () => {
        const { run, sent, graph, searches, rates } = await setup();
        run.start(searches);
        await run.handle({
            kind: "batch",
            ...batch(graph(), { listings: [listing(lifeOnly, 1)] }),
        });
        expect(sent.at(-1)).toEqual({
            kind: "decide",
            runId: "run-1",
            batchId: "batch-1",
            decision: "more",
        });
        expect(graph().buyIn).toBeUndefined();
        await run.handle({
            kind: "batch",
            ...batch(graph(), {
                batchId: "batch-2",
                fetches: 2,
                listings: [listing(both, 2, "divine"), listing(both, 400)],
                receivedAt: "2026-10-27T10:01:00.000Z",
            }),
        });
        expect(sent.at(-1)).toMatchObject({ batchId: "batch-2", decision: "done" });
        expect(graph().buyIn?.stages.combine).toMatchObject({
            observedAt: "2026-10-27T10:01:00.000Z",
            price: { amount: 300, currency: "chaos" },
            counts: { fetched: 3, matching: 2, notMatching: 1 },
        });
        expect(rates).toHaveBeenCalledTimes(2);
        await run.handle({
            kind: "runFinished",
            runId: "run-1",
            graphId: graph().id,
            outcome: "done",
        });
        expect(run.state?.finished).toEqual({ outcome: "done" });
        expect(run.state?.stages[0]?.step).toBe("priced");
    });

    it("records stages with no matching listings without a price", async () => {
        const { run, graph, searches } = await setup();
        run.start(searches);
        await run.handle({
            kind: "batch",
            ...batch(graph(), { total: 1, available: 1, listings: [listing(lifeOnly, 1)] }),
        });
        expect(graph().buyIn?.stages.combine).toMatchObject({ status: "no-listings", price: null });
        expect(run.state?.stages[0]?.step).toBe("no-listings");
    });

    it("marks unfinished stages when the extension stops a run", async () => {
        const { run, graph, searches } = await setup();
        run.start(searches);
        await run.handle({
            kind: "runFinished",
            runId: "run-1",
            graphId: graph().id,
            outcome: "stopped",
            reason: "Sign in on pathofexile.com, then try again.",
            signIn: true,
        });
        expect(run.state?.stages[0]).toMatchObject({
            step: "failed",
            message: "Sign in on pathofexile.com, then try again.",
        });
    });

    it("ends a run the extension stops reporting on, allowing for announced waits", async () => {
        const { run, sent, graph, searches } = await setup();
        const started = Date.now();
        run.start(searches);
        expect(run.checkStalled(started + 60_000)).toBe(false);
        await run.handle({
            kind: "progress",
            runId: "run-1",
            stageId: "combine",
            step: "waiting",
            sale: "instant",
            waitUntil: new Date(started + 600_000).toISOString(),
        });
        expect(run.checkStalled(started + 300_000)).toBe(false);
        expect(run.checkStalled(started + 600_000 + 121_000)).toBe(true);
        await run.handle({
            kind: "progress",
            runId: "x",
            stageId: "combine",
            step: "searching",
            sale: "instant",
        });
        expect(run.state?.finished).toMatchObject({ outcome: "stopped" });
        expect(sent.at(-1)).toEqual({ kind: "cancelRun", runId: "run-1" });
        expect(graph().buyIn).toBeUndefined();
    });

    it("ignores messages from other runs", async () => {
        const { run, sent, graph, searches } = await setup();
        run.start(searches);
        await run.handle({ kind: "batch", ...batch(graph(), { runId: "other" }) });
        expect(sent).toHaveLength(1);
    });

    it("applies stored listings only to stages whose query is unchanged", async () => {
        const { run, sent, graph } = await setup();
        await run.handle({
            kind: "stored",
            graphId: graph().id,
            batches: [
                batch(graph(), {
                    batchId: "old",
                    stageKey: "v1:changed",
                    listings: [listing(both, 1)],
                }),
                batch(graph(), {
                    batchId: "kept",
                    total: 1,
                    available: 1,
                    listings: [listing(both, 7)],
                }),
            ],
        });
        expect(graph().buyIn?.stages.combine?.price?.amount).toBe(7);
        expect(sent.at(-1)).toEqual({
            kind: "acknowledge",
            graphId: graph().id,
            batchIds: ["old", "kept"],
        });
    });

    it("skips stages with a fresh price unless refreshing all", async () => {
        const { run, graph, searches } = await setup();
        run.start(searches);
        await run.handle({
            kind: "batch",
            ...batch(graph(), { total: 1, available: 1, listings: [listing(both, 7)] }),
        });
        const pricedAt = Date.parse("2026-10-27T10:00:00.000Z");
        expect(stagesToSearch(graph(), searches, false, pricedAt + 3_600_000)).toEqual([]);
        expect(stagesToSearch(graph(), searches, true, pricedAt + 3_600_000)).toHaveLength(1);
        expect(stagesToSearch(graph(), searches, false, pricedAt + 7 * 3_600_000)).toHaveLength(1);
    });
});

describe("listing currency rates", () => {
    it("uses 1 for the project currency and exchange quotes for others", async () => {
        const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body));
            expect(body).toMatchObject({
                game: "poe1",
                realm: "pc",
                league: "Standard",
                currency: "chaos",
                conversion: "two-leg-exchange-v1",
            });
            return new Response(
                JSON.stringify({
                    quotes: {
                        [body.itemIds[0]]: {
                            realm: "pc",
                            league: "Standard",
                            itemId: body.itemIds[0],
                            quoteId: "Metadata/Items/Currency/CurrencyRerollRare",
                            hour: 3600,
                            marketId: null,
                            amount: 150,
                            low: null,
                            high: null,
                            itemVolume: 10,
                            quoteVolume: 1500,
                            estimator: "traded-volume-ratio-v1",
                        },
                    },
                    missing: {},
                }),
            );
        });
        const graph = { ...graphFixture(), league: "Standard" };
        const rates = await fetchListingRates(
            graph,
            ["chaos", "divine", "not-a-currency"],
            fetcher,
        );
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(rates).toEqual({ chaos: 1, divine: 150 });
    });
});
