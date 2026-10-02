import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { parseMarketQuotes } from "~/services/arbitrage.server";

function exchange(primary = "chaos", rates: Record<string, number> = {}) {
    return {
        core: { primary, rates },
        lines: [
            { id: "clear-oil", primaryValue: 2 },
            { id: "sepia-oil", primaryValue: 8 },
        ],
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});
beforeEach(() => vi.resetModules());

describe("market quote validation", () => {
    it("uses the declared primary currency and converts in the correct direction", () => {
        expect(parseMarketQuotes(exchange(), "1")["clear-oil"].value).toBe(2);
        expect(
            parseMarketQuotes(exchange("divine", { exalted: 500 }), "2")["clear-oil"].value,
        ).toBe(1000);
        expect(parseMarketQuotes(exchange("exalted"), "2")["clear-oil"].value).toBe(2);
    });
    it("rejects unavailable conversions", () => {
        expect(() => parseMarketQuotes(exchange("divine"), "2")).toThrow();
        expect(() => parseMarketQuotes(exchange("divine", { exalted: 0 }), "2")).toThrow();
    });
    it("skips invalid quotes without discarding valid prices", () => {
        const data = exchange();
        data.lines.push(
            { id: "bad", primaryValue: -1 },
            { id: "zero", primaryValue: 0 },
            { id: "infinite", primaryValue: Number.POSITIVE_INFINITY },
        );
        expect(Object.keys(parseMarketQuotes(data, "1"))).toEqual(["clear-oil", "sepia-oil"]);
        expect(() => parseMarketQuotes({ lines: [] }, "1")).toThrow();
    });
});

describe("market loading", () => {
    function mockMarket() {
        const fetchMock = vi.fn(async (input: string | URL | Request) => {
            const url = new URL(String(input));
            if (url.pathname.endsWith("index-state"))
                return Response.json({
                    economyLeagues: [
                        { name: "Standard" },
                        { name: "Current League", indexed: true },
                    ],
                });
            return Response.json(exchange(url.pathname.includes("poe2") ? "exalted" : "chaos"));
        });
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    }
    it("discovers leagues and fetches the correct categories for each game", async () => {
        const fetchMock = mockMarket();
        const { loadArbitrageMarket } = await import("~/services/arbitrage.server");
        expect((await loadArbitrageMarket("1", "Standard")).error).toBeNull();
        const poe2 = await loadArbitrageMarket("2", null);
        expect(poe2.league).toBe("Current League");
        expect(poe2.snapshot?.game).toBe("2");
        const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
        expect(
            urls
                .filter((url) => url.pathname.includes("poe2"))
                .map((url) => url.searchParams.get("type")),
        ).toEqual([null, "Delirium", "Essences", "Runes"]);
    });
    it("does not query prices for an unsupported league", async () => {
        const fetchMock = mockMarket();
        const { loadArbitrageMarket } = await import("~/services/arbitrage.server");
        const result = await loadArbitrageMarket("1", "not-a-league");
        expect(result.error).toContain("not available");
        expect(result.snapshot).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it("retains successful categories when another request fails", async () => {
        const fetchMock = mockMarket();
        fetchMock.mockImplementation(async (input) => {
            const url = new URL(String(input));
            if (url.pathname.endsWith("index-state"))
                return Response.json({ economyLeagues: [{ name: "Standard" }] });
            return url.searchParams.get("type") === "Essence"
                ? new Response(null, { status: 503 })
                : Response.json(exchange());
        });
        const { loadArbitrageMarket } = await import("~/services/arbitrage.server");
        const result = await loadArbitrageMarket("1", "Standard");
        expect(result.error).toBeNull();
        expect(result.snapshot?.unavailableCategories).toEqual(["essences"]);
        expect(result.snapshot?.quotes["clear-oil"].value).toBe(2);
    });
    it("shows an actionable error when the league index is unavailable", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
        const { loadArbitrageMarket } = await import("~/services/arbitrage.server");
        const result = await loadArbitrageMarket("2", null);
        expect(result.snapshot).toBeNull();
        expect(result.error).toContain("retry");
    });
    it("reports empty feeds without inventing prices", async () => {
        const fetchMock = mockMarket();
        fetchMock.mockImplementation(async (input) =>
            String(input).endsWith("index-state")
                ? Response.json({ economyLeagues: [{ name: "Standard" }] })
                : Response.json({ core: { primary: "chaos", rates: {} }, lines: [] }),
        );
        const { loadArbitrageMarket } = await import("~/services/arbitrage.server");
        const result = await loadArbitrageMarket("1", null);
        expect(result.error).toContain("prices are unavailable");
        expect(result.snapshot?.quotes).toEqual({});
    });
    it("isolates leagues and refreshes expired prices without relabeling cached data", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
        const fetchMock = mockMarket();
        const { loadArbitrageMarket } = await import("~/services/arbitrage.server");
        const first = await loadArbitrageMarket("1", "Standard");
        vi.setSystemTime(new Date("2026-10-02T00:02:00Z"));
        const cached = await loadArbitrageMarket("1", "Standard");
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(cached.snapshot?.fetchedAt).toBe(first.snapshot?.fetchedAt);
        await loadArbitrageMarket("1", "Current League");
        expect(fetchMock).toHaveBeenCalledTimes(5);
        vi.setSystemTime(new Date("2026-10-02T00:06:00Z"));
        const refreshed = await loadArbitrageMarket("1", "Standard");
        expect(fetchMock).toHaveBeenCalledTimes(8);
        expect(refreshed.snapshot?.fetchedAt).not.toBe(first.snapshot?.fetchedAt);
    });
});
