import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SCARABS } from "~/data/scarab-data";
import type { TDatabase } from "~/db/client";
import { getMarketExchangePrices } from "~/db/queries/market.queries";
import { marketExchangeItemId } from "~/lib/market-exchange.server";
import { getScarabPrices } from "~/operations/shares.server";

vi.mock("~/db/queries/market.queries", () => ({ getMarketExchangePrices: vi.fn() }));

const db = {} as TDatabase;
const latestHour = Date.parse("2026-10-29T04:00:00Z") / 1000;
const breach = SCARABS.find((scarab) => scarab.id === "breach_scarab_of_the_dreamer")!;
const breachId = marketExchangeItemId("poe1", breach.name.en)!;

beforeEach(() => vi.clearAllMocks());

describe("scarab prices", () => {
    it("prices scarabs in chaos from the league's PC exchange, keyed by scarab ID", async () => {
        vi.mocked(getMarketExchangePrices).mockResolvedValue({
            latestHour,
            unit: "chaos",
            prices: new Map([[breachId, { price: 12.5, hour: latestHour - 3600 }]]),
        });
        const result = await getScarabPrices({ db }, { league: "Allflame" });
        expect(result).toEqual({
            league: "Allflame",
            prices: { [breach.id]: { name: breach.name.en, chaosValue: 12.5 } },
            updatedAt: "2026-10-29T04:00:00.000Z",
        });
        const [, request] = vi.mocked(getMarketExchangePrices).mock.calls[0]!;
        expect(request).toMatchObject({ realm: "pc", league: "Allflame" });
        expect(request.itemIds).toContain(breachId);
        expect(request.itemIds.every((id) => id.startsWith("Metadata/Items/"))).toBe(true);
    });

    it("refuses a league without any scarab price", async () => {
        vi.mocked(getMarketExchangePrices).mockResolvedValue({
            latestHour,
            unit: "chaos",
            prices: new Map(),
        });
        await expect(getScarabPrices({ db }, { league: "Allflame" })).rejects.toMatchObject({
            status: 404,
        });
    });
});
