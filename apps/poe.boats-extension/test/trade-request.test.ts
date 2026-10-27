/** biome-ignore-all lint/style/useNamingConvention: Assertions use HTTP header names. */
import type { ListingBatch } from "@poe-tools/trade-bridge";
import { describe, expect, it, vi } from "vite-plus/test";
import { createStoredBatches } from "@/lib/stored-batches";
import { performTradeRequest } from "@/lib/trade-request";

describe("trade requests", () => {
    it("makes same-origin requests and returns only rate-limit headers", async () => {
        const fetcher = vi.fn(
            async () =>
                new Response(JSON.stringify({ id: "q", result: [], total: 0 }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "X-Rate-Limit-Rules": "Ip",
                        "X-Rate-Limit-Ip": "8:10:60",
                        "Set-Cookie": "POESESSID=secret",
                    },
                }),
        );
        const response = await performTradeRequest(
            { method: "POST", path: "/api/trade/search/Standard", body: { query: {} } },
            fetcher,
        );
        expect(fetcher).toHaveBeenCalledWith("/api/trade/search/Standard", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ query: {} }),
        });
        expect(response).toEqual({
            status: 200,
            headers: { "x-rate-limit-rules": "Ip", "x-rate-limit-ip": "8:10:60" },
            body: { id: "q", result: [], total: 0 },
        });
    });

    it("refuses paths other than trade search and fetch", async () => {
        const fetcher = vi.fn();
        for (const path of ["/my-account", "https://example.com/api/trade/search/Standard"])
            expect(await performTradeRequest({ method: "GET", path }, fetcher)).toMatchObject({
                status: 400,
            });
        expect(fetcher).not.toHaveBeenCalled();
    });
});

describe("stored batches", () => {
    const batch = (batchId: string, extra: Partial<ListingBatch> = {}): ListingBatch => ({
        runId: "run",
        graphId: "graph",
        batchId,
        stageId: "stage",
        stageKey: "key",
        fetches: 1,
        sale: "instant",
        total: 0,
        available: 0,
        listings: [],
        receivedAt: "2026-10-27T10:00:00.000Z",
        ...extra,
    });

    it("keeps batches per graph until removed, and drops old ones", async () => {
        let value: unknown = [];
        const store = {
            get: async () => value,
            set: async (next: ListingBatch[]) => {
                value = next;
            },
        };
        const now = Date.parse("2026-10-28T10:00:00.000Z");
        const stored = createStoredBatches(store, () => now);
        await stored.add(batch("one"));
        await stored.add(batch("two", { graphId: "other" }));
        await stored.add(batch("three", { runId: "active" }));
        await stored.add(batch("old", { receivedAt: "2026-10-01T10:00:00.000Z" }));
        expect((await stored.forGraph("graph", "active")).map((entry) => entry.batchId)).toEqual([
            "one",
        ]);
        await stored.remove(["one"]);
        expect(await stored.forGraph("graph")).toHaveLength(1);
        value = [{ not: "a batch" }];
        expect(await stored.forGraph("graph")).toEqual([]);
    });
});
