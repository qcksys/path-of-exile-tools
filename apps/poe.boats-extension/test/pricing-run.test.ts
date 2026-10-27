import type {
    ExtensionMessage,
    ListingBatch,
    StageDecision,
    TradeGame,
} from "@poe-tools/trade-bridge";
import { describe, expect, it } from "vite-plus/test";
import type { TradeRequest, TradeResponse } from "@/lib/messages";
import { runPricing, type StartRun } from "@/lib/pricing-run";
import { RateLimiter } from "@/lib/rate-limit";

const ids = (count: number, prefix = "id") =>
    Array.from({ length: count }, (_, index) => `${prefix}${index}`);
const entry = (id: string, amount = 5) => ({
    id,
    listing: {
        indexed: "2026-10-27T10:00:00Z",
        price: { amount, currency: "chaos" },
        account: { name: "Seller#1" },
        whisper: "@Seller hi",
    },
    item: { baseType: "Plate Vest", rarity: "Rare", note: "~b/o 5 chaos" },
});
const ok = (body: unknown, headers: Record<string, string> = {}): TradeResponse => ({
    status: 200,
    headers,
    body,
});

function start(stages: Partial<StartRun["stages"][number]>[] = [{}]): StartRun {
    return {
        kind: "startRun",
        runId: "run",
        graphId: "graph",
        game: "poe2",
        league: "Standard",
        stages: stages.map((stage, index) => ({
            stageId: `stage-${index}`,
            stageKey: `key-${index}`,
            name: `Stage ${index}`,
            instant: { query: { status: { option: "securable" } } },
            ...stage,
        })),
    };
}

function harness(
    respond: (request: TradeRequest, count: number) => TradeResponse,
    decisions: StageDecision[] = [],
) {
    let clock = 0;
    let batch = 0;
    let cancelled = false;
    const requests: { game: TradeGame; request: TradeRequest; at: number }[] = [];
    const sleeps: number[] = [];
    const messages: ExtensionMessage[] = [];
    const batches: ListingBatch[] = [];
    return {
        requests,
        sleeps,
        messages,
        batches,
        cancel: () => {
            cancelled = true;
        },
        dependencies: {
            request: async (game: TradeGame, request: TradeRequest) => {
                requests.push({ game, request, at: clock });
                clock += 100;
                return respond(request, requests.length);
            },
            sleep: async (ms: number) => {
                sleeps.push(ms);
                clock += ms;
            },
            now: () => clock,
            emit: (message: ExtensionMessage) => messages.push(message),
            decide: async (listingBatch: ListingBatch) => {
                batches.push(listingBatch);
                return decisions.shift() ?? "done";
            },
            cancelled: () => cancelled,
            id: () => `batch-${batch++}`,
        },
    };
}

const searchThenFetch = (total: number) => (request: TradeRequest) =>
    request.method === "POST"
        ? ok({ id: "query", result: ids(Math.min(total, 100)), total })
        : ok({
              result: request.path
                  .split("/")
                  .at(-1)!
                  .split("?")[0]!
                  .split(",")
                  .map((id) => entry(id)),
          });

describe("pricing run", () => {
    it("searches, fetches ten listings and hands scrubbed listings to the page", async () => {
        const run = harness(searchThenFetch(42));
        await runPricing(start(), new RateLimiter(), run.dependencies);
        expect(run.requests.map(({ request }) => [request.method, request.path])).toEqual([
            ["POST", "/api/trade2/search/poe2/Standard"],
            ["GET", `/api/trade2/fetch/${ids(10).join(",")}?query=query&realm=poe2`],
        ]);
        expect(run.batches).toHaveLength(1);
        expect(run.batches[0]).toMatchObject({
            stageId: "stage-0",
            stageKey: "key-0",
            sale: "instant",
            total: 42,
            available: 42,
            fetches: 1,
        });
        expect(run.batches[0]!.listings[0]).toEqual({
            id: "id0",
            indexed: "2026-10-27T10:00:00Z",
            price: { amount: 5, currency: "chaos" },
            sale: "instant",
            item: { baseType: "Plate Vest", rarity: "Rare" },
        });
        expect(run.messages.at(-1)).toEqual({
            kind: "runFinished",
            runId: "run",
            graphId: "graph",
            outcome: "done",
        });
    });

    it("fetches a second page when asked, and never a third", async () => {
        const run = harness(searchThenFetch(100), ["more", "more"]);
        await runPricing(start(), new RateLimiter(), run.dependencies);
        expect(run.requests.filter(({ request }) => request.method === "GET")).toHaveLength(2);
        expect(run.requests[2]!.request.path).toContain(ids(20).slice(10).join(","));
        expect(run.batches.map((batch) => batch.fetches)).toEqual([1, 2]);
    });

    it("does not fetch more than the search returned", async () => {
        const run = harness(searchThenFetch(7), ["more"]);
        await runPricing(start(), new RateLimiter(), run.dependencies);
        expect(run.requests.filter(({ request }) => request.method === "GET")).toHaveLength(1);
    });

    it("reports an empty search without fetching", async () => {
        const run = harness(searchThenFetch(0));
        await runPricing(start(), new RateLimiter(), run.dependencies);
        expect(run.requests).toHaveLength(1);
        expect(run.batches[0]).toMatchObject({ total: 0, listings: [] });
    });

    it("runs the in-person search only when the page asks and the stage has one", async () => {
        const inPerson = { query: { status: { option: "online" } } };
        const run = harness(searchThenFetch(5), ["in-person", "done"]);
        await runPricing(start([{ inPerson }, {}]), new RateLimiter(), run.dependencies);
        const searches = run.requests.filter(({ request }) => request.method === "POST");
        expect(searches.map(({ request }) => request.method === "POST" && request.body)).toEqual([
            start().stages[0]!.instant,
            inPerson,
            start().stages[0]!.instant,
        ]);
        expect(run.batches.map((batch) => [batch.stageId, batch.sale])).toEqual([
            ["stage-0", "instant"],
            ["stage-0", "in-person"],
            ["stage-1", "instant"],
        ]);
        const withoutInPerson = harness(searchThenFetch(5), ["in-person"]);
        await runPricing(start(), new RateLimiter(), withoutInPerson.dependencies);
        expect(withoutInPerson.requests).toHaveLength(2);
    });

    it("waits for the rate limit and tells the page until when", async () => {
        const limits = {
            "x-rate-limit-rules": "Ip",
            "x-rate-limit-ip": "3:10:60",
            "x-rate-limit-ip-state": "2:10:0",
        };
        const run = harness((request) =>
            request.method === "POST"
                ? ok({ id: "query", result: ids(1), total: 1 }, limits)
                : ok({ result: [entry("id0")] }, limits),
        );
        await runPricing(start([{}, {}]), new RateLimiter(), run.dependencies);
        const searches = run.requests.filter(({ request }) => request.method === "POST");
        expect(searches[1]!.at - searches[0]!.at).toBeGreaterThanOrEqual(10_000);
        expect(run.messages).toContainEqual(
            expect.objectContaining({ kind: "progress", step: "waiting", stageId: "stage-1" }),
        );
    });

    it.each([
        [401, { signIn: true }],
        [403, { signIn: true }],
        [429, { retryAt: new Date(100 + 30_000).toISOString() }],
        [400, {}],
        [500, {}],
    ])("stops the whole run on a %i response", async (status, details) => {
        const run = harness(() => ({ status, headers: { "retry-after": "30" }, body: null }));
        await runPricing(start([{}, {}]), new RateLimiter(), run.dependencies);
        expect(run.requests).toHaveLength(1);
        expect(run.batches).toHaveLength(0);
        expect(run.messages.at(-1)).toMatchObject({
            kind: "runFinished",
            outcome: "stopped",
            ...details,
        });
    });

    it("stops when the trade site's response shape changes", async () => {
        const run = harness(() => ok({ unexpected: true }));
        await runPricing(start(), new RateLimiter(), run.dependencies);
        expect(run.messages.at(-1)).toMatchObject({
            outcome: "stopped",
            reason: expect.stringContaining("not recognised"),
        });
    });

    it("stops before the next request after a cancel", async () => {
        const run = harness(searchThenFetch(5));
        const decide = run.dependencies.decide;
        run.dependencies.decide = async (batch) => {
            run.cancel();
            return decide(batch);
        };
        await runPricing(start([{}, {}]), new RateLimiter(), run.dependencies);
        expect(run.requests).toHaveLength(2);
        expect(run.messages.at(-1)).toMatchObject({ outcome: "cancelled" });
    });
});
