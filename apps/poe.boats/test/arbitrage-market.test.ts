import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { TDatabase } from "~/db/client";
import { getMarketExchangeLeagues, getMarketExchangePrices } from "~/db/queries/market.queries";
import { marketExchangeItemId } from "~/lib/market-exchange.server";
import { loadArbitrageMarket } from "~/services/arbitrage.server";

vi.mock("~/db/queries/market.queries", () => ({
    getMarketExchangeLeagues: vi.fn(),
    getMarketExchangePrices: vi.fn(),
}));

const db = {} as TDatabase;
const latestHour = Date.parse("2026-10-29T04:00:00Z") / 1000;
const clearOil = marketExchangeItemId("poe1", "Clear Oil")!;

/** Prices every requested item at 2, or only the items `priced` accepts. */
function mockPrices(priced: (itemId: string) => boolean = () => true) {
    vi.mocked(getMarketExchangePrices).mockImplementation(async (_, { itemIds }) => ({
        latestHour,
        unit: "chaos",
        prices: new Map(
            itemIds.filter(priced).map((itemId) => [itemId, { price: 2, hour: latestHour }]),
        ),
    }));
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMarketExchangeLeagues).mockResolvedValue(["Current League", "Standard"]);
    mockPrices();
});

describe("arbitrage market", () => {
    it("prices each game's recipe items from its exchange in the league that traded last", async () => {
        const poe1 = await loadArbitrageMarket(db, "1", null);
        expect(poe1).toMatchObject({ league: "Current League", error: null });
        expect(poe1.snapshot).toMatchObject({
            game: "1",
            fetchedAt: "2026-10-29T04:00:00.000Z",
            unavailableCategories: [],
        });
        expect(poe1.snapshot?.quotes["clear-oil"]).toEqual({ value: 2 });
        expect(poe1.snapshot?.quotes.wisdom).toEqual({ value: 2 });
        const [, request] = vi.mocked(getMarketExchangePrices).mock.calls[0]!;
        expect(request).toMatchObject({ realm: "pc", league: "Current League" });
        expect(request.itemIds).toContain(clearOil);

        const poe2 = await loadArbitrageMarket(db, "2", "Standard");
        expect(poe2.league).toBe("Standard");
        expect(getMarketExchangeLeagues).toHaveBeenLastCalledWith(db, "poe2");
        expect(vi.mocked(getMarketExchangePrices).mock.calls[1]![1].realm).toBe("poe2");
        expect(poe2.snapshot?.quotes["diluted-liquid-ire"]).toEqual({ value: 2 });
    });

    it("does not query prices for an unsupported league", async () => {
        const result = await loadArbitrageMarket(db, "1", "not-a-league");
        expect(result.error).toContain("not available");
        expect(result.snapshot).toBeNull();
        expect(getMarketExchangePrices).not.toHaveBeenCalled();
    });

    it("explains when no league has exchange prices", async () => {
        vi.mocked(getMarketExchangeLeagues).mockResolvedValue([]);
        const result = await loadArbitrageMarket(db, "2", null);
        expect(result.snapshot).toBeNull();
        expect(result.error).toContain("retry");
    });

    it("lists categories whose recipe inputs have no price", async () => {
        mockPrices((itemId) => itemId === clearOil);
        const result = await loadArbitrageMarket(db, "1", null);
        expect(result.error).toBeNull();
        expect(result.snapshot?.unavailableCategories).toEqual(["currency", "essences"]);
        expect(Object.keys(result.snapshot?.quotes ?? {})).toEqual(["clear-oil"]);
    });

    it("reports a league without prices without inventing any", async () => {
        mockPrices(() => false);
        const result = await loadArbitrageMarket(db, "1", null);
        expect(result.error).toContain("prices are unavailable");
        expect(result.snapshot?.quotes).toEqual({});
    });
});
